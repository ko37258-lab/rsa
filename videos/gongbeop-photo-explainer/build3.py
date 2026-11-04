"""'만드는 방법' 영상 — 일레븐랩스 v4 「상철오빠」 음성판
tts3/<장면>_a.mp3, <장면>_b.mp3 (장면 단위 두 테이크) 중 대본과 더 맞고 잘리지 않은 테이크를 골라
-> 문장 경계(단어 사이 쉼) -> public/voice2.wav, src/timeline2.json, src/subs2.json, src/wave2.json

사용법: python3 build3.py   (음성 파일은 일레븐랩스에서 미리 받아 tts3/ 에 둔다)
"""
import difflib, json, os, re, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(ROOT, 'script2.json'), encoding='utf-8'))
TTS = os.path.join(ROOT, 'tts3')
SR = 44100
norm = lambda x: re.sub(r"[\s\.,!?'\"·…~\-‘’“”%()|]", '', x)


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def cut_ratio(a):
    return float(np.abs(a[-int(SR * 0.05):]).max() / max(1e-6, np.abs(a).max()))


def trim(a, thr=0.012, pad=0.04):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    return a[max(0, idx[0] - int(SR * pad)):min(len(a), idx[-1] + int(SR * pad * 2))]


def say11(i, st):
    if str(i) in S.get('say11', {}): return S['say11'][str(i)]
    return st.get('show', st['say']).replace('|', '').replace("'", '').replace('  ', ' ')


from faster_whisper import WhisperModel
m = WhisperModel(os.environ.get('WHISPER', 'medium'), device='cpu', compute_type='int8')


def words_of(a, offset=0.0):
    a16 = np.interp(np.arange(0, len(a), SR / 16000), np.arange(len(a)), a).astype(np.float32)
    segs, _ = m.transcribe(a16, language='ko', word_timestamps=True, beam_size=5)
    return [{'w': w.word.strip(), 's': round(offset + w.start, 3), 'e': round(offset + w.end, 3)} for sg in segs for w in sg.words if w.word.strip()]


# 1) 장면별 테이크 고르기
sents, blocks, gi = [], [], 0
for sc in S['scenes']:
    if sc['kind'] == 'clipA':
        blocks.append(('clip', sc)); continue
    ss = []
    for st in sc['sents']:
        s = {'scene': sc['id'], 'say': say11(gi, st), 'show': st.get('show', st['say']), 'ev': st.get('ev', []), 'panel': st.get('panel')}
        sents.append(s); ss.append(s); gi += 1
    text = ' '.join(x['say'] for x in ss)
    best = None
    for take in 'ab':
        path = os.path.join(TTS, f"{sc['id']}_{take}.mp3")
        a = load(path); r = cut_ratio(a); a = trim(a)
        ws = words_of(a)
        sim = difflib.SequenceMatcher(None, norm(text), norm(''.join(w['w'] for w in ws))).ratio()
        score = sim - (0.5 if r > 0.12 else 0)
        print(f"{sc['id']:6s} take {take}: {len(a) / SR:5.2f}s cut {r:.2f} match {sim:.3f}")
        if best is None or score > best[0]: best = (score, take, a, ws)
    print(f"  -> {sc['id']} take {best[1]}")
    blocks.append(('scene', {'id': sc['id'], 'take': best[1], 'audio': best[2], 'words': best[3], 'sents': ss}))

# 2) 이어 붙이기
buf = [np.zeros(int(SR * S['lead']), np.float32)]; t = S['lead']; clips = []; first = True
for kind, b in blocks:
    if not first: buf.append(np.zeros(int(SR * S['sceneGap']), np.float32)); t += S['sceneGap']
    first = False
    if kind == 'clip':
        dur = sum(e - s for s, e in b['segs'])
        clips.append({'scene': b['id'], 's': round(t, 3), 'e': round(t + dur, 3), 'segs': b['segs']})
        buf.append(np.zeros(int(SR * dur), np.float32)); t += dur; continue
    b['t0'] = t; buf.append(b['audio']); t += len(b['audio']) / SR
    ws = [{**w, 's': round(w['s'] + b['t0'], 3), 'e': round(w['e'] + b['t0'], 3)} for w in b['words']]
    # 문장 경계: 대본 글자와 인식 글자를 맞대어 정렬한 뒤, 경계 바로 앞뒤 1단어 안에서 가장 긴 쉼으로 옮김
    Tn = ''.join(norm(x['say']) for x in b['sents'])
    Wn = ''; owner = []
    for wi, w in enumerate(ws):
        nw = norm(w['w']); Wn += nw; owner += [wi] * len(nw)
    sm = difflib.SequenceMatcher(None, Tn, Wn, autojunk=False)
    blocks_m = [(x.a, x.b, x.size) for x in sm.get_matching_blocks() if x.size]
    def tmap(c):
        prev = (0, 0)
        for a0, b0, sz in blocks_m:
            if a0 <= c < a0 + sz: return b0 + (c - a0)
            if a0 > c:  # 두 일치 구간 사이: 비율로 보간
                (pa, pb) = prev
                return int(round(pb + (c - pa) * (b0 - pb) / max(1, a0 - pa)))
            prev = (a0 + sz, b0 + sz)
        return len(Wn)
    cuts = [0]; acc = 0
    for k in range(1, len(b['sents'])):
        acc += len(norm(b['sents'][k - 1]['say']))
        j = tmap(acc)
        wi = owner[j] if j < len(owner) else len(ws) - 1
        start_of = next(i for i in range(len(owner)) if owner[i] == wi)
        if j - start_of > len(norm(ws[wi]['w'])) / 2: wi += 1  # 단어 뒤쪽이면 다음 단어부터
        cand = [i for i in (wi - 1, wi, wi + 1) if cuts[-1] < i < len(ws)]
        wi = max(cand, key=lambda i: (ws[i]['s'] - ws[i - 1]['e']) - (0.12 if i != wi else 0)) if cand else wi
        cuts.append(wi)
    cuts.append(len(ws))
    for k in range(1, len(b['sents'])):  # '하나, 둘, 셋, 넷'이 숫자로 인식돼 앞 문장 끝에 붙은 경우 다음 문장으로
        if re.match(r'^(하나|둘|셋|넷)', b['sents'][k]['say']) and cuts[k] - 1 > cuts[k - 1] and re.fullmatch(r'\d+\.?', ws[cuts[k] - 1]['w']):
            cuts[k] -= 1
    for k, s in enumerate(b['sents']):
        s['words'] = ws[cuts[k]:cuts[k + 1]] or [{'w': s['say'], 's': round(b['t0'], 3), 'e': round(t, 3)}]
        s['s'] = round(max(b['t0'], s['words'][0]['s'] - 0.05), 3); s['e'] = round(s['words'][-1]['e'], 3)
    b['sents'][-1]['e'] = round(max(b['sents'][-1]['e'], t - 0.02), 3)
buf.append(np.zeros(int(SR * S['tail']), np.float32)); t += S['tail']
voice = np.concatenate(buf)
with wave.open(os.path.join(ROOT, 'public', 'voice2.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())
total = round(len(voice) / SR, 2)
print('voice2.wav', total, 's')
for i, s in enumerate(sents): print(f'{i:02d} {s["s"]:6.2f}-{s["e"]:6.2f} | {" ".join(w["w"] for w in s["words"])}')


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


# 3) 자막
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

# 4) 장면 · 화면 · 이벤트
items = sorted([(s['s'], s['e'], s['scene']) for s in sents] + [(c['s'], c['e'], c['scene']) for c in clips])
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
        if 'sync' in p:  # 완성 영상 속 시점(src)이 이 문장의 키워드와 겹치도록 시작점 계산
            p['from'] = round(p['sync']['src'] - (kw_time(s, p['sync']['kw']) - p['at']), 3)
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
for e in events:
    if e['type'] == 'hi':
        nx = [x['at'] for x in events if x['type'] == 'hi' and x['at'] > e['at'] + 0.05 and x['i'] != e['i']]
        if nx: e['end'] = min(e['end'], nx[0] - 0.05)

steps = [{'from': scenes[sc['id']]['from'], 'to': scenes[sc['id']]['to'], **sc['step']} for sc in S['scenes'] if sc.get('step')]
merged = []
for st in steps:
    if merged and merged[-1]['a'] == st['a'] and merged[-1]['b'] == st['b'] and abs(merged[-1]['to'] - st['from']) < 0.01: merged[-1]['to'] = st['to']
    else: merged.append(st)
tl = {'duration': total, 'sentences': [{k: s[k] for k in ('scene', 's', 'e', 'show')} for s in sents],
      'scenes': scenes, 'steps': merged, 'events': events, 'panels': panels, 'images': S['images'],
      'voice': S.get('voice11'), 'takes': {b['id']: b['take'] for k, b in blocks if k == 'scene'}}
json.dump(tl, open(os.path.join(ROOT, 'src', 'timeline2.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

pk = np.abs(load(os.path.join(ROOT, 'public', 'voice.wav'))); n = 240; L = len(pk) // n
json.dump([round(float(pk[i * L:(i + 1) * L].max()), 3) for i in range(n)], open(os.path.join(ROOT, 'src', 'wave2.json'), 'w'))
print('timeline2', total, 's |', len(sents), 'sentences |', len(panels), 'panels |', len(events), 'events |', len(subs), 'subs')
print('clipV', [p for p in panels if p['type'] == 'clipV'])
