"""'만드는 방법' 영상용: script2.json -> Fish Audio 음성 -> 잘림 검사 -> 이어 붙이기(완성 영상 구간은 무음 자리)
-> 음성인식 단어 시점 -> public/voice2.wav, src/timeline2.json, src/subs2.json

사용법: FISH_API_KEY=<키> python3 build2.py   (또는 FISH_KEY_FILE=<키 파일>)
"""
import hashlib, json, os, re, subprocess, time, urllib.request, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(ROOT, 'script2.json'), encoding='utf-8'))
V = S['voice']
KEY = os.environ.get('FISH_API_KEY') or open(os.environ['FISH_KEY_FILE']).read().strip()
TTS = os.path.join(ROOT, 'tts2'); os.makedirs(TTS, exist_ok=True)
SR = 44100


def fish(text, out):
    body = {'text': text, 'reference_id': V['reference_id'], 'format': 'wav', 'normalize': True,
            'latency': 'normal', 'prosody': {'speed': V['speed'], 'volume': 0}}
    for k in range(4):
        try:
            req = urllib.request.Request('https://api.fish.audio/v1/tts', data=json.dumps(body).encode(),
                                         headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'model': V['model']})
            open(out, 'wb').write(urllib.request.urlopen(req, timeout=180).read())
            return
        except Exception as e:
            print('  retry', k, e); time.sleep(2 ** (k + 1))
    raise SystemExit('TTS failed: ' + text)


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def cut_ratio(a):
    return float(np.abs(a[-int(SR * 0.05):]).max() / max(1e-6, np.abs(a).max()))


def trim(a, thr=0.012, pad=0.04):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    return a[max(0, idx[0] - int(SR * pad)):min(len(a), idx[-1] + int(SR * pad * 2))]


# 1) 문장별 음성 (장면 순서대로, 완성 영상 구간은 자리만 비움)
blocks = []  # ('sent', dict) | ('clip', scene)
sents = []
for sc in S['scenes']:
    if sc['kind'] == 'clipA':
        blocks.append(('clip', sc)); continue
    for st in sc['sents']:
        s = {'scene': sc['id'], 'say': st['say'], 'show': st.get('show', st['say']), 'ev': st.get('ev', []), 'panel': st.get('panel')}
        sents.append(s); blocks.append(('sent', s))

for i, s in enumerate(sents):
    h = hashlib.md5((s['say'] + json.dumps(V, sort_keys=True)).encode()).hexdigest()[:10]
    path = os.path.join(TTS, f'{i:02d}_{h}.wav')
    for attempt in range(4):
        if not os.path.exists(path):
            print(f'TTS {i:02d} {s["say"]}'); fish(s['say'], path)
        a = load(path); r = cut_ratio(a)
        if r <= 0.12 or attempt == 3: break
        print(f'  cut {r:.2f} -> regenerate'); os.remove(path)
    if r > 0.12: print(f'  WARNING sentence {i} still cut ({r:.2f})')
    s['path'] = path; s['audio'] = trim(a)

# 2) 이어 붙이기
buf = [np.zeros(int(SR * S['lead']), np.float32)]; t = S['lead']; prev_scene = None; clips = []
for kind, b in blocks:
    sid = b['scene'] if kind == 'sent' else b['id']
    if prev_scene is not None:
        g = S['sceneGap'] if sid != prev_scene else S['gap']
        buf.append(np.zeros(int(SR * g), np.float32)); t += g
    if kind == 'sent':
        b['s'] = round(t, 3); t += len(b['audio']) / SR; b['e'] = round(t, 3); buf.append(b['audio'])
    else:
        dur = sum(e - s for s, e in b['segs'])
        clips.append({'scene': b['id'], 's': round(t, 3), 'e': round(t + dur, 3), 'segs': b['segs']})
        buf.append(np.zeros(int(SR * dur), np.float32)); t += dur
    prev_scene = sid
buf.append(np.zeros(int(SR * S['tail']), np.float32)); t += S['tail']
voice = np.concatenate(buf)
with wave.open(os.path.join(ROOT, 'public', 'voice2.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())
total = round(len(voice) / SR, 2)
print('voice2.wav', total, 's')

# 3) 음성인식 단어 시점
from faster_whisper import WhisperModel
m = WhisperModel(os.environ.get('WHISPER', 'medium'), device='cpu', compute_type='int8')
norm = lambda x: re.sub(r"[\s\.,!?'\"·…~\-‘’“”%()|]", '', x)
for i, s in enumerate(sents):
    a = s['audio']
    a16 = np.interp(np.arange(0, len(a), SR / 16000), np.arange(len(a)), a).astype(np.float32)
    segs, _ = m.transcribe(a16, language='ko', word_timestamps=True, beam_size=5)
    ws = [{'w': w.word.strip(), 's': round(s['s'] + w.start, 3), 'e': round(s['s'] + w.end, 3)} for sg in segs for w in sg.words if w.word.strip()]
    s['words'] = ws or [{'w': s['say'], 's': s['s'], 'e': s['e']}]
    print(f'{i:02d} {s["s"]:6.2f}-{s["e"]:6.2f} | {" ".join(w["w"] for w in s["words"])}')


def frac_to_time(s, frac, edge='s'):
    ws = s['words']; L = [len(norm(w['w'])) or 1 for w in ws]; tot = sum(L); acc = 0
    for w, l in zip(ws, L):
        if frac * tot < acc + l - 1e-6 or w is ws[-1]: return w[edge]
        acc += l
    return ws[-1][edge]


def kw_time(s, kw):
    k = norm(kw); first = norm(kw.split()[0])
    for w in s['words']:
        nw = norm(w['w'])
        if nw and (k in nw or (len(nw) >= 2 and k.startswith(nw)) or (' ' in kw and nw == first)): return w['s']
    say = norm(s['say']); j = say.find(k)
    if j < 0: print('  kw not found:', kw, 'in', s['say']); return s['s']
    return frac_to_time(s, j / max(1, len(say)))


def chunks_of(text, lim=33):
    text = text.strip()
    if '|' in text: return [c for part in text.split('|') for c in chunks_of(part, lim)]
    if len(text) <= lim: return [text]
    q = 0; cands = []
    for k, ch in enumerate(text):
        if ch == "'": q ^= 1
        if ch == ' ' and not q: cands.append((k, text[k - 1] == ','))
    mid = len(text) / 2
    best = min(cands, key=lambda c: abs(c[0] - mid) - (len(text) * 0.3 if c[1] else 0))
    return chunks_of(text[:best[0]], lim) + chunks_of(text[best[0] + 1:], lim)


# 4) 자막
starts = sorted([s['s'] for s in sents] + [c['s'] for c in clips])
subs = []
for s in sents:
    nxt = next((x for x in starts if x > s['s'] + 0.01), total)
    ch = chunks_of(s['show']); tot = len(norm(s['show'])); acc = 0; times = []
    for c in ch:
        times.append(s['s'] if not times else frac_to_time(s, acc / tot) - 0.06); acc += len(norm(c))
    for k, c in enumerate(ch):
        st = times[k]; en = times[k + 1] if k + 1 < len(ch) else min(nxt, s['e'] + 0.6)
        ww = [{'s': round(w['s'] - 0.06, 3), 'e': round(min(w['e'], en), 3)} for w in s['words'] if st - 0.05 <= w['s'] < en - 0.05]
        subs.append({'t': c, 's': round(st, 3), 'e': round(en, 3), 'w': ww})
json.dump(subs, open(os.path.join(ROOT, 'src', 'subs2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 5) 장면 · 화면(panel) · 이벤트
items = [(b['s'], b['e'], b['scene']) for k, b in blocks if k == 'sent'] + [(c['s'], c['e'], c['scene']) for c in clips]
items.sort()
scenes = {}
for s0, e0, sid in items:
    sc = scenes.setdefault(sid, {'from': s0, 'to': e0}); sc['to'] = max(sc['to'], e0)
ids = [sc['id'] for sc in S['scenes']]
for k, sid in enumerate(ids):
    scenes[sid]['from'] = 0 if k == 0 else round(scenes[ids[k - 1]]['to'] + (scenes[sid]['from'] - scenes[ids[k - 1]]['to']) * 0.45, 3)
for k, sid in enumerate(ids):
    scenes[sid]['to'] = scenes[ids[k + 1]]['from'] if k + 1 < len(ids) else total

panels = []
for s in sents:
    if s['panel']:
        p = dict(s['panel']); p['scene'] = s['scene']
        p['at'] = scenes[s['scene']]['from'] if s is next(x for x in sents if x['scene'] == s['scene']) else round(s['s'] - 0.15, 3)
        panels.append(p)
for c in clips: panels.append({'type': 'clipA', 'scene': c['scene'], 'at': scenes[c['scene']]['from'], 'clipStart': c['s'], 'segs': c['segs']})
panels.sort(key=lambda p: p['at'])
for k, p in enumerate(panels): p['end'] = panels[k + 1]['at'] if k + 1 < len(panels) else total

events = []
for i, s in enumerate(sents):
    for ev in s['ev']:
        e = dict(ev); e['i'] = i; e['scene'] = s['scene']
        at = kw_time(s, ev['kw']) if ev.get('kw') else s['s']
        e['at'] = round(at - (0.25 if e['type'] == 'cam' and ev.get('kw') else 0), 3)
        if e['type'] == 'cam': e['d'] = ev.get('d', 0.9)
        e['end'] = round(s['e'] + 0.35, 3)
        events.append(e)
for e in events:  # 같은 문장 강조는 누적, 다음 문장 강조가 오면 그 직전까지
    if e['type'] == 'hi':
        nx = [x['at'] for x in events if x['type'] == 'hi' and x['at'] > e['at'] + 0.05 and x['i'] != e['i']]
        if nx: e['end'] = min(e['end'], nx[0] - 0.05)

steps = [{'from': scenes[sc['id']]['from'], 'to': scenes[sc['id']]['to'], **sc['step']} for sc in S['scenes'] if sc.get('step')]
# 같은 제목이 이어지면 하나로 합침
merged = []
for st in steps:
    if merged and merged[-1]['a'] == st['a'] and merged[-1]['b'] == st['b'] and abs(merged[-1]['to'] - st['from']) < 0.01: merged[-1]['to'] = st['to']
    else: merged.append(st)
tl = {'duration': total, 'sentences': [{k: s[k] for k in ('scene', 's', 'e', 'show')} for s in sents],
      'scenes': scenes, 'steps': merged, 'events': events, 'panels': panels, 'images': S['images']}
json.dump(tl, open(os.path.join(ROOT, 'src', 'timeline2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 음성 파형(파이프라인 화면용, 완성 영상의 목소리)
pk = np.abs(load(os.path.join(ROOT, 'public', 'voice.wav'))); n = 240; L = len(pk) // n
json.dump([round(float(pk[i * L:(i + 1) * L].max()), 3) for i in range(n)], open(os.path.join(ROOT, 'src', 'wave2.json'), 'w'))
print('timeline2', total, 's |', len(sents), 'sentences |', len(panels), 'panels |', len(events), 'events |', len(subs), 'subs')
