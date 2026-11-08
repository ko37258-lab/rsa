// 광고용 모션 어휘 눈 검수 시트(Playwright).
//   node tests/motion-sheet.cjs [--sections <폴더>]
// 매물 광고 장면(가격 tag·stamp '급매'·label '거실'·brand 상호·전화·ending.cta '문의하기')으로 새 어휘를 한 장에 그립니다 → tests/out/motion-sheet.png
//   (a) photoIn 4종 × 0.1/0.25/0.45초(full) + card 에서 4종      (b) deco 4종(sweep·bars·frame·bokeh)
//   (c) lower3·stamp·ribbon 을 full/split/card/dark/band × 9:16·16:9·1:1 + 훅 배경·글자 장면·슬라이드-인 중
//   (d) titleAnim 3종 × 0.2/0.5/0.9초                             (e) flash·push 전환 중간(장면→장면·장면→엔딩)
//   (f) ending.cta 엔딩 0.3/1.0초(9:16·16:9·1:1)                  (g) photoFit smart — 가로 사진(b01·l01)을 9:16 full·band·card 에, 1:1·16:9 도
//   (h) fx:'ad' 의 pin·price·counter·vs·dots·news·steps·quote
// --sections 폴더를 주면 절마다 큰 그림(motion-a.png …)도 따로 저장합니다(세부 확인용).
// 마지막에 새 어휘를 모두 켠 조합의 1080×1920 프레임 시간(전체 평균·장면 앞 0.6초 평균)을 잽니다.
// tests/style-sheet.html 페이지를 열어 글꼴(@font-face)을 쓰고, 그리기 모듈은 그 페이지 안에서 직접 import 합니다.
// 정적 서버가 http://127.0.0.1:5173/ 에 떠 있어야 합니다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const BASE_URL = process.env.MRK_BASE || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, 'out');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXPECTED_404 = /\/assets\/samples\/[^/]+\.jpg$|\/api\/health$/;
const argv = process.argv.slice(2);
const SECTION_DIR = argv.includes('--sections') ? argv[argv.indexOf('--sections') + 1] : '';

function savePng(dataUrl, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// ── 페이지 안에서 돌아가는 코드(문자열로 넘겨 window.motion 에 붙입니다) ──
const PAGE_CODE = String.raw`
(async () => {
  const R = await import('./js/shorts-render.js');
  const { sample } = await import('./js/samples.js');

  const BRAND = { name: '미스터홈즈공인중개사사무소', phone: '031-000-0000' };
  const BASE = {
    aspect: '9:16', template: 'full', font: '800', captionSize: 66, captionStyle: 'pill', captionAnim: 'none', overlay: 'none',
    motion: 'in', transition: 'fade', titleMode: 'band', textColor: '#ffffff', highlightColor: '#c9a227', bandColor: '#0b0d14',
    panelColor: '#ffffff', inkColor: '#111111', showProgress: true,
    title: '*신축* 아파트 34평\n남향 급매', channel: '미스터홈즈', dateLabel: '2026.11.08',
    ending: { enabled: true, text: '*문의*는 지금', sub: '미스터홈즈공인중개사사무소', duration: 2.5, cta: '문의하기' },
    brand: BRAND, logo: null, scenes: [],
  };
  const P = {};
  for (const id of ['a01-apt-exterior', 'a02-apt-living', 'a03-apt-kitchen', 'a04-apt-bedroom', 'a05-apt-bath', 'b01-shop-front', 'b02-shop-inside', 'l01-land-road', 'o01-office-front', 'v01-villa-before', 'v02-villa-after']) {
    P[id.slice(0, 3)] = await sample(id);
  }
  /** 매물 광고 장면(아파트) */
  const listing = () => [
    { caption: '이 집, *3초*만 보세요', img: P.a01, kind: 'hook', duration: 2.6, tag: '4.2억', stamp: '급매', label: '외관' },
    { caption: '거실 *남향* 통창', img: P.a02, duration: 2.8, tag: '남향', label: '거실', stamp: '급매' },
    { caption: '*ㄷ자* 주방, 식탁 자리 넉넉', img: P.a03, duration: 2.8, tag: '즉시입주', label: '주방', stamp: '올수리' },
    { caption: '안방 *드레스룸* 별도', img: P.a04, duration: 2.6, tag: 'D-3', label: '안방' },
    { caption: '문의는 *설명란 연락처*로', img: null, kind: 'cta', duration: 2.2, tag: '선착순', stamp: '상담 무료' },
  ];
  /** fx:'ad' 점검용 장면(상가·전후 비교·숫자) */
  const fxScenes = () => [
    { caption: '이 상가, *월세* 얼마?', img: P.b01, kind: 'hook', duration: 2.6, tag: '4.2억', label: '코너 상가' },
    { caption: '*코너* 1층, 유동인구 많은 자리', img: P.b01, duration: 3, tag: '보증금 3천', label: '전면', counter: { from: 0, to: 150, suffix: '만원' } },
    { caption: '리모델링 *전후* 비교', img: P.v01, img2: P.v02, duration: 3, labelA: '전', labelB: '후', label: '거실' },
    { caption: '수익률은 *예시*입니다', img: null, duration: 2.6, counter: { from: 0, to: 62, suffix: '%' } },
    { caption: '문의는 *설명란 연락처*로', img: P.o01, kind: 'cta', duration: 2.4 },
  ];

  const fontsReady = new Set();
  async function project(over = {}, scenes = listing()) {
    const p = { ...BASE, ...over, scenes };
    if (!fontsReady.has(p.title)) { await R.ensureFonts(p); fontsReady.add(p.title); }
    return p;
  }
  /** p 를 t 초에 cellW 폭 타일로. 예외는 errors 에 */
  function cell(p, t, id, label, sub, cellW, errors) {
    const d = R.dims(p.aspect);
    const W = cellW;
    const H = Math.round((d.H * cellW) / d.W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const tl = R.buildTimeline(p);
    try { R.drawFrame(c.getContext('2d'), p, W, H, t, tl); }
    catch (e) { errors.push({ id, t, message: String((e && e.stack) || e) }); }
    return { canvas: c, id, label, sub: sub || (p.template + '/' + p.overlay + '/' + p.aspect) };
  }
  const seg = (p, i) => R.buildTimeline(p).segs[i];

  /** 타일 [{canvas, id, label, sub}] → 격자 캔버스(타일은 boxW×boxH 상자에 가운데 맞춤, 아래 글 3줄) */
  function grid(cells, boxW, boxH, cols) {
    const rows = Math.ceil(cells.length / cols);
    const fs = Math.max(12, Math.min(20, Math.round(boxW / 22)));
    const labelH = Math.round(fs * 4.2);
    const gap = 14;
    const sheet = document.createElement('canvas');
    sheet.width = cols * (boxW + gap) + gap;
    sheet.height = rows * (boxH + labelH + gap) + gap;
    const g = sheet.getContext('2d');
    g.fillStyle = '#15171c';
    g.fillRect(0, 0, sheet.width, sheet.height);
    const fit = (text, maxW) => { let s = String(text); while (s.length > 2 && g.measureText(s).width > maxW) s = s.slice(0, -2) + '…'; return s; };
    cells.forEach((cellItem, i) => {
      const x = gap + (i % cols) * (boxW + gap);
      const y = gap + Math.floor(i / cols) * (boxH + labelH + gap);
      g.fillStyle = '#000';
      g.fillRect(x, y, boxW, boxH);
      const c = cellItem.canvas;
      const s = Math.min(boxW / c.width, boxH / c.height);
      const w = Math.round(c.width * s);
      const h = Math.round(c.height * s);
      g.drawImage(c, x + Math.round((boxW - w) / 2), y + Math.round((boxH - h) / 2), w, h);
      g.textBaseline = 'top';
      g.font = '700 ' + fs + 'px "Pretendard Variable", sans-serif';
      g.fillStyle = '#8fd3ff';
      g.fillText(fit(cellItem.id, boxW), x, y + boxH + 6);
      g.fillStyle = '#eee';
      g.fillText(fit(cellItem.label, boxW), x, y + boxH + 6 + fs * 1.3);
      g.font = '500 ' + Math.round(fs * 0.85) + 'px "Pretendard Variable", sans-serif';
      g.fillStyle = '#9aa';
      g.fillText(fit(cellItem.sub || '', boxW), x, y + boxH + 6 + fs * 2.6);
    });
    return sheet;
  }

  // ── 절(section)마다 타일 목록 ──
  const EXTRAS = ['lower3', 'stamp', 'ribbon'];

  async function sectionA(errors) {
    const cells = [];
    for (const photoIn of ['push', 'reveal', 'pop', 'iris', 'plate']) {
      const p = await project({ photoIn, overlay: 'price', extras: ['lower3'] });
      const s = seg(p, 1);
      for (const dt of [0.1, 0.25, 0.45]) cells.push(cell(p, s.start + dt, 'photoIn ' + photoIn + ' +' + dt + 's', '사진 등장 ' + photoIn + ' (full, 짝수 장면)', 'full / 거실 장면 시작 ' + dt + '초', 360, errors));
    }
    const ph = await project({ photoIn: 'push', overlay: 'price' });
    cells.push(cell(ph, 0.2, '훅 배경 줌 정착 t=0.2', 'photoIn 이 켜지면 훅 사진 1.06→1 (0.5초)', 'full / 훅 장면', 360, errors));
    for (const photoIn of ['push', 'reveal', 'pop', 'iris']) {
      const p = await project({ photoIn, template: 'card', bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain', extras: ['stamp'] });
      const s = seg(p, 2);
      cells.push(cell(p, s.start + 0.25, 'photoIn ' + photoIn + ' card +0.25s', '사진 등장 ' + photoIn + ' (card, 홀수 장면=왼쪽에서)', 'card / 주방 장면 0.25초', 360, errors));
    }
    // 밀기 전환 뒤 시작(fx.delay): slide 전환 + push 등장, 전환 한가운데와 전환 끝 0.2초 뒤
    const p2 = await project({ photoIn: 'push', transition: 'slide', overlay: 'price' });
    const s2 = seg(p2, 1);
    cells.push(cell(p2, s2.start + 0.25, 'push + slide 전환 +0.25s', '전환 중엔 색판만 밀려 들어옴(delay)', 'full / slide 전환 한가운데', 360, errors));
    cells.push(cell(p2, s2.start + 0.7, 'push + slide 전환 +0.7s', '전환 끝(0.5초) 뒤 사진이 밀고 들어옴', 'full / slide 전환 뒤 0.2초', 360, errors));
    return { title: '(a) photoIn — 사진 등장 4종', cells, boxW: 360, boxH: 640, cols: 7 };
  }

  async function sectionB(errors) {
    const cells = [];
    const pf = await project({ deco: ['sweep'], overlay: 'price' });
    cells.push(cell(pf, seg(pf, 1).start + 0.65, 'deco sweep +0.65s', '빛 띠가 사진 가운데를 지나는 순간', 'full', 360, errors));
    cells.push(cell(pf, seg(pf, 1).start + 0.85, 'deco sweep +0.85s', '빛 띠 오른쪽으로', 'full', 360, errors));
    const pb = await project({ deco: ['bars'], overlay: 'stamp', titleMode: 'hook', captionAnim: 'pop', captionStyle: 'plain', bandColor: '#0a0a0a', highlightColor: '#4f8cff' });
    cells.push(cell(pb, seg(pb, 1).start + 1.4, 'deco bars (full)', '위아래 레터박스 + 강조선', 'full / titleMode hook', 360, errors));
    cells.push(cell(pb, seg(pb, 0).start + 1.9, 'deco bars 훅 배경', '훅 배경(틴트 사진)에도 레터박스', 'full / 훅 장면', 360, errors));
    cells.push(cell(pb, seg(pb, 4).start + 1.0, 'deco bars 글자 장면', '사진 없는 장면: 패널 위아래 띠', 'full / 글자 장면', 360, errors));
    const ps = await project({ deco: ['frame'], template: 'split', panelColor: '#eaf7e4', highlightColor: '#1fcf62', captionStyle: 'tag', overlay: 'pin' });
    cells.push(cell(ps, seg(ps, 1).start + 0.3, 'deco frame +0.3s', '액자 선이 반쯤 그려짐', 'split', 360, errors));
    cells.push(cell(ps, seg(ps, 1).start + 1.2, 'deco frame 완성', '액자 선 완성(28u 안쪽)', 'split', 360, errors));
    const pd = await project({ deco: ['bokeh'], template: 'dark', overlay: 'counter', highlightColor: '#00e5a0', captionStyle: 'plain' }, fxScenes());
    cells.push(cell(pd, seg(pd, 1).start + 1.5, 'deco bokeh (dark)', '검은 배경에 민트 빛방울', 'dark', 360, errors));
    cells.push(cell(pd, seg(pd, 3).start + 1.5, 'deco bokeh 글자 장면', '숫자 장면', 'dark', 360, errors));
    const pc = await project({ deco: ['bokeh', 'sweep'], template: 'card', bandColor: '#2b1b4f', highlightColor: '#c6ff3a', captionStyle: 'pill' });
    cells.push(cell(pc, seg(pc, 1).start + 0.6, 'deco bokeh+sweep (card)', '도트 배경 위 보케 + 카드 안 빛 띠', 'card', 360, errors));
    const pband = await project({ deco: ['bokeh', 'frame'], template: 'band' });
    cells.push(cell(pband, seg(pband, 1).start + 1.0, 'deco bokeh+frame (band)', '자막 칸·제목 띠에 보케', 'band', 360, errors));
    const pv = await project({ deco: ['vignette'], overlay: 'price' });
    cells.push(cell(pv, seg(pv, 1).start + 1.4, 'deco vignette (full)', '가장자리 검정 45%', 'full', 360, errors));
    cells.push(cell(pv, seg(pv, 0).start + 1.6, 'deco vignette 훅 배경', '훅 틴트 위 비네트', 'full / 훅 장면', 360, errors));
    const pvd = await project({ deco: ['vignette'], template: 'dark', overlay: 'counter', highlightColor: '#00e5a0', captionStyle: 'plain' }, fxScenes());
    cells.push(cell(pvd, seg(pvd, 1).start + 1.4, 'deco vignette (dark)', '썸네일 칸만 비네트', 'dark', 360, errors));
    const pvb = await project({ deco: ['vignette'], template: 'blur' });
    cells.push(cell(pvb, seg(pvb, 1).start + 1.4, 'deco vignette (blur)', '흐린 배경 전체에 비네트', 'blur', 360, errors));
    return { title: '(b) deco — sweep · bars · frame · bokeh · vignette', cells, boxW: 360, boxH: 640, cols: 7 };
  }

  async function sectionC(errors) {
    const cells = [];
    const tpls = { full: {}, split: { panelColor: '#eaf7e4', highlightColor: '#1fcf62' }, card: { bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain' }, dark: { highlightColor: '#00e5a0', captionStyle: 'plain' }, band: {} };
    for (const aspect of ['9:16', '16:9', '1:1']) {
      for (const [template, extra] of Object.entries(tpls)) {
        const p = await project({ template, aspect, extras: EXTRAS, ...extra });
        const s = seg(p, 1);
        const w = aspect === '16:9' ? 640 : aspect === '1:1' ? 480 : 360;
        cells.push(cell(p, s.start + 1.4, 'extras ' + template + ' ' + aspect, 'lower3·stamp·ribbon 함께 (사진 장면)', template + ' / ' + aspect, w, errors));
      }
    }
    const pf = await project({ extras: EXTRAS, overlay: 'price' });
    cells.push(cell(pf, seg(pf, 0).start + 1.6, 'extras 훅 배경 + price', '훅: 도장은 가격 칩 아래 가운데, 리본은 화면 모서리', 'full / 훅 장면', 360, errors));
    cells.push(cell(pf, seg(pf, 4).start + 1.0, 'extras 글자 장면', '사진 없는 장면: 바는 화면 왼쪽 아래, 도장·리본은 패널', 'full / 글자 장면', 360, errors));
    cells.push(cell(pf, 0.15, 'lower3 슬라이드-인 0.15s', '영상 시작 0.35초 동안 왼쇽에서 밀려 들어옴', 'full / t=0.15', 360, errors));
    const pb = await project({ template: 'band', overlay: 'lower3', extras: ['stamp'] });
    cells.push(cell(pb, seg(pb, 1).start + 1.4, 'overlay=lower3 (주 장식)', '주 장식으로 쓴 로워서드 + 도장(오른쪽 위)', 'band / overlay lower3', 360, errors));
    const pd = await project({ template: 'dark', extras: EXTRAS, highlightColor: '#00e5a0', captionStyle: 'plain' });
    cells.push(cell(pd, seg(pd, 4).start + 1.0, 'extras dark 글자 장면', '리본은 화면 모서리, 바는 왼쪽 아래', 'dark / 글자 장면', 360, errors));
    const ps = await project({ template: 'split', extras: EXTRAS, panelColor: '#eaf7e4', highlightColor: '#1fcf62', aspect: '16:9' });
    cells.push(cell(ps, seg(ps, 4).start + 1.0, 'extras split 16:9 글자 장면', '패널색 위 흰 바', 'split / 16:9 글자 장면', 640, errors));
    const pw = await project({ extras: EXTRAS, overlay: 'steps', aspect: '16:9', captionStyle: 'glass', highlightColor: '#38bdf8' });
    cells.push(cell(pw, seg(pw, 0).start + 1.6, 'extras 16:9 훅 배경 + steps', '가로 훅: 도장은 위 가운데', 'full / 16:9 훅 장면', 640, errors));
    const pc = await project({ template: 'card', aspect: '1:1', extras: EXTRAS, bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain' });
    cells.push(cell(pc, seg(pc, 0).start + 1.6, 'extras card 1:1 훅', '정사각 card 훅(작은 카드): 바는 사진 위', 'card / 1:1 훅 장면', 480, errors));
    return { title: '(c) extras — lower3 · stamp · ribbon (템플릿 5 × 비율 3 + 훅·글자 장면)', cells, boxW: 640, boxH: 640, cols: 5 };
  }

  async function sectionD(errors) {
    const cells = [];
    for (const titleAnim of ['rise', 'mask', 'stamp']) {
      const p = await project({ titleAnim, template: 'band' });
      for (const t of [0.2, 0.5, 0.9]) cells.push(cell(p, titleAnim === 'rise' && t === 0.5 ? 0.65 : t, 'titleAnim ' + titleAnim + ' t=' + (titleAnim === 'rise' && t === 0.5 ? 0.65 : t), '제목 등장 ' + titleAnim + (titleAnim === 'rise' && t === 0.5 ? ' (밑줄 자라는 중)' : ''), 'band / t=' + t, 360, errors));
    }
    const p2 = await project({ titleAnim: 'rise', template: 'band', aspect: '16:9' });
    cells.push(cell(p2, 0.7, 'titleAnim rise 16:9 t=0.7', '가로 한 줄 제목 + 밑줄', 'band / 16:9', 640, errors));
    for (const titleAnim of ['slide', 'words', 'scale']) {
      const p = await project({ titleAnim, template: 'split', panelColor: '#eaf7e4', highlightColor: '#1fcf62' });
      cells.push(cell(p, 0.25, 'titleAnim ' + titleAnim + ' t=0.25', '자막 등장과 같은 움직임을 제목에', 'split / t=0.25', 360, errors));
    }
    // 훅 배경 스타일(full 훅): 제목이 둘째 장면에 처음 보이므로 시계도 둘째 장면 시작부터
    const ph = await project({ titleAnim: 'mask', template: 'full' });
    cells.push(cell(ph, seg(ph, 1).start + 0.3, 'titleAnim mask 훅 스타일 둘째 장면 +0.3s', '제목이 처음 보이는 장면 기준으로 열림', 'full / 둘째 장면', 360, errors));
    return { title: '(d) titleAnim — rise · mask · stamp × 0.2/0.5/0.9초, slide · words · scale', cells, boxW: 640, boxH: 640, cols: 5 };
  }

  async function sectionE(errors) {
    const cells = [];
    const pf = await project({ transition: 'flash', photoIn: 'push', overlay: 'price' });
    const s1 = seg(pf, 1);
    for (const dt of [0.05, 0.1, 0.15, 0.3]) cells.push(cell(pf, s1.start + dt, 'flash +' + dt + 's', dt < 0.1 ? '앞 장면 + 흰빛 오름' : dt === 0.1 ? '정점(컷)' : dt < 0.2 ? '새 장면 + 흰빛 꺼짐 + 줌' : '전환 끝, 줌 마무리', 'full / 전환 0.2초', 360, errors));
    for (const template of ['band', 'full', 'card']) {
      const p = await project({ transition: 'push', template, ...(template === 'card' ? { bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain' } : {}) });
      const s = seg(p, 1);
      for (const dt of [0.15, 0.3]) cells.push(cell(p, s.start + dt, 'push ' + template + ' +' + dt + 's', '세로 밀기(제목 띠 아래로 잘림)', template + ' / 전환 0.5초', 360, errors));
    }
    const pe = await project({ transition: 'push', template: 'band' });
    const se = seg(pe, 5);
    cells.push(cell(pe, se.start + 0.25, 'push → 엔딩 +0.25s', '엔딩이 통째로 밀려 올라옴(글 바로 보임)', 'band / 장면→엔딩', 360, errors));
    const pfe = await project({ transition: 'flash', template: 'band' });
    cells.push(cell(pfe, seg(pfe, 5).start + 0.12, 'flash → 엔딩 +0.12s', '엔딩으로 플래시 컷', 'band / 장면→엔딩', 360, errors));
    return { title: '(e) transition — flash · push', cells, boxW: 360, boxH: 640, cols: 7 };
  }

  async function sectionF(errors) {
    const cells = [];
    for (const aspect of ['9:16', '16:9', '1:1']) {
      const p = await project({ aspect });
      const se = seg(p, 5);
      const w = aspect === '16:9' ? 640 : aspect === '1:1' ? 480 : 360;
      for (const dt of aspect === '9:16' ? [0.45, 1.05, 1.6] : [1.6]) cells.push(cell(p, se.start + dt, 'ending.cta ' + aspect + ' +' + dt + 's', dt === 0.45 ? '버튼 등장 중(0.6→1, 넘침)' : dt === 1.05 ? '빛 스윕 지나는 중' : '정착(맥동) + 연락처 줄', aspect + ' / 엔딩', w, errors));
    }
    const pl = await project({ ending: { ...BASE.ending, sub: '미스터홈즈 · 031-000-0000' } });
    cells.push(cell(pl, seg(pl, 5).start + 1.6, 'ending.cta 부제에 번호 있음', '연락처 줄 생략(중복 방지)', '9:16 / 엔딩', 360, errors));
    const pn = await project({ ending: { ...BASE.ending, cta: '' } });
    cells.push(cell(pn, seg(pn, 5).start + 1.6, 'ending.cta 없음(기존)', '옛 엔딩 그대로', '9:16 / 엔딩', 360, errors));
    return { title: '(f) ending.cta — 알약 버튼 + 연락처', cells, boxW: 640, boxH: 640, cols: 5 };
  }

  async function sectionG(errors) {
    const cells = [];
    const wide = (img, label) => [
      { caption: '이 상가, *월세* 얼마?', img, kind: 'hook', duration: 2.6, tag: '4.2억', label },
      { caption: '*코너* 1층, 유동인구 많은 자리', img, duration: 3, tag: '보증금 3천', label },
      { caption: '문의는 *설명란 연락처*로', img: null, kind: 'cta', duration: 2.2 },
    ];
    for (const [key, name] of [['b01', '상가 전면(3:2)'], ['l01', '도로 접한 대지(3:2)']]) {
      for (const template of ['full', 'band', 'card']) {
        const extra = template === 'card' ? { bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain' } : {};
        const p = await project({ photoFit: 'smart', template, extras: ['lower3'], overlay: 'price', ...extra }, wide(P[key], name));
        cells.push(cell(p, seg(p, 1).start + 1.4, 'smart ' + key + ' ' + template, name + ' → 흐린 배경 + contain', template + ' / 9:16', 360, errors));
      }
    }
    const pc = await project({ photoFit: 'cover', template: 'full', overlay: 'price' }, wide(P.b01, '상가 전면'));
    cells.push(cell(pc, seg(pc, 1).start + 1.4, 'cover b01 full (기존)', '비교용: cover 는 좌우가 잘림', 'full / 9:16', 360, errors));
    const p1 = await project({ photoFit: 'smart', template: 'full', overlay: 'price' });
    cells.push(cell(p1, seg(p1, 1).start + 1.4, 'smart a02(1:1) full', '정사각 사진 → 위아래 흐림', 'full / 9:16', 360, errors));
    const ps = await project({ photoFit: 'smart', template: 'band', aspect: '1:1', overlay: 'price' }, wide(P.b01, '상가 전면'));
    cells.push(cell(ps, seg(ps, 1).start + 1.4, 'smart b01 band 1:1', '1.2배 어긋남 → cover 그대로', 'band / 1:1', 480, errors));
    const pw = await project({ photoFit: 'smart', template: 'band', aspect: '16:9', overlay: 'price' });
    cells.push(cell(pw, seg(pw, 1).start + 1.4, 'smart a02(1:1) band 16:9', '가로 band 칸(3:1) → 양옆 흐림', 'band / 16:9', 640, errors));
    const pwf = await project({ photoFit: 'smart', template: 'full', aspect: '16:9', overlay: 'price' });
    cells.push(cell(pwf, seg(pwf, 1).start + 1.4, 'smart a02(1:1) full 16:9', '가로 full → 양옆 흐림', 'full / 16:9', 640, errors));
    const pdk = await project({ photoFit: 'smart', template: 'dark', highlightColor: '#00e5a0', captionStyle: 'plain' }, wide(P.l01, '대지'));
    cells.push(cell(pdk, seg(pdk, 1).start + 1.4, 'smart l01 dark', '썸네일(0.62W×0.24H=1.46) → 3:2 는 cover', 'dark / 9:16', 360, errors));
    const psp = await project({ photoFit: 'smart', template: 'split', panelColor: '#eaf7e4', highlightColor: '#1fcf62', captionStyle: 'tag' }, wide(P.b01, '상가'));
    cells.push(cell(psp, seg(psp, 1).start + 1.4, 'smart b01 split', 'split 사진 칸(1080×662=1.63) → cover', 'split / 9:16', 360, errors));
    return { title: '(g) photoFit smart — 가로 사진(3:2)·정사각 사진', cells, boxW: 640, boxH: 640, cols: 5 };
  }

  async function sectionH(errors) {
    const cells = [];
    const fx = { fx: 'ad' };
    const pin = await project({ ...fx, overlay: 'pin', captionStyle: 'outline', highlightColor: '#22c55e' }, fxScenes());
    // fx 의 시계(fxLocal)는 전환이 끝난 뒤(fade 0.5초)부터 돌므로 장면 시작 +0.5초부터 움직임이 보입니다
    for (const dt of [0.55, 0.7, 1.0]) cells.push(cell(pin, seg(pin, 1).start + dt, 'fx pin +' + dt + 's', '핀 낙하 바운스 + 라벨 칩', 'full / pin', 360, errors));
    const price = await project({ ...fx, overlay: 'price' }, fxScenes());
    for (const dt of [0.58, 0.95]) cells.push(cell(price, seg(price, 1).start + dt, 'fx price +' + dt + 's', dt < 0.7 ? '태그 팝(1.4→1)' : '빛 스윕', 'full / price', 360, errors));
    const stamp = await project({ extras: ['stamp'], overlay: 'price' });
    for (const dt of [0.6, 0.72, 0.9]) cells.push(cell(stamp, seg(stamp, 1).start + dt, 'stamp 찍힘 +' + dt + 's', '도장 1.6→1 (전환 끝 +0.05초부터 0.22초)', 'full / stamp', 360, errors));
    cells.push(cell(price, seg(price, 0).start + 0.5, 'fx price 훅 +0.5s', '훅 큰 가격 칩 빛 스윕', 'full / price 훅', 360, errors));
    const counter = await project({ ...fx, overlay: 'counter', template: 'split', panelColor: '#ffffff', highlightColor: '#facc15', captionStyle: 'marker', bandColor: '#14213d' }, fxScenes());
    const sc = seg(counter, 1);
    const tEnd = sc.start + Math.max(0.3, (sc.end - sc.start) * 0.8);
    for (const dt of [0.08, 0.5]) cells.push(cell(counter, tEnd + dt, 'fx counter 끝값 +' + dt + 's', dt < 0.1 ? '숫자 settle(1.12→1)' : '밑줄 완성', 'split / counter', 360, errors));
    const vs = await project({ ...fx, overlay: 'vs', template: 'card', bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'shadow3d', transition: 'wipe' }, fxScenes());
    const sv = seg(vs, 2);
    for (const dt of [0.75, 1.0, 1.4]) cells.push(cell(vs, sv.start + dt, 'fx vs +' + dt + 's', dt < 1.2 ? '둘째 사진 와이프 중(wipe 전환 뒤 0.7초)' : '라벨 전/후 칩', 'card / vs', 360, errors));
    const dots = await project({ ...fx, overlay: 'dots', template: 'card', bandColor: '#2b1b4f', highlightColor: '#c6ff3a' }, fxScenes());
    cells.push(cell(dots, seg(dots, 1).start + 0.56, 'fx dots +0.56s', '현재 점 1.5배', 'card / dots', 360, errors));
    const news = await project({ ...fx, overlay: 'news', highlightColor: '#e0232e', captionStyle: 'plain' }, fxScenes());
    for (const dt of [0.15, 0.7]) cells.push(cell(news, dt, 'fx news t=' + dt, dt < 0.3 ? '띠가 아래서 올라옴' : '속보 칩 깜빡(0.7) + 띠 오른쪽 위 연락처', 'full / news', 360, errors));
    cells.push(cell(news, seg(news, 1).start + 1.4, 'fx news 둘째 장면', '띠 고정, 연락처(brand.phone) 오른쪽 위', 'full / news', 360, errors));
    const steps = await project({ ...fx, overlay: 'steps', captionStyle: 'glass', highlightColor: '#38bdf8' }, fxScenes());
    cells.push(cell(steps, seg(steps, 2).start + 0.62, 'fx steps +0.62s', '진행 점 순차(둘째 점 채워지는 중)', 'full / steps', 360, errors));
    const quote = await project({ ...fx, overlay: 'quote', template: 'blur', captionStyle: 'gradient', highlightColor: '#e8b04b', titleMode: 'none' }, fxScenes());
    cells.push(cell(quote, seg(quote, 1).start + 0.62, 'fx quote +0.62s', '따옴표 팝(1.6→1)', 'blur / quote', 360, errors));
    return { title: '(h) fx:\'ad\' — pin · price · counter · vs · dots · news · steps · quote', cells, boxW: 360, boxH: 640, cols: 7 };
  }

  /** 절 전부 → { sections: [{name, title, dataUrl}], dataUrl(합친 시트), errors } */
  async function renderAll() {
    const errors = [];
    const parts = [];
    for (const [name, fn] of [['a', sectionA], ['b', sectionB], ['c', sectionC], ['d', sectionD], ['e', sectionE], ['f', sectionF], ['g', sectionG], ['h', sectionH]]) {
      const s = await fn(errors);
      const canvas = grid(s.cells, s.boxW, s.boxH, s.cols);
      parts.push({ name, title: s.title, canvas, cells: s.cells.length });
    }
    // 합친 시트: 절마다 제목 줄 + 격자(0.6배)
    const scale = 0.6;
    const headH = 44;
    const width = Math.max(...parts.map((s) => Math.round(s.canvas.width * scale)));
    const height = parts.reduce((h, s) => h + headH + Math.round(s.canvas.height * scale), 0);
    const all = document.createElement('canvas');
    all.width = width; all.height = height;
    const g = all.getContext('2d');
    g.fillStyle = '#0f1115';
    g.fillRect(0, 0, width, height);
    let y = 0;
    for (const s of parts) {
      g.fillStyle = '#ffd43b';
      g.font = '800 26px "Pretendard Variable", sans-serif';
      g.textBaseline = 'middle';
      g.fillText(s.title + '  — ' + s.cells + '장', 16, y + headH / 2);
      y += headH;
      g.drawImage(s.canvas, 0, y, Math.round(s.canvas.width * scale), Math.round(s.canvas.height * scale));
      y += Math.round(s.canvas.height * scale);
    }
    return {
      dataUrl: all.toDataURL('image/png'),
      sections: parts.map((s) => ({ name: s.name, title: s.title, cells: s.cells, dataUrl: s.canvas.toDataURL('image/png') })),
      errors,
    };
  }

  /** 1080×1920 프레임 시간: 새 어휘를 모두 켠 조합(템플릿별) + 기준(새 어휘 없음). 전체 고른 30프레임 평균과 장면 앞 0.6초(등장 효과가 다 움직이는 구간) 평균 */
  async function perf(frames = 30) {
    const ALL = { extras: EXTRAS, photoFit: 'smart', fx: 'ad', titleAnim: 'rise' };
    const combos = [
      { id: 'full 전부 켬(price·push·sweep+bars·flash)', over: { ...ALL, template: 'full', overlay: 'price', photoIn: 'push', deco: ['sweep', 'bars'], transition: 'flash' } },
      { id: 'card 전부 켬(dots·pop·sweep+frame+bokeh·push)', over: { ...ALL, template: 'card', overlay: 'dots', photoIn: 'pop', deco: ['sweep', 'frame', 'bokeh'], transition: 'push', titleAnim: 'stamp', bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain' } },
      { id: 'dark 전부 켬(counter·iris·bokeh·flash)', over: { ...ALL, template: 'dark', overlay: 'counter', photoIn: 'iris', deco: ['bokeh'], transition: 'flash', titleAnim: 'mask', highlightColor: '#00e5a0', captionStyle: 'plain' }, scenes: fxScenes },
      { id: 'split 전부 켬(pin·reveal·frame+sweep·slide)', over: { ...ALL, template: 'split', overlay: 'pin', photoIn: 'reveal', deco: ['frame', 'sweep'], transition: 'slide', panelColor: '#eaf7e4', highlightColor: '#1fcf62', captionStyle: 'tag' } },
      { id: 'band 전부 켬(lower3 주장식·push·bokeh+sweep·wipe)', over: { ...ALL, template: 'band', overlay: 'lower3', extras: ['stamp', 'ribbon'], photoIn: 'push', deco: ['bokeh', 'sweep'], transition: 'wipe' } },
      { id: 'blur 전부 켬(quote·iris·sweep·fade)', over: { ...ALL, template: 'blur', overlay: 'quote', photoIn: 'iris', deco: ['sweep'], transition: 'fade', captionStyle: 'gradient' } },
      { id: 'card vs 전부 켬(vs 와이프·pop·sweep·wipe)', over: { ...ALL, template: 'card', overlay: 'vs', photoIn: 'pop', deco: ['sweep'], transition: 'wipe', bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'shadow3d' }, scenes: fxScenes },
      { id: '기준 full(price, 새 어휘 없음)', over: { template: 'full', overlay: 'price', ending: { ...BASE.ending, cta: '' }, brand: undefined } },
      { id: '기준 card(dots, 새 어휘 없음)', over: { template: 'card', overlay: 'dots', bandColor: '#f3efe6', highlightColor: '#ff7a1a', captionStyle: 'plain', ending: { ...BASE.ending, cta: '' }, brand: undefined } },
    ];
    const c = document.createElement('canvas');
    const results = [];
    for (const it of combos) {
      const p = await project(it.over, it.scenes ? it.scenes() : listing());
      const { W, H } = R.dims('9:16');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const tl = R.buildTimeline(p);
      const uniform = (k) => (tl.total * (k + 0.5)) / frames;
      const intro = (k) => { const s = tl.segs[k % tl.segs.length]; return Math.min(s.end - 0.01, s.start + (0.6 * (Math.floor(k / tl.segs.length) + 0.5)) / Math.ceil(frames / tl.segs.length)); };
      const time = (at) => {
        for (let k = 0; k < frames; k++) R.drawFrame(ctx, p, W, H, at(k), tl);
        ctx.getImageData(0, 0, 1, 1);
        const t0 = performance.now();
        for (let k = 0; k < frames; k++) R.drawFrame(ctx, p, W, H, at(k), tl);
        ctx.getImageData(0, 0, 1, 1);
        return Math.round(((performance.now() - t0) / frames) * 100) / 100;
      };
      results.push({ id: it.id, ms: time(uniform), msIntro: time(intro) });
    }
    return { size: '1080x1920', results, max: Math.max(...results.map((r) => Math.max(r.ms, r.msIntro))) };
  }

  window.motion = { renderAll, perf };
  window.motionReady = true;
})().catch((e) => { window.motionError = String((e && e.stack) || e); });
`;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const report = { consoleErrors: [], expected404: [], renderErrors: [], files: [], perf: null };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pending404 = [];
    page.on('response', (r) => { if (r.status() === 404) pending404.push(r.url()); });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/404/.test(m.text())) {
        const url = pending404.shift() || '';
        if (EXPECTED_404.test(url)) { report.expected404.push(url); return; }
      }
      report.consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
    await page.goto(`${BASE_URL}/tests/style-sheet.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.sheetReady === true, null, { timeout: 20000 });
    await page.addScriptTag({ content: PAGE_CODE });
    await page.waitForFunction(() => window.motionReady === true || window.motionError, null, { timeout: 30000 });
    const err = await page.evaluate(() => window.motionError || null);
    if (err) throw new Error(err);

    const r = await page.evaluate(async () => window.motion.renderAll());
    report.renderErrors.push(...r.errors);
    const f = path.join(OUT, 'motion-sheet.png');
    savePng(r.dataUrl, f);
    report.files.push({ file: f, sections: r.sections.map((s) => `${s.name}: ${s.cells}장`) });
    if (SECTION_DIR) {
      for (const s of r.sections) {
        const sf = path.join(SECTION_DIR, `motion-${s.name}.png`);
        savePng(s.dataUrl, sf);
        report.files.push({ file: sf, title: s.title });
      }
    }
    report.perf = await page.evaluate(async () => window.motion.perf(30));
    await page.close();
  } finally {
    await browser.close();
  }
  report.expected404 = [...new Set(report.expected404)];
  report.ok = report.consoleErrors.length === 0 && report.renderErrors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
