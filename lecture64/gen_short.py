"""9:16 highlight Short: hook (sentences 0-6) + summary (98-107). Builds voice_short.wav, render/data_s.js, sfx_s.json."""
import json, wave, numpy as np

P = json.load(open('plan.json')); W = json.load(open('words.json'))
SENTS, TIM = P['sents'], P['tim']
A0, A1 = 0.0, 21.6            # hook segment in voice.wav
B0, B1 = 273.85, 303.4        # summary segment
GAP = 0.35
SHIFT_B = (A1 - A0) + GAP - B0
SEL = list(range(0, 7)) + list(range(98, 108))

def sh(t, i): return round(t + (SHIFT_B if i >= 98 else 0), 3)

# ---- voice
w = wave.open('voice.wav'); sr = w.getframerate(); v = np.frombuffer(w.readframes(w.getnframes()), '<i2')
seg = lambda a, b: v[int(a * sr):int(b * sr)]
fade = int(.02 * sr)
a, b = seg(A0, A1).astype(np.float32), seg(B0, B1).astype(np.float32)
for x in (a, b): x[-fade:] *= np.linspace(1, 0, fade); x[:fade] *= np.linspace(0, 1, fade)
out = np.concatenate([a, np.zeros(int(GAP * sr), np.float32), b]).astype('<i2')
o = wave.open('voice_short.wav', 'wb'); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(out.tobytes()); o.close()
VEND = len(out) / sr

def S(i): return sh(TIM[i][0], i)
def kt(i, k):
    if k is None: return S(i)
    key = k.replace(' ', '')[:2]
    for ww, s, e in W[i]:
        if key in ww.replace(' ', ''): return sh(s, i)
    return S(i)

ICON = {'house': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M8 30 L32 10 L56 30 V56 H8Z" fill="#FFD60A"/><rect x="26" y="38" width="12" height="18" fill="#0b1020"/></svg>'}
def card(t, cls='card', st=''): return f'<div class="{cls}" style="{st}">{t}</div>'
def xo(t, ok, st=''): return f'<div class="card {"okc" if ok else "noc"}" style="{st}">{t}<b class="mk">{"✓" if ok else "✗"}</b></div>'

IT = []
def A(i, k, x, y, html, anim='pop', out=None, sfx=None):
    IT.append(dict(i=i, k=k, x=x, y=y, html=html, anim=anim, out=out, flash=False, dur=0, sfx=sfx))
def F(i, k, html, sfx='impact', dur=1.5):
    IT.append(dict(i=i, k=k, x=540, y=820, html=html, anim='flash', out=None, flash=True, dur=dur, sfx=sfx))

MAP = ('<svg width="900" height="560" viewBox="0 0 880 520"><rect width="880" height="520" rx="24" fill="#10192e"/>'
       + ''.join(f'<rect x="{30+c*140}" y="{30+r*120}" width="120" height="100" rx="8" fill="#1d2a48"/>' for r in range(4) for c in range(6))
       + '<path d="M-10 330 C200 300 380 250 890 180" stroke="#FF3B4E" stroke-width="46" stroke-dasharray="36 18" fill="none" opacity=".85"/>'
       + '<g transform="translate(470 215)"><path d="M0 30 L30 4 L60 30 V70 H0Z" fill="#FFD60A"/></g></svg>')
# hook
A(0, None, 540, 300, card('내 땅에 도로가 그어졌다면?', 'ybox', 'font-size:58px'), 'slam', out=5, sfx='impact')
A(0, '도로', 540, 700, MAP, 'rise', out=5)
A(0, '도로', 400, 470, card('도로 예정', 'rbox', 'font-size:40px'), 'pop', out=5)
A(1, '20년째', 540, 1040, card('20년째 공사 ✗', 'stamp', 'font-size:84px'), 'stamp', out=5, sfx='impact')
A(2, '집도', 360, 1210, xo('건축', False, 'font-size:50px'), 'pop', out=5)
A(2, '팔리지', 720, 1210, xo('매매', False, 'font-size:50px'), 'pop', out=5)
F(3, '장기', card('장기 미집행<br><span class="y">도시·군계획시설</span>', 'fcard', 'font-size:96px'))
A(5, '2년', 540, 470, card('2년', 'num'), 'slam', sfx='ding')
A(5, '10년', 540, 700, card('10년', 'num'), 'slam', sfx='ding')
A(5, '20년', 540, 930, card('20년', 'num'), 'slam', sfx='ding')
A(6, '미안', 540, 1170, card('시간이 지날수록<br>국가가 점점 <span class="y">미안</span>해진다', 'card', 'font-size:52px'), 'rise')
# summary: vertical timeline
A(98, '정리', 540, 300, card('한눈에 총정리', 'cbox', 'font-size:60px'), 'slam', out=106, sfx='impact')
A(99, '원칙', 150, 800, '<div style="width:10px;height:760px;background:linear-gradient(#FFD60A,#FF3B4E);border-radius:5px"></div>', 'rise', out=106)
NODES = [(99, '건축', 470, '결정고시', '원칙 · <span class="r">건축 금지</span>', ''),
         (100, '2년', 640, '2년', '쪼끔 미안', '가설건축물·공작물·개축·재축'),
         (101, '10년', 830, '10년', '매수청구 (지목 대)', ''),
         (102, '진짜', 990, '', '<span class="r">진짜 미안</span>', '3층 이하 단독·1·2종 근생·공작물'),
         (103, '20년', 1160, '20년', '다음 날 <span class="y">자동 실효</span>', '')]
for i, k, y, lab, main, small in NODES:
    if lab: A(i, k, 150, y, f'<div style="width:118px;height:118px;border-radius:50%;background:#FFD60A;color:#111;font-weight:900;font-size:{30 if len(lab)>3 else 38}px;display:flex;align-items:center;justify-content:center;border:6px solid #070B16;box-shadow:0 0 30px rgba(255,214,10,.6)">{lab}</div>', 'slam', out=106, sfx='ding')
    body = f'{main}' + (f'<br><small style="font-size:30px;font-weight:700;color:#cfd6e6">{small}</small>' if small else '')
    A(i, k, 620, y, f'<div class="sum" style="width:780px;text-align:left;font-size:44px">{body}</div>', 'pop', out=106)
A(104, '해제권고', 540, 1300, card('+ 지방의회 해제권고 · 90일 · 1년 · 6개월', 'chip', 'font-size:34px'), 'rise', out=106)
F(105, '흐름', card('공법은<br><span class="y">흐름</span>이다!', 'fcard'))
A(106, '최신', 540, 620, card('실제 적용 전<br>최신 법령·관할 행정기관<br>꼭 확인하세요', 'note', 'font-size:44px;text-align:center;line-height:1.4'), 'rise')
A(107, '공법의', 540, 950, card('공법의 신<br><span class="y">고상철</span>', 'big', 'font-size:130px;text-align:center;line-height:1.1'), 'slam', sfx='impact')

END = round(VEND + 1.8, 3)
scenes = [{'t0': 0, 't1': round(S(98) - 0.4, 3), 'title': 'hook'}, {'t0': round(S(98) - 0.4, 3), 't1': END, 'title': 'sum'}]
items = []
for it in IT:
    t = round(max(0, kt(it['i'], it['k'])), 3); sc = 0 if it['i'] < 98 else 1
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
