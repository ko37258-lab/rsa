"""voice.wav + whisper words (tr_word.json) -> plan.json tim + words.json (script-token times)."""
import json, re, difflib

P = json.load(open('plan.json'))
SENTS = P['sents']
W = json.load(open('tr_word.json'))['chunks']
norm = lambda s: re.sub(r'[^0-9A-Za-z가-힣]', '', s)

# whisper char stream with times
wc, wt = [], []
for c in W:
    txt = norm(c['text']); s, e = c['timestamp']
    e = e if e is not None else s + 0.3
    for k, ch in enumerate(txt):
        wc.append(ch); wt.append(s + (e - s) * k / max(1, len(txt)))
# script char stream: (sentence, token)
sc, sidx = [], []
for i, snt in enumerate(SENTS):
    for j, tok in enumerate(snt.split(' ')):
        for ch in norm(tok):
            sc.append(ch); sidx.append((i, j))
m = difflib.SequenceMatcher(None, ''.join(sc), ''.join(wc), autojunk=False)
tmap = [None] * len(sc)
for a, b, n in m.get_matching_blocks():
    for k in range(n): tmap[a + k] = wt[b + k]
# interpolate gaps
known = [k for k, v in enumerate(tmap) if v is not None]
for k in range(len(tmap)):
    if tmap[k] is None:
        prev = max([q for q in known if q < k], default=None); nxt = min([q for q in known if q > k], default=None)
        if prev is None: tmap[k] = tmap[nxt]
        elif nxt is None: tmap[k] = tmap[prev] + 0.1 * (k - prev)
        else: tmap[k] = tmap[prev] + (tmap[nxt] - tmap[prev]) * (k - prev) / (nxt - prev)
cov = len(known) / len(sc)
words = [[] for _ in SENTS]; first = {}; last = {}
for k, (i, j) in enumerate(sidx):
    first.setdefault((i, j), tmap[k]); last[(i, j)] = tmap[k]
tim = []
for i, snt in enumerate(SENTS):
    toks = snt.split(' ')
    for j, tok in enumerate(toks):
        if (i, j) in first: words[i].append([tok, round(first[(i, j)], 3), round(last[(i, j)] + 0.12, 3)])
        else: words[i].append([tok, words[i][-1][1] if words[i] else 0, words[i][-1][2] if words[i] else 0])
    tim.append([words[i][0][1], words[i][-1][2]])
# enforce monotonic
for i in range(1, len(tim)):
    if tim[i][0] < tim[i - 1][0]: tim[i][0] = tim[i - 1][1]
P['tim'] = tim
json.dump(P, open('plan.json', 'w'), ensure_ascii=False)
json.dump(words, open('words.json', 'w'), ensure_ascii=False)
print('match coverage %.1f%%' % (cov * 100), 'end', tim[-1][1])
bad = [i for i in range(len(tim)) if tim[i][1] - tim[i][0] < 0.4]
print('suspicious sentences', bad)
