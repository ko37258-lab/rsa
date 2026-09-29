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

# ---------------- S1 hook
MAP = ('<svg width="880" height="520" viewBox="0 0 880 520"><rect width="880" height="520" rx="24" fill="#10192e"/>'
       + ''.join(f'<rect x="{30+c*140}" y="{30+r*120}" width="120" height="100" rx="8" fill="#1d2a48"/>' for r in range(4) for c in range(6))
       + '<path d="M-10 330 C200 300 380 250 890 180" stroke="#FF3B4E" stroke-width="46" stroke-dasharray="36 18" fill="none" opacity=".85"/>'
       + '<g transform="translate(470 215)"><path d="M0 30 L30 4 L60 30 V70 H0Z" fill="#FFD60A"/></g></svg>')
A(0, None, 680, 560, MAP, 'rise', out=5)
A(0, '도로', 520, 330, card('도로 예정 (도시·군계획시설)', 'rbox', 'font-size:34px'), 'pop', out=5)
A(1, '20년째', 1450, 380, card('20년째 공사 ✗', 'stamp'), 'stamp', out=5, sfx='impact')
A(2, '집도', 1450, 560, xo('건축', False, 'font-size:44px'), 'pop', out=5)
A(2, '팔리지', 1450, 690, xo('매매', False, 'font-size:44px'), 'pop', out=5)
F(3, '장기', card('장기 미집행<br><span class="y">도시·군계획시설</span>', 'fcard'))
A(5, '2년', 480, 520, card('2년', 'num'), 'slam', sfx='ding')
A(5, '10년', 960, 520, card('10년', 'num'), 'slam', sfx='ding')
A(5, '20년', 1440, 520, card('20년', 'num'), 'slam', sfx='ding')
A(6, '미안', 960, 760, card('시간이 지날수록 → 국가가 점점 <span class="y">미안</span>해진다', 'card', 'font-size:46px'), 'rise')

# ---------------- S2 원칙
H(1, '원칙 · 건축 금지')
XS = ('<svg width="820" height="560" viewBox="0 0 820 560"><rect width="820" height="560" rx="24" fill="#10192e"/>'
      '<rect x="0" y="0" width="820" height="250" rx="24" fill="#16305a"/><rect x="0" y="250" width="820" height="40" fill="#3b7a3b"/>'
      '<rect x="0" y="290" width="820" height="270" fill="#3a2a1d"/><rect x="520" y="240" width="300" height="90" fill="#1f5fa8"/>'
      '<rect x="190" y="30" width="330" height="500" fill="rgba(255,214,10,.14)" stroke="#FFD60A" stroke-width="6" stroke-dasharray="18 10"/></svg>')
A(8, '설치 장소', 620, 580, XS, 'rise')
A(8, '설치 장소', 620, 285, card('도시·군계획시설 부지', 'ybox', 'font-size:34px'), 'pop')
for k, y in [('지상', 520), ('수상', 610), ('공중', 380), ('수중', 690), ('지하', 800)]:
    A(9, k, 1170, y, card(k, 'chip'), 'pop', sfx='tick')
A(10, '건축물', 1500, 400, xo(ic('bldg', 70) + ' 건축물', False), 'pop')
A(11, '공작물', 1500, 540, xo(ic('tower', 70) + ' 공작물', False), 'pop')
A(12, '허가권자', 960, 900, card('허가권자: 특별시장 · 광역시장 · 특별자치시장 · 특별자치도지사 · 시장 · 군수', 'chip', 'font-size:30px'), 'rise')
A(13, '건축 금지', 1500, 700, card('건축 금지', 'stamp'), 'stamp', sfx='impact')

# ---------------- S3 2년
H(2, '2년 경과 · 쪼끔 미안')
A(15, '2년이', 560, 330, card('고시일부터 <span class="y">2년</span> · 사업 미시행', 'card'), 'pop')
A(17, '조건', 560, 425, card('AND', 'op'), 'pop', sfx='tick')
A(18, '수립', 560, 515, card('단계별 집행계획 <span class="r">미수립</span>', 'card', 'font-size:38px'), 'pop')
A(19, '제1단계', 560, 600, card('OR', 'op'), 'pop', sfx='tick')
A(19, '제1단계', 560, 690, card('<span class="y">제1단계</span> 집행계획에 미포함', 'card', 'font-size:38px'), 'pop')
A(20, '아니라는', 560, 800, card('= 곧 사업할 땅이 아님', 'note'), 'rise')
A(21, '허가', 1400, 300, card('허가 받아 가능', 'cbox'), 'slam')
A(22, '가설건축물', 1140, 450, card(ic('tent', 76) + '<br>가설건축물', 'tile'), 'pop')
A(23, '공작물', 1400, 450, card(ic('tower', 76) + '<br>공작물', 'tile'), 'pop')
A(24, '개축', 1660, 450, card(ic('house', 76) + '<br>개축·재축', 'tile'), 'pop')
A(25, '형질변경', 1400, 600, card('+ 필요한 범위의 토지 형질변경', 'note'), 'rise')
A(26, '원상회복', 1400, 710, card('⚠ 사업 시행 시 <span class="r">원상회복</span>', 'warn'), 'pop')
A(27, '3개월', 1400, 790, card('시행예정일 <span class="y">3개월 전</span>까지 명령', 'note'), 'rise', sfx='ding')
A(28, '소유자', 1400, 865, card('비용: 가설건축물·공작물 소유자 부담', 'note'), 'rise')
F(29, '쪼끔', card('2년 = <span class="y">쪼끔 미안</span>', 'fcard'), sfx='impact')

# ---------------- S4 10년
H(3, '10년 경과 · 매수청구')
A(31, '10년', 520, 320, card('고시일부터 <span class="y">10년</span> 이내 사업 미시행', 'card', 'font-size:38px'), 'pop')
A(32, '실시계획', 520, 405, card('※ 실시계획 인가 등 진행 시 제외', 'note'), 'rise')
A(33, '매수청구', 520, 540, card('매수청구', 'big'), 'slam', sfx='impact')
A(34, '사 가세요', 520, 690, card('"이 땅, 이제 사 가세요!"', 'bubble'), 'pop')
A(36, '대인', 1100, 350, xo('대(垈)', True, 'font-size:54px'), 'slam', sfx='ding')
A(38, '전', 1330, 350, xo('전', False, 'font-size:54px'), 'pop')
A(38, '답', 1520, 350, xo('답', False, 'font-size:54px'), 'pop')
A(38, '임야', 1730, 350, xo('임야', False, 'font-size:54px'), 'pop')
A(37, '건축물과', 1400, 470, card('+ 그 토지의 건축물·정착물 포함', 'note'), 'rise')
A(39, '청구 상대', 1400, 600, card(ic('person', 44) + ' 청구 상대: 시장·군수 등', 'card', 'font-size:36px'), 'pop')
A(40, '시행자에게', 1400, 690, card('시행자가 정해졌다면 → 시행자', 'note'), 'rise')
A(41, '토지보상법', 1400, 820, card('매수가격·절차 = <span class="y">토지보상법</span> 준용', 'card', 'font-size:36px'), 'pop')
F(42, '공익사업', card('<span class="y">공</span>익사업을 위한 토지 등의 <span class="y">취</span>득 및 보상에 관한 <span class="y">법</span>률', 'fcard', 'font-size:58px'), sfx='whoosh', dur=2.4)
F(43, '공취법', card('공·취·법', 'fnum'))

# ---------------- S5 채권
H(4, '도시·군계획시설채권')
A(44, '현금', 430, 380, card(ic('money', 90) + '<br>원칙: 현금', 'tile'), 'pop')
A(45, '채권', 800, 380, card(ic('doc', 90) + '<br>예외: 채권', 'tile'), 'pop')
A(45, '채권', 615, 380, card('→', 'op'), 'pop', sfx='tick')
A(46, '도시·군계획시설채권', 615, 530, card('도시·군계획시설채권', 'ybox'), 'slam')
A(47, '지방자치단체', 615, 630, card('매수의무자 = <span class="r">지방자치단체</span>일 때만', 'warn'), 'pop', sfx='impact')
A(48, '두 가지', 1400, 300, card('채권 발행 가능한 경우', 'cbox'), 'slam')
A(49, '원하는', 1400, 400, card('① 토지소유자가 원하는 경우', 'card', 'font-size:36px'), 'pop')
A(50, '부재부동산', 1400, 495, card('② 부재부동산·비업무용 토지', 'card', 'font-size:36px'), 'pop')
A(51, '3천만원', 1400, 610, '<div class="bar"><div class="b1">3천만원까지 현금</div><div class="b2">초과분 → 채권</div></div>', 'rise', sfx='ding')
A(52, '상환기간', 560, 790, card('상환기간 <span class="y">10년 이내</span> · 조례로', 'chip'), 'pop')
A(53, '이율', 1330, 790, card('이율 ≥ 1년 만기 정기예금금리 평균', 'chip'), 'pop')
A(54, '지방재정법', 960, 885, card('발행절차: <span class="y">지방재정법</span>', 'chip'), 'pop')

# ---------------- S6 흐름
H(5, '매수 흐름 · 진짜 미안')
FX = [(260, '결정고시'), (720, '매수청구'), (1180, '통보'), (1640, '매수')]
A(56, '10년', 260, 330, card('결정고시', 'node'), 'pop')
A(56, '10년', 490, 330, card('10년 →', 'arrow'), 'pop', sfx='tick')
A(56, '매수청구', 720, 330, card('매수청구', 'node'), 'pop')
A(57, '6개월', 950, 330, card('6개월 →', 'arrow'), 'pop', sfx='tick')
A(57, '알립니다', 1180, 330, card('매수 여부 통보', 'node'), 'pop')
A(58, '2년', 1410, 330, card('2년 →', 'arrow'), 'pop', sfx='tick')
A(58, '사야', 1640, 330, card('매수', 'node'), 'pop')
A(59, '안 사겠다', 1180, 450, card('매수 안 함', 'rbox'), 'pop')
A(60, '2년이', 1640, 450, card('2년 지나도 미매수', 'rbox'), 'pop')
F(61, '진짜', card('<span class="r">진짜 미안!</span>', 'fcard'))
A(62, '허가', 960, 570, card('허가 받아 건축 가능 (3층 이하)', 'cbox'), 'slam')
A(63, '단독주택', 430, 690, card(ic('house', 56) + ' 단독주택', 'card'), 'pop')
A(64, '제1종', 960, 690, card('제1종 근린생활시설', 'card'), 'pop')
A(65, '제2종', 1490, 690, card('제2종 근린생활시설', 'card'), 'pop')
for n, (k, xx, yy) in enumerate([('단란주점', 1370, 790), ('안마시술소', 1610, 790), ('노래연습장', 1370, 870), ('다중생활시설', 1610, 870)]):
    A(66, k, xx, yy, card(k, 'ex'), 'pop', sfx='tick')
F(67, '단안노다', card('<span class="r">단·안·노·다</span> 제외', 'fnum', 'font-size:130px'))
A(68, '공작물', 430, 800, card(ic('tower', 50) + ' 공작물', 'card'), 'pop')
A(69, '조례', 900, 870, card('허용범위는 조례로 따로 정할 수 있음', 'note'), 'rise')

# ---------------- S7 20년
H(6, '20년 · 자동 실효')
A(71, '20년이', 620, 440, card('<div class="cal">D</div>20년이 되는 날', 'calc'), 'pop')
A(72, '다음 날', 1300, 440, card('<div class="cal y">D+1</div>다음 날', 'calc hot'), 'slam', sfx='ding')
A(72, '효력', 1300, 610, card('효력 상실', 'rbox'), 'pop')
A(73, '자동 실효', 960, 740, card('자동 실효', 'stamp'), 'stamp', sfx='impact')
A(75, '정답', 620, 610, card('✗', 'ex', 'font-size:60px;padding:6px 30px'), 'pop')
F(75, '정답', card('정답: <span class="y">다음 날</span>', 'fcard'), sfx='ding', dur=1.2)
A(76, '고시', 960, 880, card('시·도지사·대도시 시장 → 지체 없이 실효 고시', 'chip'), 'rise')

# ---------------- S8 해제권고
H(7, '지방의회 해제권고')
A(78, '해제권고', 960, 290, card('해제권고 제도', 'big', 'font-size:70px'), 'slam', sfx='impact')
A(79, '필요성', 330, 430, card('설치 필요성 없어진 시설', 'card', 'font-size:32px'), 'pop')
A(80, '10년', 330, 520, card('10년 넘게 미집행 시설', 'card', 'font-size:32px'), 'pop')
A(81, '시장', 820, 480, card(ic('person', 56) + '<br>시장·군수 등', 'tile'), 'pop')
A(81, '지방의회', 1450, 480, card(ic('council', 56) + '<br>지방의회', 'tile'), 'pop')
A(81, '보고', 1135, 430, card('현황·집행계획 보고 →', 'arrow'), 'pop', sfx='tick')
A(82, '매년', 1135, 510, card('매년 정례회·임시회', 'note', 'font-size:26px'), 'rise')
A(83, '90일', 1135, 610, card('← 해제권고 <span class="y">90일</span> 이내', 'arrow'), 'pop', sfx='ding')
A(84, '1년', 820, 720, card('<span class="y">1년</span> 이내 해제 결정', 'ybox', 'font-size:36px'), 'pop', sfx='ding')
A(85, '도지사', 820, 820, card('도지사 결정 계획 → 도지사에 신청', 'note'), 'rise')
A(87, '6개월', 1450, 720, card('특별한 사유 → <span class="y">6개월</span> 이내 소명', 'warn', 'font-size:32px'), 'pop', sfx='ding')
F(88, '90일', card('90일 · 1년 · 6개월', 'fnum', 'font-size:120px'))

# ---------------- S9 해제신청
H(8, '토지소유자의 해제신청')
A(89, '직접', 960, 290, card(ic('person', 50) + ' 땅 주인이 직접!', 'cbox'), 'slam')
A(90, '10년', 960, 380, card('10년 넘게 미집행 + 실효 때까지 집행계획 없음', 'note'), 'rise')
A(91, '입안권자', 470, 760, card('① 입안권자<br><small>해제 입안 신청</small>', 'step'), 'pop')
A(92, '3개월', 470, 880, card('3개월 이내 통지', 'ybox', 'font-size:30px'), 'pop', sfx='ding')
A(93, '결정권자', 960, 620, card('② 결정권자<br><small>해제 신청</small>', 'step'), 'pop')
A(94, '2개월', 960, 740, card('2개월 이내 통지', 'ybox', 'font-size:30px'), 'pop', sfx='ding')
A(95, '국토교통부장관', 1450, 480, card('③ 국토교통부장관<br><small>해제 심사 신청</small>', 'step'), 'pop')
A(96, '권고', 1450, 600, card('결정권자에 해제 권고', 'ybox', 'font-size:30px'), 'pop')
A(97, '그림으로', 1450, 800, card('그림으로 흐름 기억!', 'note'), 'rise')

# ---------------- S10 총정리
H(9, '총정리')
A(99, '건축 금지', 260, 470, card('원칙<br><span class="r">건축 금지</span>', 'sum'), 'pop', out=106)
A(100, '2년', 760, 470, card('2년 · 쪼끔 미안<br><small>가설건축물·공작물·개축·재축</small>', 'sum'), 'pop', out=106)
A(101, '10년', 1260, 470, card('10년 · 매수청구<br><small>지목 대</small>', 'sum'), 'pop', out=106)
A(102, '진짜', 1260, 670, card('진짜 미안<br><small>3층 이하 단독·1·2종 근생·공작물</small>', 'sum'), 'pop', out=106)
A(103, '20년', 1690, 470, card('20년<br><span class="y">다음 날 실효</span>', 'sum'), 'pop', out=106)
A(104, '해제권고', 760, 740, card('지방의회 해제권고 · 90일 · 1년 · 6개월', 'chip'), 'rise', out=106)
F(105, '흐름', card('공법은 <span class="y">흐름</span>이다!', 'fcard'))
A(106, '최신', 960, 420, card('실제 적용 전 최신 법령과 관할 행정기관을 꼭 확인하세요', 'note', 'font-size:36px'), 'rise')
A(107, '공법의', 960, 600, card('공법의 신 <span class="y">고상철</span>', 'big', 'font-size:96px'), 'slam', sfx='impact')

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

TL = {'show': round(S(6) + 1.5, 3), 'marks': [(scenes[1]['t0'], 0), (scenes[2]['t0'], 1), (scenes[3]['t0'], 2), (scenes[6]['t0'], 3), (scenes[7]['t0'], 2), (scenes[9]['t0'], -1)],
      'labels': [(0, kt(13, '건축 금지'), '건축 금지'), (1, kt(29, '쪼끔'), '쪼끔 미안'), (2, kt(33, '매수청구'), '매수청구'), (2, kt(61, '진짜'), '진짜 미안'), (3, kt(73, '자동 실효'), '자동 실효')]}
END = scenes[-1]['t1']
open('render/data.js', 'w').write('const ITEMS=' + json.dumps(out, ensure_ascii=False) + ';\nconst SUBS=' + json.dumps(subs, ensure_ascii=False)
                                  + ';\nconst SCENES=' + json.dumps(scenes, ensure_ascii=False) + ';\nconst TL=' + json.dumps(TL) + f';\nconst END={END};\n')
sfx = [[o['t'], ITEMS[n].get('sfx') or ('pop' if not o['chapter'] else 'whoosh')] for n, o in enumerate(out)]
json.dump({'sfx': sfx, 'end': END, 'scenes': scenes}, open('sfx.json', 'w'))
print('items', len(out), 'subs', len(subs), 'end', END)
