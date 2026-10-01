ICON.update({
 'drop': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M32 6 C20 24 14 34 14 42 a18 18 0 0 0 36 0 C50 34 44 24 32 6Z" fill="#22D3EE"/></svg>',
 'factory': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M6 58 V30 L20 38 V30 L34 38 V30 L48 38 V12 H58 V58Z" fill="#9fd8ff"/><rect x="14" y="46" width="8" height="8" fill="#0b1020"/><rect x="30" y="46" width="8" height="8" fill="#0b1020"/></svg>',
 'field': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><rect x="4" y="34" width="56" height="24" rx="4" fill="#34E28A"/><path d="M12 34 V22 M22 34 V18 M32 34 V22 M42 34 V18 M52 34 V22" stroke="#FFD60A" stroke-width="4"/></svg>',
 'mountain': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><path d="M2 56 L24 18 L36 36 L44 26 L62 56Z" fill="#34E28A"/><path d="M24 18 L30 28 L18 28Z" fill="#fff"/></svg>',
 'nature': '<svg width="{s}" height="{s}" viewBox="0 0 64 64"><circle cx="32" cy="26" r="18" fill="#34E28A"/><rect x="29" y="40" width="6" height="18" fill="#a0703c"/></svg>',
})
H(1, '원칙 · 시행령 별표')
H(2, '예외 · 개별법')
H(3, '① 농공단지')
H(4, '② 농림지역 · 농산초')
H(5, '③ 자연환경보전 · 자수문해수')
H(6, '★ 핵심 함정')
H(7, '문제 푸는 순서')
H(8, '총정리')
# S1 hook
A(0, '상수원', 960, 330, card(ic('drop', 80) + ' 상수원보호구역이면<br>무조건 <span class="y">수도법</span>?', 'card', 'font-size:60px;padding:26px 50px'), 'slam', sfx='impact')
A(1, '그렇다고', 700, 580, card('대부분: "네!"', 'chip', 'font-size:44px'), 'pop')
A(2, '함정', 1260, 580, card('함정!', 'stamp'), 'stamp', sfx='impact')
A(3, '용도지역', 960, 760, card('정답 = 어느 <span class="y">용도지역</span>에 지정됐는가', 'ybox', 'font-size:46px'), 'pop', sfx='ding')
A(4, '원칙과', 960, 880, card('용도지역 건축제한 · 원칙과 예외', 'chip'), 'rise')
# S2 원칙
A(6, '대통령령', 520, 330, card('용도지역 건축제한 = <span class="y">대통령령</span>', 'card', 'font-size:38px'), 'pop')
A(7, '시행령', 520, 440, card('국토계획법 시행령 제71조', 'ybox', 'font-size:40px'), 'pop')
A(8, '별표', 520, 600, card('별표 2 ~ 22', 'num', 'font-size:140px'), 'slam', sfx='ding')
ZONES = ['1종전용주거','2종전용주거','1종일반주거','2종일반주거','3종일반주거','준주거','중심상업','일반상업','근린상업','유통상업','전용공업','일반공업','준공업','보전녹지','생산녹지','자연녹지','보전관리','생산관리','계획관리','농림','자연환경보전']
grid = '<div style="display:grid;grid-template-columns:repeat(3,250px);gap:8px">' + ''.join(
    f'<div style="background:{"#FFD60A" if n in (0,20) else "#15213d"};color:{"#111" if n in (0,20) else "#fff"};border-radius:8px;padding:6px 10px;font-size:22px;font-weight:800;display:flex;justify-content:space-between"><span>{z}</span><span style="opacity:.6">별표{n+2}</span></div>' for n, z in enumerate(ZONES)) + '</div>'
A(9, '별표 2는', 1400, 330, card('별표 2 = 제1종전용주거지역', 'chip', 'font-size:32px'), 'pop')
A(10, '별표 22는', 1400, 410, card('별표 22 = 자연환경보전지역', 'chip', 'font-size:32px'), 'pop')
A(11, '21개', 1400, 640, grid, 'rise', sfx='ding')
A(12, '조례', 1260, 880, card('용도지구 → <span class="y">조례</span>', 'cbox', 'font-size:40px'), 'pop')
A(13, '용도지역은', 660, 880, card('용도지역 → <span class="r">대통령령</span>', 'ybox', 'font-size:40px'), 'pop')
# S3 예외
F(14, '예외', card('BUT! <span class="y">예외</span>', 'fnum'))
A(15, '개별법', 960, 340, card('국토계획법 ✗ → <span class="y">개별법</span> ○', 'card', 'font-size:52px'), 'slam')
A(16, '제76조', 960, 460, card('국토계획법 제76조 제5항', 'chip'), 'pop', sfx='ding')
A(17, '세', 960, 560, card('크게 세 덩어리', 'note'), 'rise')
for k, x, ico, nm in [('농공단지', 480, 'factory', '농공단지'), ('농림지역', 960, 'field', '농림지역'), ('자연환경보전지역', 1440, 'nature', '자연환경보전지역')]:
    A(18, k, x, 730, card(ic(ico, 90) + '<br>' + nm, 'tile', 'font-size:40px;min-width:330px'), 'pop')
# S4 농공단지
A(19, '농공단지', 560, 480, card(ic('factory', 110) + '<br>농공단지', 'tile', 'font-size:50px;min-width:360px'), 'slam')
A(20, '산업입지', 560, 680, card('「산업입지 및 개발에 관한 법률」', 'note'), 'rise')
A(21, '산업입지법', 960, 480, card('→', 'op', 'font-size:60px'), 'pop', sfx='tick')
A(21, '산업입지법', 1360, 480, card('산업입지법 적용', 'ybox', 'font-size:56px'), 'slam', sfx='ding')
A(22, '그대로', 1360, 640, card('법 이름 그대로 따라간다!', 'note'), 'rise')
# rows helper
def row(i, kz, kl, y, zone, law, badge=None, xz=700, xl=1340, fz=38):
    if badge: A(i, kz, 300, y, f'<div style="width:96px;height:96px;border-radius:50%;background:#FFD60A;color:#111;font-weight:900;font-size:56px;display:flex;align-items:center;justify-content:center">{badge}</div>', 'slam', sfx='tick')
    A(i, kz, xz, y, card(zone, 'card', f'font-size:{fz}px'), 'pop')
    A(i, kl, (xz + xl) // 2 + 40, y, card('→', 'arrow', 'font-size:44px'), 'pop')
    A(i, kl, xl, y, card(law, 'ybox', f'font-size:{fz}px'), 'pop', sfx='ding')
# S5 농림
A(23, '농림지역', 960, 320, card(ic('field', 60) + ' 농림지역', 'cbox', 'font-size:52px'), 'slam')
A(24, '세', 960, 410, card('그중 3가지', 'note'), 'rise')
row(25, '농업진흥지역', '농지법', 530, '농업진흥지역', '농지법', '농')
row(26, '보전산지', '산지관리법', 660, '보전산지', '산지관리법', '산')
row(27, '초지', '초지법', 790, '초지', '초지법', '초')
F(28, '농산초', card('농 · 산 · 초', 'fnum'))
# S6 자연환경보전
A(30, '자연환경보전지역', 1280, 330, card(ic('nature', 56) + ' 자연환경보전지역', 'cbox', 'font-size:48px'), 'slam')
A(31, '다섯', 1280, 405, card('다섯 덩어리', 'note'), 'rise')
row(32, '공원구역', '자연공원법', 470, '자연공원법 · 공원구역', '자연공원법', '자', fz=34)
row(33, '상수원', '수도법을', 560, '수도법 · 상수원보호구역', '수도법', '수', fz=34)
row(34, '지정문화유산', '문화유산법과', 650, '지정문화유산·천연기념물 등 + 보호구역', '문화유산법·자연유산법', '문', xz=690, xl=1400, fz=30)
row(35, '해양보호구역', '해양생태계법', 740, '해양보호구역', '해양생태계법', '해', fz=34)
row(36, '수산자원보호구역', '수산자원관리법', 830, '수산자원보호구역', '수산자원관리법', '수', fz=34)
F(37, '자수문해수', card('자 · 수 · 문 · 해 · 수', 'fnum', 'font-size:140px'))
# S7 함정
F(39, '핵심', card('<span class="r">오늘의 핵심 함정</span>', 'fcard'))
def zone_box(name, col): return (f'<div style="width:640px;height:300px;border:5px solid {col};border-radius:24px;background:rgba(255,255,255,.04);position:relative">'
    f'<div style="position:absolute;left:24px;top:16px;font-weight:900;font-size:40px;color:{col}">{name}</div>'
    f'<div style="position:absolute;left:50%;top:60%;transform:translate(-50%,-50%);background:#fff;color:#111;font-weight:900;font-size:38px;padding:14px 26px;border-radius:14px">{ic("drop",44)} 상수원보호구역</div></div>')
A(40, '농림지역에', 540, 480, zone_box('농림지역', '#34E28A'), 'pop')
A(41, '수도법을', 540, 740, card('수도법 적용?', 'card', 'font-size:46px'), 'pop', out=42)
A(42, '아닙니다', 540, 740, card('✗ 아닙니다', 'stamp', 'font-size:80px'), 'stamp', out=44, sfx='impact')
A(43, '자연환경보전지역', 1380, 480, zone_box('자연환경보전지역', '#22D3EE'), 'pop')
A(43, '적용됩니다', 1380, 740, card('수도법 ○', 'ybox', 'font-size:52px'), 'slam', sfx='ding')
A(44, '별표', 540, 740, card('국토계획법 시행령 별표', 'ybox', 'font-size:44px'), 'pop')
A(45, '21', 540, 850, card('농림지역 = 별표 21', 'chip', 'font-size:38px'), 'pop', sfx='ding')
A(46, '어느', 1380, 880, card('같은 구역이라도 <span class="y">지역</span>이 답을 바꾼다', 'note', 'font-size:36px'), 'rise')
# S8 순서
A(48, '용도지역인지', 480, 740, card('① 용도지역 확인', 'step'), 'pop', sfx='ding')
A(49, '구역인지', 960, 610, card('② 그 안의 구역 확인', 'step'), 'pop', sfx='ding')
A(50, '예외', 1440, 480, card('③ 예외 목록 대조', 'step'), 'pop', sfx='ding')
A(51, '농산초', 700, 880, card('농림지역 → 농산초', 'chip'), 'pop')
A(51, '자수문해수', 1300, 880, card('자연환경보전지역 → 자수문해수', 'chip'), 'pop')
A(52, '목록에', 1440, 620, card('없으면 → 원칙(시행령 별표)', 'note'), 'rise')
F(53, '지역', card('지역 먼저!', 'fnum'))
# S9 총정리
A(55, '원칙은', 260, 470, card('원칙<br><span class="y">시행령 별표 2~22</span>', 'sum'), 'pop', out=61)
A(57, '농공단지는', 760, 470, card('농공단지<br><span class="y">산업입지법</span>', 'sum'), 'pop', out=61)
A(58, '농림지역', 1260, 470, card('농림지역<br><span class="y">농·산·초</span><br><small>농지법·산지관리법·초지법</small>', 'sum'), 'pop', out=61)
A(59, '자연환경보전지역', 1690, 470, card('자연환경보전<br><span class="y">자·수·문·해·수</span><br><small>각각의 개별법</small>', 'sum'), 'pop', out=61)
A(60, '지역을', 960, 760, card('지역 먼저 → 구역은 그다음', 'cbox', 'font-size:48px'), 'slam', out=61, sfx='impact')
A(61, '최신', 960, 420, card('실제 적용 전 최신 법령과 관할 행정기관을 꼭 확인하세요', 'note', 'font-size:36px'), 'rise')
A(62, '공법의', 960, 600, card('공법의 신 <span class="y">고상철</span>', 'big', 'font-size:96px'), 'slam', sfx='impact')
