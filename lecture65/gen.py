"""Build render/data.js (items, subtitles, scenes) and sfx.json from plan.json (+ optional words.json)."""
import json, os, re

P = json.load(open('plan.json'))
SENTS, TIM, SC = P['sents'], P['tim'], P['scenes']
WORDS = json.load(open('words.json')) if os.path.exists('words.json') else None  # [[ [w,s,e],... ] per sentence]


def S(i): return TIM[i][0]
def E(i): return TIM[i][1]


def kt(i, k):
    """time when keyword k is spoken inside sentence i"""
    if k is None: return S(i)
    if WORDS:
        ws = WORDS[i]
        key = k.replace(' ', '')[:2]
        for w, s, e in ws:
            if key and key in w.replace(' ', ''):
                return s
    txt = SENTS[i]
    j = txt.find(k)
    if j < 0: j = 0
    return S(i) + (E(i) - S(i)) * (j / max(1, len(txt))) - 0.05

# ---------------- html helpers
ICON = {
 'house': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M8 30 L32 10 L56 30 V56 H8Z" fill="#FFD60A"/><rect x="26" y="38" width="12" height="18" fill="#0b1020"/></svg>',
 'bldg': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><rect x="14" y="8" width="36" height="50" rx="3" fill="#9fd8ff"/>' + ''.join(f'<rect x="{20+c*9}" y="{14+r*9}" width="6" height="6" fill="#0b1020"/>' for r in range(4) for c in range(3)) + '</svg>',
 'tower': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M32 6 L44 58 H20Z" fill="none" stroke="#9fd8ff" stroke-width="5"/><path d="M24 40 H40 M27 26 H37" stroke="#9fd8ff" stroke-width="4"/></svg>',
 'tent': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M6 54 L32 12 L58 54Z" fill="#FFD60A"/><path d="M32 54 L32 30 L42 54Z" fill="#0b1020"/></svg>',
 'money': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><rect x="6" y="16" width="52" height="32" rx="4" fill="#34E28A"/><circle cx="32" cy="32" r="9" fill="#0b1020"/></svg>',
 'doc': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M14 6 H42 L52 16 V58 H14Z" fill="#fff"/><path d="M20 26 H46 M20 34 H46 M20 42 H38" stroke="#0b1020" stroke-width="4"/><circle cx="44" cy="48" r="7" fill="#FF3B4E"/></svg>',
 'council': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M6 24 L32 8 L58 24Z" fill="#FFD60A"/>' + ''.join(f'<rect x="{12+c*11}" y="28" width="6" height="22" fill="#fff"/>' for c in range(4)) + '<rect x="6" y="52" width="52" height="6" fill="#fff"/></svg>',
 'person': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><circle cx="32" cy="20" r="11" fill="#fff"/><path d="M12 58 C12 38 52 38 52 58Z" fill="#fff"/></svg>',
}
def ic(n, s=64): return ICON[n].format(s=s)
def card(t, cls='card', st=''): return f'<div class="{cls}" style="{st}">{t}</div>'
def xo(t, ok, st=''):
    return f'<div class="card {"okc" if ok else "noc"}" style="{st}">{t}<b class="mk">{"✓" if ok else "✗"}</b></div>'

ITEMS = []
def A(i, k, x, y, html, anim='pop', out=None, flash=False, dur=1.4, sfx=None, w=None):
    ITEMS.append(dict(i=i, k=k, x=x, y=y, html=html, anim=anim, out=out, flash=flash, dur=dur, sfx=sfx))
def F(i, k, html, sfx='impact', dur=1.5):  # full-screen flash card
    A(i, k, 960, 520, html, anim='flash', flash=True, dur=dur, sfx=sfx)
def H(sc, text):  # chapter header
    i0 = SC[sc]['i0']
    ITEMS.append(dict(i=i0, k=None, x=0, y=0, html=f'<div class="chap"><span>{sc:02d}</span>{text}</div>', anim='chapter', out=None, flash=False, dur=0, sfx='whoosh', chapter=True))

exec(open('items65.py').read())

# ---------------- timing
def item_time(it):
    t = kt(it['i'], it['k'])
    if it.get('chapter'): t = S(it['i']) - 0.2
    return round(max(0, t), 3)

scenes = []
for n, s in enumerate(SC):
    st = S(s['i0']) - 0.45 if n else 0
    scenes.append({'t0': round(st, 3), 'title': s['title']})
for n in range(len(scenes)):
    scenes[n]['t1'] = scenes[n + 1]['t0'] if n + 1 < len(scenes) else round(E(len(SENTS) - 1) + 3.5, 3)

out = []
for it in ITEMS:
    t = item_time(it)
    sc = max(n for n, s in enumerate(scenes) if s['t0'] <= t + 0.5) if not it.get('chapter') else next(n for n, s in enumerate(SC) if s['i0'] == it['i'])
    tout = (kt(it['out'], None) - 0.2) if it['out'] is not None else scenes[sc]['t1']
    if it['flash']: tout = t + it['dur']
    out.append(dict(t=t, tout=round(tout, 3), x=it['x'], y=it['y'], html=it['html'], anim=it['anim'], flash=it['flash'], sc=sc, chapter=bool(it.get('chapter'))))

# subtitles: pages of <= 30 chars
subs = []
for i, txt in enumerate(SENTS):
    if WORDS: ws = [(w, s) for w, s, e in WORDS[i]]
    else:
        toks = txt.split(' '); tot = sum(len(x) for x in toks); acc = 0; ws = []
        for x in toks:
            ws.append((x, round(S(i) + (E(i) - S(i)) * acc / tot, 3))); acc += len(x)
    pages = [[]]; cnt = 0
    for w in ws:
        if cnt + len(w[0]) > 26 and pages[-1]: pages.append([]); cnt = 0
        pages[-1].append(w); cnt += len(w[0]) + 1
    for p in pages: subs.append({'s': p[0][1], 'w': [list(x) for x in p]})
for n in range(len(subs)):
    nxt = subs[n + 1]['s'] if n + 1 < len(subs) else subs[n]['s'] + 3
    subs[n]['e'] = round(min(nxt, subs[n]['w'][-1][1] + 1.6), 3)

TL = {'show': round(S(4) + 1.2, 3), 'marks': [(scenes[1]['t0'], 0), (scenes[2]['t0'], -2), (scenes[3]['t0'], 1), (scenes[4]['t0'], 2), (scenes[5]['t0'], 3), (scenes[6]['t0'], -2), (scenes[8]['t0'], -1)], 'labels': [(0, kt(8, '별표'), '별표 2~22'), (1, kt(21, '산업입지법'), '산업입지법'), (2, kt(28, '농산초'), '농산초'), (3, kt(37, '자수문해수'), '자수문해수')]}
END = scenes[-1]['t1']
open('render/data.js', 'w').write('const ITEMS=' + json.dumps(out, ensure_ascii=False) + ';\nconst SUBS=' + json.dumps(subs, ensure_ascii=False)
                                  + ';\nconst SCENES=' + json.dumps(scenes, ensure_ascii=False) + ';\nconst TL=' + json.dumps(TL) + f';\nconst END={END};\n')
sfx = [[o['t'], ITEMS[n].get('sfx') or ('pop' if not o['chapter'] else 'whoosh')] for n, o in enumerate(out)]
json.dump({'sfx': sfx, 'end': END, 'scenes': scenes}, open('sfx.json', 'w'))
print('items', len(out), 'subs', len(subs), 'end', END)
