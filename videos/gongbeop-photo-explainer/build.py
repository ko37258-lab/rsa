"""script.json -> Fish Audio 음성(문장별) -> 잘림 검사 -> 이어 붙이기 -> 음성인식 단어 시점
-> public/voice.wav, src/timeline.json, src/subs.json

사용법: FISH_API_KEY=<키> python3 build.py   (또는 FISH_KEY_FILE=<키 파일>)
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.request, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(ROOT, 'script.json'), encoding='utf-8'))
V = S['voice']
KEY = os.environ.get('FISH_API_KEY') or open(os.environ['FISH_KEY_FILE']).read().strip()
TTS = os.path.join(ROOT, 'tts'); os.makedirs(TTS, exist_ok=True)
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
    # 44.1k mono float 로 통일
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def cut_ratio(a):
    # 끝 0.05초 피크 / 전체 피크 > 0.12 면 말끝이 잘린 것
    return float(np.abs(a[-int(SR * 0.05):]).max() / max(1e-6, np.abs(a).max()))


def trim(a, thr=0.012, pad=0.04):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    s = max(0, idx[0] - int(SR * pad)); e = min(len(a), idx[-1] + int(SR * pad * 2))
    return a[s:e]


# 1) 문장별 음성
sents = []
for sc in S['scenes']:
    for st in sc['sents']:
        sents.append({'scene': sc['id'], 'say': st['say'], 'show': st.get('show', st['say']), 'ev': st.get('ev', [])})

clips = []
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
    clips.append((path, trim(a)))

# 2) 이어 붙이기 (문장 사이 gap, 장면 사이 sceneGap)
buf = [np.zeros(int(SR * S['lead']), np.float32)]; t = S['lead']
for i, (path, a) in enumerate(clips):
    if i:
        g = S['sceneGap'] if sents[i]['scene'] != sents[i - 1]['scene'] else S['gap']
        buf.append(np.zeros(int(SR * g), np.float32)); t += g
    sents[i]['s'] = round(t, 3); t += len(a) / SR; sents[i]['e'] = round(t, 3); buf.append(a)
buf.append(np.zeros(int(SR * S['tail']), np.float32)); t += S['tail']
voice = np.concatenate(buf)
os.makedirs(os.path.join(ROOT, 'public'), exist_ok=True)
with wave.open(os.path.join(ROOT, 'public', 'voice.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(voice, -1, 1) * 32767).astype(np.int16).tobytes())
total = round(len(voice) / SR, 2)
print('voice.wav', total, 's')

# 3) 문장별 음성인식 -> 단어 시점 (실측)
from faster_whisper import WhisperModel
m = WhisperModel(os.environ.get('WHISPER', 'medium'), device='cpu', compute_type='int8')
norm = lambda x: re.sub(r"[\s\.,!?'\"·…~\-‘’“”%()|]", '', x)
for i, (path, a) in enumerate(clips):
    a16 = np.interp(np.arange(0, len(a), SR / 16000), np.arange(len(a)), a).astype(np.float32)
    segs, _ = m.transcribe(a16, language='ko', word_timestamps=True, beam_size=5)
    ws = [{'w': w.word.strip(), 's': round(sents[i]['s'] + w.start, 3), 'e': round(sents[i]['s'] + w.end, 3)} for sg in segs for w in sg.words if w.word.strip()]
    if not ws: ws = [{'w': sents[i]['say'], 's': sents[i]['s'], 'e': sents[i]['e']}]
    sents[i]['words'] = ws
    print(f'{i:02d} {sents[i]["s"]:6.2f}-{sents[i]["e"]:6.2f} | {" ".join(w["w"] for w in ws)}')


def frac_to_time(s, frac, edge='s'):
    """문장 안 글자 비율(0~1) -> 그 위치를 말하는 단어의 시작(또는 끝) 시점"""
    ws = s['words']; L = [len(norm(w['w'])) or 1 for w in ws]; tot = sum(L); acc = 0
    for w, l in zip(ws, L):
        if frac * tot < acc + l - 1e-6 or w is ws[-1]:
            return w[edge]
        acc += l
    return ws[-1][edge]


def kw_time(s, kw):
    # 1) 음성인식 단어에서 키워드를 직접 찾는다 (숫자 읽기처럼 글자 수가 달라도 정확)
    k = norm(kw); first = norm(kw.split()[0])
    for w in s['words']:
        nw = norm(w['w'])
        if nw and (k in nw or (len(nw) >= 2 and k.startswith(nw)) or (' ' in kw and nw == first)):
            return w['s']
    # 2) 없으면 대본 글자 비율로 추정
    say = norm(s['say']); j = say.find(k)
    if j < 0: print('  kw not found:', kw, 'in', s['say']); return s['s']
    return frac_to_time(s, j / max(1, len(say)))


# 4) 자막 조각 (보이는 글자는 show, 시점은 단어 실측)
def chunks_of(text, lim=33):
    """한 줄 lim 자 이내. 넘으면 가운데에 가까운 쉼표(없으면 띄어쓰기)에서 둘로 나눔. 따옴표 안은 자르지 않음"""
    text = text.strip()
    if '|' in text: return [c for part in text.split('|') for c in chunks_of(part, lim)]  # 직접 지정한 줄바꿈
    if len(text) <= lim: return [text]
    q = 0; cands = []
    for k, ch in enumerate(text):
        if ch == "'": q ^= 1
        if ch == ' ' and not q: cands.append((k, text[k - 1] == ','))
    mid = len(text) / 2
    best = min(cands, key=lambda c: abs(c[0] - mid) - (len(text) * 0.3 if c[1] else 0))
    return chunks_of(text[:best[0]], lim) + chunks_of(text[best[0] + 1:], lim)


subs = []
for i, s in enumerate(sents):
    nxt = sents[i + 1]['s'] if i + 1 < len(sents) else total
    ch = chunks_of(s['show']); tot = len(norm(s['show'])); acc = 0; times = []
    for c in ch:
        times.append(s['s'] if not times else frac_to_time(s, acc / tot) - 0.06); acc += len(norm(c))
    for k, c in enumerate(ch):
        st = times[k]; en = times[k + 1] if k + 1 < len(ch) else min(nxt, s['e'] + 0.6)
        ww = [{'s': round(w['s'] - 0.06, 3), 'e': round(min(w['e'], en), 3)} for w in s['words'] if st - 0.05 <= w['s'] < en - 0.05]
        subs.append({'t': c, 's': round(st, 3), 'e': round(en, 3), 'w': ww})
json.dump(subs, open(os.path.join(ROOT, 'src', 'subs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# 5) 장면·이벤트 타임라인
scenes = {}
for i, s in enumerate(sents):
    sc = scenes.setdefault(s['scene'], {'from': s['s'], 'to': s['e'], 'first': i})
    sc['to'] = s['e']
ids = [sc['id'] for sc in S['scenes']]
for k, sid in enumerate(ids):  # 장면 경계 = 다음 장면 첫 문장 직전
    scenes[sid]['from'] = 0 if k == 0 else round(scenes[ids[k - 1]]['to'] + (scenes[sid]['from'] - scenes[ids[k - 1]]['to']) * 0.45, 3)
for k, sid in enumerate(ids):
    scenes[sid]['to'] = scenes[ids[k + 1]]['from'] if k + 1 < len(ids) else total

events = []
for i, s in enumerate(sents):
    for ev in s['ev']:
        e = dict(ev); e['i'] = i; e['scene'] = s['scene']
        at = kw_time(s, ev['kw']) if ev.get('kw') else s['s']
        if e['type'] == 'cam':
            d = ev.get('d', 0.9); e['at'] = round(max(scenes[s['scene']]['from'], at - 0.25), 3) if ev.get('kw') else round(at - (0.2 if d > 0.05 else 0), 3); e['d'] = d
        else:
            e['at'] = round(at, 3)
        events.append(e)
# 강조/배지 끝나는 시점: 문장 끝 + 0.35 (같은 문장 강조는 누적), 다음 문장 강조가 먼저 오면 그 직전
for e in events:
    if e['type'] in ('hi', 'badge'):
        s = sents[e['i']]; end = s['e'] + (0.35 if e['type'] == 'hi' else 0.5)
        nx = [x['at'] for x in events if x['type'] == e['type'] and x['at'] > e['at'] + 0.05 and (e['type'] == 'badge' or x['i'] != e['i'])]
        if nx: end = min(end, nx[0] - 0.05)
        e['end'] = round(end, 3)

steps = [{'from': scenes[sc['id']]['from'], 'to': scenes[sc['id']]['to'], **sc['step']} for sc in S['scenes'] if sc.get('step')]
tl = {'duration': total, 'sentences': [{k: s[k] for k in ('scene', 's', 'e', 'show')} for s in sents],
      'scenes': {k: {'from': v['from'], 'to': v['to']} for k, v in scenes.items()},
      'steps': steps, 'events': events, 'images': S['images'],
      'shots': [{'id': sc['id'], 'img': sc['img']} for sc in S['scenes'] if sc['kind'] == 'shot']}
json.dump(tl, open(os.path.join(ROOT, 'src', 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('timeline', total, 's |', len(sents), 'sentences |', len(events), 'events |', len(subs), 'subs')
