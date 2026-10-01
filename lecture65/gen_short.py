"""9:16 highlight Short: hook + 핵심 함정 + 결론. Builds voice_short.wav, render/data_s.js, sfx_s.json."""
import json, wave, numpy as np

P = json.load(open('plan.json')); W = json.load(open('words.json'))
SENTS, TIM = P['sents'], P['tim']
SEGS = [[0, 1, 2, 3], [39, 40, 41, 42, 43, 44, 45, 46], [51], [53], [62]]
GAP = 0.3

w = wave.open('voice.wav'); sr = w.getframerate(); v = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32)
fade = int(.02 * sr); chunks = []; SHIFT = {}; pos = 0.0
for seg in SEGS:
    a, b = TIM[seg[0]][0] - 0.2, TIM[seg[-1]][1] + 0.25
    x = v[int(a * sr):int(b * sr)].copy(); x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
    for i in seg: SHIFT[i] = pos - a
    chunks += [x, np.zeros(int(GAP * sr), np.float32)]; pos += (b - a) + GAP
out = np.concatenate(chunks).astype('<i2')
o = wave.open('voice_short.wav', 'wb'); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(out.tobytes()); o.close()
VEND = len(out) / sr
SEL = [i for s in SEGS for i in s]

def sh(t, i): return round(t + SHIFT[i], 3)
def S(i): return sh(TIM[i][0], i)
def kt(i, k):
    if k is None: return S(i)
    key = k.replace(' ', '')[:2]
    for ww, s, e in W[i]:
        if key in ww.replace(' ', ''): return sh(s, i)
    return S(i)

DROP = '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M32 6 C20 24 14 34 14 42 a18 18 0 0 0 36 0 C50 34 44 24 32 6Z" fill="#22D3EE"/></svg>'
def card(t, cls='card', st=''): return f'<div class="{cls}" style="{st}">{t}</div>'
IT = []
def A(i, k, x, y, html, anim='pop', out=None, sfx=None):
    IT.append(dict(i=i, k=k, x=x, y=y, html=html, anim=anim, out=out, flash=False, dur=0, sfx=sfx))
def F(i, k, html, sfx='impact', dur=1.5):
    IT.append(dict(i=i, k=k, x=540, y=820, html=html, anim='flash', out=None, flash=True, dur=dur, sfx=sfx))
def zone_box(name, col): return (f'<div style="width:880px;height:300px;border:6px solid {col};border-radius:26px;background:rgba(255,255,255,.05);position:relative">'
    f'<div style="position:absolute;left:28px;top:18px;font-weight:900;font-size:50px;color:{col}">{name}</div>'
    f'<div style="position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);background:#fff;color:#111;font-weight:900;font-size:46px;padding:16px 30px;border-radius:16px;white-space:nowrap">{DROP.format(s=52)} 상수원보호구역</div></div>')

# hook
A(0, '상수원', 540, 400, card(DROP.format(s=90) + '<br>상수원보호구역이면<br>무조건 <span class="y">수도법</span>?', 'card', 'font-size:68px;padding:30px 50px'), 'slam', out=39, sfx='impact')
A(1, '그렇다고', 540, 720, card('대부분: "네!"', 'chip', 'font-size:52px'), 'pop', out=39)
A(2, '함정', 540, 880, card('함정!', 'stamp', 'font-size:110px'), 'stamp', out=39, sfx='impact')
A(3, '용도지역', 540, 1120, card('정답 = 어느 <span class="y">용도지역</span>에<br>지정됐는가', 'ybox', 'font-size:56px;text-align:center'), 'pop', out=39, sfx='ding')
# trap
F(39, '핵심', card('<span class="r">오늘의<br>핵심 함정</span>', 'fcard'))
A(40, '농림지역에', 540, 430, zone_box('농림지역', '#34E28A'), 'pop', out=51)
A(41, '수도법을', 540, 680, card('수도법 적용?', 'card', 'font-size:56px'), 'pop', out=42)
A(42, '아닙니다', 540, 680, card('✗ 아닙니다', 'stamp', 'font-size:90px'), 'stamp', out=44, sfx='impact')
A(43, '자연환경보전지역', 540, 970, zone_box('자연환경보전지역', '#22D3EE'), 'pop', out=51)
A(43, '적용됩니다', 540, 1220, card('수도법 ○', 'ybox', 'font-size:64px'), 'slam', out=51, sfx='ding')
A(44, '별표', 540, 680, card('→ 시행령 별표', 'ybox', 'font-size:56px'), 'pop', out=45)
A(45, '21', 540, 680, card('농림지역 = 별표 21', 'ybox', 'font-size:60px'), 'slam', out=51, sfx='ding')
F(46, '어느', card('지역이<br><span class="y">답을 바꾼다</span>', 'fcard'))
# conclusion
A(51, '농산초', 540, 560, card('농림지역<br><span style="font-size:110px">농·산·초</span>', 'ybox', 'font-size:56px;text-align:center;padding:30px 60px'), 'slam', out=62, sfx='impact')
A(51, '자수문해수', 540, 950, card('자연환경보전지역<br><span style="font-size:96px">자·수·문·해·수</span>', 'cbox', 'font-size:52px;text-align:center;border-radius:28px;padding:30px 50px'), 'slam', out=62, sfx='impact')
F(53, '지역', card('지역 먼저!', 'fnum', 'font-size:150px'))
A(62, '공법의', 540, 900, card('공법의 신<br><span class="y">고상철</span>', 'big', 'font-size:130px;text-align:center;line-height:1.1'), 'slam', sfx='impact')

END = round(VEND + 1.6, 3)
b1, b2 = round(S(39) - 0.35, 3), round(S(51) - 0.35, 3)
scenes = [{'t0': 0, 't1': b1, 'title': 'hook'}, {'t0': b1, 't1': b2, 'title': 'trap'}, {'t0': b2, 't1': END, 'title': 'end'}]
items = []
for it in IT:
    t = round(max(0, kt(it['i'], it['k'])), 3); sc = 0 if t < b1 else (1 if t < b2 else 2)
    tout = kt(it['out'], None) - 0.2 if it['out'] is not None else scenes[sc]['t1']
    if it['flash']: tout = t + it['dur']
    items.append(dict(t=t, tout=round(tout, 3), x=it['x'], y=it['y'], html=it['html'], anim=it['anim'], flash=it['flash'], sc=sc, chapter=False))
subs = []
for i in SEL:
    ws = [(x, sh(s, i)) for x, s, e in W[i]]
    pages = [[]]; cnt = 0
    for x in ws:
        if cnt + len(x[0]) > 18 and pages[-1]: pages.append([]); cnt = 0
        pages[-1].append(x); cnt += len(x[0]) + 1
    for p in pages: subs.append({'s': p[0][1], 'w': [list(q) for q in p]})
for n in range(len(subs)):
    nxt = subs[n + 1]['s'] if n + 1 < len(subs) else subs[n]['s'] + 3
    subs[n]['e'] = round(min(nxt, subs[n]['w'][-1][1] + 1.6), 3)
TL = {'show': 9999, 'marks': [], 'labels': []}
open('render/data_s.js', 'w').write('const ITEMS=' + json.dumps(items, ensure_ascii=False) + ';\nconst SUBS=' + json.dumps(subs, ensure_ascii=False)
                                    + ';\nconst SCENES=' + json.dumps(scenes) + ';\nconst TL=' + json.dumps(TL) + f';\nconst END={END};\n')
json.dump({'sfx': [[o['t'], IT[n]['sfx'] or 'pop'] for n, o in enumerate(items)], 'end': END, 'scenes': scenes}, open('sfx_s.json', 'w'))
print('voice', round(VEND, 2), 'end', END, 'items', len(items), 'subs', len(subs))
