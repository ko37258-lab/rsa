"""내레이션(TTS) -> 긴장 구간을 늘린 voice.wav + timeline.json + subs.json
사용: python build_timeline.py <takeA.mp3> <takeA_words.json> <project_dir>
"""
import sys, os, json, re, subprocess, numpy as np
SR = 48000
src, wpath, proj = sys.argv[1:4]
os.makedirs(f'{proj}/work', exist_ok=True)
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32).copy()
words = json.load(open(wpath, encoding='utf-8'))

# 무음 구간 측정
out = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', 'silencedetect=noise=-40dB:d=0.15', '-f', 'null', '-'], capture_output=True, text=True).stderr
st = [float(v) for v in re.findall(r'silence_start: ([\d.]+)', out)]
en = [float(v) for v in re.findall(r'silence_end: ([\d.]+)', out)]
gaps = list(zip(st, en))

def gap_before(t):  # t(단어 시작 추정) 근처에서 끝나는 무음
    g = min(gaps, key=lambda g: abs(g[1] - t) if g[0] - 0.4 <= t <= g[1] + 0.6 else 1e9)
    return g

# 단어 시점 보정: 무음 안에 걸친 시작/끝을 무음 경계로 당김
for w in words:
    for a, b in gaps:
        if a <= w['s'] < b: w['s'] = b
    for a, b in gaps:  # 단어 안쪽에서 시작하는 첫 무음에서 단어를 끝냄
        if w['s'] + 0.15 < a < w['e'] + 0.1: w['e'] = a; break

NAMES = ['이아영', '목진영', '도정민', '김지영', '양한설', '김인선', '김영진', '한혜옥', '조민수', '정서윤']
ORD = ['첫 번째', '두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째', '일곱 번째', '여덟 번째', '아홉 번째', '열 번째']
# 단어 인덱스 (whisper 결과 기준)
ord_idx = [19, 23, 26, 29, 32, 42, 45, 48, 56, 61]
name_idx = [21, 25, 28, 31, 34, 44, 47, 50, 58, 64]
PRE = [2.6, 2.3, 2.2, 2.2, 2.4, 2.2, 2.2, 2.3, 2.6, 4.4]   # 이름 직전 서스펜스 총 길이
POST = [1.7, 1.5, 1.5, 1.5, 1.6, 1.5, 1.5, 1.6, 1.6, 2.6]  # 이름 뒤 축하 여운 총 길이
LEAD = 1.6   # 맨 앞 음악 인트로
TAIL = 7.0   # 끝 총정리 유지

inserts = []  # (old_time, add_sec)
for i in range(10):
    a, b = gap_before(words[name_idx[i]]['s'])
    inserts.append(((a + b) / 2, max(0, PRE[i] - (b - a))))
    # 이름 뒤 무음 = 다음 문장 시작 직전 무음
    nxt = name_idx[i] + (2 if i in (0, 9) else 1)  # 첫/마지막은 '축하드립니다' 포함
    a2, b2 = gap_before(words[nxt]['s']) if nxt < len(words) else (None, None)
    if a2 is not None: inserts.append(((a2 + b2) / 2, max(0, POST[i] - (b2 - a2))))
# 인트로 끝(공개합니다 -> 첫 번째) 숨 고르기, 중간 멘트 뒤
for idx, tot in [(19, 1.4), (42, 1.0), (56, 1.0), (11, 0.6)]:
    a, b = gap_before(words[idx]['s']); inserts.append(((a + b) / 2, max(0, tot - (b - a))))
inserts.sort()

def remap(t):
    return LEAD + t + sum(add for (at, add) in inserts if at < t)

pieces = [np.zeros(int(LEAD * SR), np.float32)]; prev = 0
for at, add in inserts:
    k = int(at * SR); pieces += [x[prev:k], np.zeros(int(round(add * SR)), np.float32)]; prev = k
pieces += [x[prev:], np.zeros(int(TAIL * SR), np.float32)]
y = np.concatenate(pieces)
dur = len(y) / SR
import wave
with wave.open(f'{proj}/work/voice.wav', 'wb') as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())

W = [{'w': w['w'], 's': round(remap(w['s']), 3), 'e': round(remap(w['e']), 3)} for w in words]
def S(i): return W[i]['s']
def E(i): return W[i]['e']

winners = []
for i in range(10):
    o = 59 if i == 9 else ord_idx[i]
    nm = name_idx[i]
    end_word = nm + (1 if i in (0, 9) else 0)
    nxt_start = S(end_word + 1) if end_word + 1 < len(W) else dur
    winners.append({'n': i + 1, 'name': NAMES[i], 'ord': ORD[i], 'start': round(S(o) - 0.35, 3), 'ordAt': S(ord_idx[i]),
                    'nameAt': S(nm), 'nameEnd': E(end_word), 'end': round(nxt_start - 0.3, 3)})
tl = {
    'durationSec': round(dur, 2), 'lead': LEAD,
    'intro': {'start': 0, 'hello': S(0), 'title': S(2), 'count': S(7), 'only': S(9), 'ten': S(10), 'who': S(11), 'reveal': S(15), 'end': winners[0]['start']},
    'winners': winners,
    'half': {'start': S(35) - 0.3, 'remain': S(38), 'end': winners[5]['start']},
    'two': {'start': S(51) - 0.3, 'end': winners[8]['start']},
    'last': {'start': S(59) - 0.3, 'ordAt': S(61)},
    'outro': {'start': winners[9]['end'], 'congrats': S(66), 'thanks': S(71), 'end': dur},
}
# 마지막 당첨자 장면은 '그리고... 마지막'부터
tl['winners'][9]['start'] = tl['last']['start']

# 자막: 표시 토큰 -> 단어 인덱스
L = [
    [('안녕하세요,', 0), ('고상철입니다.', 1)],
    [('드디어', 2), ('기다리시던', 3), ('당첨자', 4), ('발표', 5), ('시간입니다!', 6)],
    [('서른다섯', 7), ('분', 7), ('중에...', 8), ('단', 9), ('열', 10), ('분.', 10)],
    [('과연', 11), ('행운의', 12), ('주인공은', 13), ('누구일까요?', 14)],
    [('지금부터...', 15), ('한', 16), ('분씩', 17), ('공개합니다.', 18)],
]
seq = []
for i in range(10):
    if i == 5: seq += [[('이제', 35), ('절반', 36), ('왔습니다.', 37)], [('남은', 38), ('자리는...', 39), ('다섯', 40), ('자리.', 41)]]
    if i == 8: seq += [[('이제...', 51), ('딱', 52), ('두', 53), ('자리', 54), ('남았습니다.', 55)]]
    if i == 9: seq += [[('그리고...', 59), ('마지막,', 60)], [('열', 61), ('번째', 62), ('당첨자는...', 63)]]
    else: seq += [[(ORD[i].split()[0], ord_idx[i]), ('번째', ord_idx[i]), ('당첨자는...', ord_idx[i] + 1)]]
    nl = [(NAMES[i], name_idx[i]), ('님!', name_idx[i])]
    if i in (0, 9): nl.append(('축하드립니다!', name_idx[i] + 1))
    seq.append(nl)
seq += [
    [('당첨되신', 66), ('열', 67), ('분,', 68), ('진심으로', 69), ('축하드립니다!', 70)],
    [('아쉽게', 71), ('이번에', 72), ('당첨되지', 73), ('않으신', 74), ('분들도,', 75)],
    [('끝까지', 76), ('함께해', 77), ('주셔서', 78), ('정말', 79), ('감사합니다.', 80)],
]
L += seq
subs = []
for line in L:
    toks = []
    # 같은 단어를 나눈 토큰은 글자 수 비례로 시간 분할
    from collections import defaultdict
    grp = defaultdict(list)
    for k, (t, wi) in enumerate(line): grp[wi].append(k)
    for k, (t, wi) in enumerate(line):
        ks = grp[wi]; s0, e0 = S(wi), E(wi)
        lens = [len(line[j][0].strip('.,!?')) or 1 for j in ks]; tot = sum(lens); pos = ks.index(k)
        a = s0 + (e0 - s0) * sum(lens[:pos]) / tot; b = s0 + (e0 - s0) * sum(lens[:pos + 1]) / tot
        toks.append({'t': t, 's': round(a, 3), 'e': round(b, 3)})
    subs.append({'s': round(toks[0]['s'] - 0.12, 3), 'e': round(toks[-1]['e'] + 0.6, 3), 'w': toks})
for a, b in zip(subs, subs[1:]):
    # 다음 줄까지 유지(최대 2.8초 여운), 겹치지 않게
    a['e'] = round(min(b['s'] - 0.02, max(a['e'], min(b['s'] - 0.02, a['w'][-1]['e'] + 4.6))), 3)
subs[-1]['e'] = round(dur - 0.2, 3)
json.dump(tl, open(f'{proj}/src/timeline.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(subs, open(f'{proj}/src/subs.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('duration', round(dur, 2))
for w in winners: print(w)
print({k: v for k, v in tl.items() if k not in ('winners',)})
