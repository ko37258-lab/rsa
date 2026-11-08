# 광고용 모션그래픽 · 따라하기 사례 — 최종 계획서 (MOTION-AD-PLAN)

작성일 2026-11-08. 대상: `/home/user/rsa/mrk-video`(빌드 없는 정적 ES 모듈 웹앱 「MR.K 영상만들기」). 이 문서는 심사관 1·2의 병합 어휘, 광고 스타일 선정(`rank.md`), 따라하기 UX(`recipe-ux.md`), 사례 12개 내용(`cases.md`)을 **하나의 계획**으로 합친 것이다. 구현자는 이 문서만 보고 코드를 쓸 수 있어야 한다. 줄 번호는 두 종류로 적는다 — **HEAD(커밋 9d42ce5) 기준 줄 번호**(심사관들이 쓴 것, 변하지 않음)와 **작업 트리의 함수 이름**(엔진·데이터 작업이 진행 중이라 줄 번호가 매 분 바뀜). 파일은 수정하지 않았다(설계 단계).

읽은 근거: `js/shorts-render.js`(HEAD 2045줄 전부 + 작업 트리 2733줄의 변경분 `git diff`), `docs/STYLE-SPEC.md`, `js/styles.js`, `js/styles-data.js`(작업 트리 34개), `js/shorts.js`(18~57·99~165·585~730·1120~1200·1455~1600), `js/listing.js`(425~460·1310~1355), `js/listing-prompt.js`(1~45·68~90·305~335), `js/main.js`(80~95·170~237), `js/showcase.js`(전부), `js/export.js`, `js/samples.js`, `js/music.js`(MOODS), `index.html`(44~80·205~222·405~432·545~600·670~690), `tests/style-sheet.html`(+작업 트리 변경분), `tests/style-sheet.cjs`, `tests/regress-30.cjs`(125~170), `tests/listing-flow.cjs`·`aspect-sheet.cjs`·`caption-sheet.cjs` 머리, 작업 트리의 새 파일 `js/cases-data.js`·`js/cases.js`·`tests/check-cases.mjs`·`tests/cases-sheet.cjs`, 스크래치패드 `tests/pixel-hash.cjs`·`pixel-compare.cjs`·`baseline-hashes.json`, 설계 문서 `design/judge-1.md`·`judge-2.md`·`rank.md`·`recipe-ux.md`·`cases.md`·`cases/cases-data.mjs`.

---

## 0. 먼저 읽을 것 — 지금 작업 트리와 이 계획의 차이

이 계획서를 쓰는 동안 엔진(#13)·데이터(#14) 작업이 **동시에 진행 중**이다(`git status`: `M js/shorts-render.js`(+766/−?), `M js/styles-data.js`(34개), `M js/styles.js`, `M docs/STYLE-SPEC.md`, `M tests/style-sheet.html`, `?? js/cases-data.js`(13개), `?? js/cases.js`, `?? tests/check-cases.mjs`, `?? tests/cases-sheet.cjs` — 10:34 기준). 작업 트리는 심사 **전** 제안(`vocab-engine.md` B 안 + `rank.md`)을 따르고 있어, 심사관 1·2가 버린 값이 들어 있다. 아래 표가 "지금 → 최종"이다. 각 항목의 결정 근거는 2절에 한 줄씩 있다.

| 영역 | 작업 트리(10:34) | 최종(이 계획) | 어떻게 맞추나 |
|---|---|---|---|
| `PHOTO_INS` | `none push reveal pop iris` | `none push plate reveal pop` | `iris` 가지(`applyPhotoIn`·`photoInEdge`) 삭제, `plate` 추가(2-3). `pop` 은 1.12→1 이 아니라 **0.85→1 + 알파**(카드 가지도) |
| photoIn 시계 | `fx.delay`(slide·push·wipe 만), flash 가지의 `draw(seg…)` 에 delay 없음 | `delay = trDur`(slide·push·wipe) · `trDur·0.5`(flash) · 0(그 밖). **현재 장면을 그리는 모든 `draw(seg, …)`** 에 같은 delay | 2-3 |
| 훅 배경 | 움직임 없음 | photoIn 이 켜져 있으면 1.06→1 줌 정착(0.5초) | `drawHookBackground(…, zoomIn = 1)` 뒤쪽 인자 |
| `DECOS` | `sweep bars bokeh frame` | `sweep vignette bars bokeh` | `frame` 가지 삭제, `vignette` 추가(fxCache 캔버스). sweep 0.35→**0.4초** 시작. bokeh 는 `patternCache` 가 아닌 `fxCache`, full·blur 템플릿에선 호출하지 않음 |
| `TITLE_ANIMS` | `none rise mask stamp`(밑줄 포함) | `none slide words scale mask` | rise·stamp 가지와 밑줄 삭제(두 심사관 모두 밑줄 기하 오류 지적). slide·words·scale 은 `drawRichText` 의 `anim` 재사용 + **허용 목록 Set**. 시계는 `t` 가 아니라 **`t − titleStart`**(훅 배경이 아닌 첫 장면 시작), 창 1.0초 |
| `FX_MODES` / `fx:'ad'` | `chip` 에 scale·sweep 옵션, `drawSplitImages(…, wipe)`, ovPin·ovPrice·ovQuote·ovVs(labelA/labelB)·ovCounter·ovDots·ovSteps·ovNews 분기 | **이번 범위 밖**(두 심사관 일치: 함수 6개 + `chip` 시그니처 = 회귀 표면 최대, 효과는 미세) | 해당 훑크를 `git diff` 로 떼어 `scratchpad/patches/fx-ad.patch` 에 보관하고 되돌린다. 데이터의 `fx: 'ad'`·`labelA/labelB` 도 뺀다. 다음 단계 1순위는 pin 드롭·price 팝 두 개(함수 안 transform 만, `chip` 시그니처 불변) |
| `ribbon` 장식 | `ovRibbon`, `EXTRA_OVERLAYS` 에 포함, PERSISTENT, 스타일 `event-ribbon` | 삭제. D-day 는 `price` 칩(`scene.tag`) + `stamp` 가 맡는다 | `event-ribbon` → **`event-dday`**(overlay `price`, 4절) |
| `lower3` 자리 | 장면 내용(사진/글자)에 따라 A/B/C 자리가 바뀜 | **템플릿·비율로 고정**(band·blur·split·card = `L.img` 왼쪽 아래, full·dark = 화면 왼쪽 아래) — PERSISTENT 바가 장면 사이에서 순간 이동하지 않게(심사관 1) | `lower3Rect` 교체(2-1) |
| `lower3` 글 폭 | `cached('l3w:…')`(patternCache 64개 상한) | 캐시 없음(프레임당 measureText 수 µs; 글꼴 로드 전 폭이 남는 `tickw:` 약점 반복 금지) | `lower3Text` 에서 `cached` 제거 |
| `stamp` 시계·자리 | `local` 기준 0~0.25초(전환 앞 절반엔 capAlpha 0 이라 안 보임), 훅 배경이면 화면 위 가운데 | **`enter = local − trDur`** 기준 0.05초 뒤 0.22초 "찍힘"(1.6→1, ease-in). 자리는 기준 사각 오른쪽 위(price·ticker 면 왼쪽 위), 훅 배경도 같은 규칙 | `overlayEnv` 에 `trDur` 인자 → `e.enter`; `ovStamp` 교체(2-1) |
| `stamp` 글 폭 | `cached('stampw:…')` | 캐시 없음 | |
| `drawExtras` 조정값 | `minTop`/`maxBottom` + 기존 장식 id 의 box | **`maxBottom` 만**. `drawCaption` 은 상자가 한계와 **겹칠 때만** 자른다(`box.y < maxBottom`) — 지금 코드는 자막 상자가 바 아래에 통째로 있으면 60u 로 무너진다 | 2-1 코드 |
| `ending.cta` 타이밍 | easeOut 0.4초 1.15→1, 맥동 0.4초부터, 스윕 0.6~1.1, 폭 `cached('ctaw:…')` | `easeOutBack((local−0.3)/0.4)` 0.6→1, 맥동 0.9초부터, 스윕 0.8~1.3, 폭 캐시 없음 | `drawEndingCta` 수치만 바꿈 |
| flash 길이 | `FLASH_DUR 0.2` | **0.24**(≈7프레임, 두 심사관 일치). 컷 뒤 줌 1.06→1 은 작업 트리의 0.35초 정착(`FLASH_ZOOM`)을 **유지**(심사관 안의 "raw=1 까지 0.12초"는 4프레임 스냅으로 보임 — 이 계획의 의도적 이탈) | 상수만 |
| push 클립 | `y ≥ titleH − 10u` | **사진 칸 창(window) 클립**: full·blur·엔딩은 화면 전체, band·split = `L.img`, dark = `L.thumb`, card = 카드 사각 40u 확장 — split 패널·card/dark 자막 침범이 사라짐(심사관 1) | 2-5 |
| 캐시 | `cached()`(patternCache)에 bokeh·글 폭 | `fxCache`(상한 32, 넘치면 전부 비움) 에 `vig:`·`bokeh:` 캔버스만. 글 폭은 캐시하지 않음 | 2-8 |
| `drawPhoto` smart | `imageSmoothingQuality` 가 save/restore 없이 바뀜 | `ctx.save()/restore()` 로 감쌈, `SMART_FIT_RATIO = 1.35` 상수 | |
| `ensureFonts` | 제목·채널·엔딩·자막만 | `brand.name/phone`·`ending.cta`·장면 `stamp` 글자도 미리 받음 | |
| `styles.js` | `MOTION_DEFAULTS` 에 `fx` | `fx` 삭제. 나머지(빈 값 채우기·배열 복사)는 그대로 — 심사관 둘 다 요구한 것 | |
| `styles-data.js` | 10개 업그레이드 + 새 4개가 `fx:'ad'`·`iris`·`rise`·`frame`·`ribbon` 사용 | 4절 표의 값으로 | `event-ribbon` → `event-dday`, 값 치환 |
| `cases-data.js` | 13개(12 + 행사 1) — `event-ribbon`, `labelA/labelB` | 13개 그대로 쓰되 `event-dday`, `labelA/labelB` 제거(5절 전문) | |
| `cases.js` | `SCENE_COPY_KEYS` 에 `labelA labelB` | 빼기(`vsLabel`·`stamp` 는 유지) | |
| `tests/check-cases.mjs` VOCAB | iris·frame·rise·stamp(titleAnim)·fx·ribbon | 최종 목록(7절) | |
| `tests/style-sheet.html` | VOCAB 에 `fx`, sweepAll 에 fx | fx 제거, `measureWorstPerf`(전환 프레임 표본) 추가 | |
| `docs/STYLE-SPEC.md` | 2절에 "광고 업그레이드 어휘" 단락(iris·rise·stamp·fx·ribbon) | 3절 문안으로 교체 | |

작업 트리에서 **이미 맞는 것**(그대로 둠): `on()`·`brandOf()`·`hasDeco()`·`hasExtra()` 게이트, `RENDER_DEFAULTS` 불변, `PHOTO_FITS`·`TRANSITIONS` export, `drawPhoto`(cover 가지 인자 글자 그대로), `photoInOf` 의 `T = min(0.5, dur·0.5)`·`dir`, `applyPhotoIn` push·reveal, `drawDeco` sweep·bars, `bokehCanvas` 고정 시드(Park–Miller), `drawEnding(…, textAlpha, local)` + 1951 호출, `drawChrome(…, t = Infinity)` 시그니처, `overlayEnv` 분리·`drawExtras` 삽입 자리(2011·2014 뒤), `ovLower3` 모양(막대 12u·둥근 바·검정 72%/흰 94%)·`t < 0.35` 진입, flash 덧칠 자리(진행 막대 뒤·훅 제목 앞)·색 혼합, `translate(fx.dx, fx.dy || 0)`, `trMax` 삼항, `styles.js` 빈 값 채우기·배열 복사, `cases.js` 의 `caseToProject`·`caseSlots`·`caseScript`·`caseUpload`·`fillOffice`·`endingFor`, `cases-data.js` 필드 이름(`slot/slot2/hint/hint2/stamp/vsLabel/inputLine/channel`, category id).

---

## 1. 목표와 요약

사용자 요청 원문(2026-11-08):

> 사례를 여러가지 형태로 만든것을 보여주는 것을 더 만들어서 이대로 따라하고 싶다... 그리고 모션그래픽 요즘 엄청 좋아져서 많이 올라 왔잖아?
> 내가 만든 모션그래픽 스타일 모두 보고 제일 광고용으로 좋을것들 사례를 더 만들어서 사진만 넣고도 유사하게 잘 나오게 만드는것 최고 고도화 해보자

세 가지 목표와 이 계획의 답:

| 목표 | 답 | 어디에 |
|---|---|---|
| (1) 사례를 여러 형태로 더 많이, "넣는 것 → 나오는 것", 이대로 따라하기 | 사례 화면 히어로 아래 **「따라하기 사례」 갤러리** 13장(매물 6·브랜드 2·강의 2·상담 1·후기 1·행사 1; 9:16 11 · 1:1 1 · 16:9 1), 카드마다 넣는 사진 띠 + 살아 있는 폰 미리보기(동시에 2개만) + 「이대로 따라하기」(`#follow=<id>`) + 「대본 보기」 | 5절 데이터 · 6-1 갤러리 |
| (2) 30가지 스타일 중 광고용으로 가장 좋은 것 + 요즘 모션그래픽 수준 | 광고용 추천 10개(`ad:true`) 업그레이드 + 새 광고 스타일 4개(`brand-lower3`·`listing-cine`·`event-dday`·`review-stamp`). 엔진 어휘 7개: `photoIn`(사진 등장: 색판 푸시인·플레이트·리빌·팝) · `photoFit:'smart'`(가로 사진 흐린 배경) · `transition` `flash`·`push` · `deco`(빛 스윕·비네트·레터박스·보케) · `titleAnim`(제목 등장) · `extras`(`lower3` 로워서드 · `stamp` 도장) + `brand` · `ending.cta`(엔딩 CTA 버튼) | 2·3·4절 |
| (3) 사진만 넣어도 사례와 비슷하게 | 숏폼 화면 **레시피 모드**: 사례 장면이 예시 사진으로 들어오고, 사진을 넣으면 **자리(slot) 순서대로 `img/img2` 만 교체**(자막·읽을 문장·kind·tag·stamp·label·counter·길이 유지). 남으면 `extraScene` 틀로 추가, 적으면 남은 자리 표시 + 「남은 자리 채우기」. 상호·연락처는 `store 'office'` → `p.brand` → 로워서드·엔딩 연락 줄·채널에 자동. 「AI 로 사진에 맞춰 대본 다듬기」는 바뀐 사진만 보내 자막·읽을 문장만 같은 수·순서로 받음 | 6절 |

지켜야 할 것(CLAUDE.md): 화면 문구·주석은 쉬운 한국어, 글꼴 Pretendard 하나, 색은 `style.css :root` 토큰(다크 블록 두 곳 불변), 모바일 400px 가로 스크롤 금지, 원본 앱 자산 금지, **새 필드는 기본값 '없음'이어서 기존 프로젝트·업그레이드하지 않은 스타일의 9:16·1:1·16:9 렌더가 픽셀 단위로 같아야 함**(픽셀 기준선 2,625 프레임), 모델명 변경 금지.

병합 규칙(과제가 정한 것): 두 심사관이 다르면 **호환성·성능은 더 보수적인 쪽**, **광고 효과는 둘 다 실현 가능하다고 본 쪽**. 결정 근거는 2절 각 항목 끝 "결정" 줄에 있다.

---
## 2. 최종 모션그래픽 어휘 — 구현 사양

표기: 크기는 1080 기준 × `u`(`L.u`), `local = t − seg.start`, `trDur` 는 `drawFrame` 의 전환 길이(HEAD 1937; 첫 장면·`transition:'none'` 은 0), **`enter = local − delay`**(장면 소속 등장 효과의 시계 — 전환 앞 절반은 `capAlpha`(HEAD 1945 `clamp(k·2−1)`)가 0 이라 그 전에 움직이면 보이지 않는다). 색은 `bandColor / panelColor / highlightColor / textColor / inkColor` 와 파생(`onColor` 59·`onHl`·`rgba` 57·`isBright` 56)만. 난수·`Date` 금지. 아래 "HEAD n" 은 커밋 9d42ce5 의 줄, 함수 이름은 작업 트리 기준.

### 2-0. 공통 — 게이트·이징·캐시·목록

```js
// 새 필드는 RENDER_DEFAULTS(HEAD 27~32)·withDefaults(35~38)에 넣지 않는다. 없음 = 'none' = '' = [] = 'cover' 는 모두 "꺼짐" — 기존 코드 경로를 한 줄도 바꾸지 않는다.
const on = (v) => !!v && v !== 'none';                                        // (작업 트리에 있음)
const hasDeco = (p, id) => Array.isArray(p.deco) && p.deco.includes(id);      // (있음)
const brandOf = (p) => ({ name: String(p.brand?.name || p.channel || '').trim(), phone: String(p.brand?.phone || '').trim(), sub: String(p.brand?.sub || '').trim() }); // (있음)
/** 살짝 넘쳤다가(최대 ≈1.05, x≈0.64) 자리 잡는 이징 — 로워서드 진입·CTA 버튼 */
const easeOutBack = (x) => { x = clamp(x, 0, 1); const c = 1.2; const y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y; };
/** 효과용 캔버스 캐시(비네트·보케). patternCache(HEAD 314~321: 64개 넘으면 전부 비움 → dotsbg 재생성 스파이크)와 분리. 글 폭은 캐시하지 않는다 */
const fxCache = new Map();
function cachedFx(key, make) { let v = fxCache.get(key); if (!v) { if (fxCache.size > 32) fxCache.clear(); fxCache.set(key, (v = make())); } return v; }
export const PHOTO_INS = ['none', 'push', 'plate', 'reveal', 'pop'];
export const PHOTO_FITS = ['cover', 'smart'];
export const DECOS = ['sweep', 'vignette', 'bars', 'bokeh'];
export const TITLE_ANIMS = ['none', 'slide', 'words', 'scale', 'mask'];
export const TRANSITIONS = ['fade', 'slide', 'zoom', 'none', 'wipe', 'flash', 'push'];
export const EXTRA_OVERLAYS = ['lower3', 'stamp'];
const PHOTO_IN_SET = new Set(PHOTO_INS);
const TITLE_ANIM_SET = new Set(TITLE_ANIMS);
// 삭제: FX_MODES, ovRibbon, 'iris'·'frame'·'rise'·titleAnim 'stamp' 가지, chip 의 scale/sweep 옵션, drawSplitImages 의 wipe 인자
```

시그니처는 **뒤쪽 선택 인자만** 늘린다: `drawEnding(…, textAlpha = 1, local = 0)`, `drawChrome(…, alpha, tTitle = Infinity)`, `drawHookBackground(…, scene, zoomIn = 1)`, `drawSceneVisual(…, fx, delay = 0)`, `drawOverlay(…, hidden = false, trDur = 0)`, `drawExtras(…, prevPass = false, trDur = 0)`, `overlayEnv(…, alpha, trDur = 0)`. `drawFrame(ctx, p, W, H, t, tl, logo)` 는 그대로(STYLE-SPEC 3절).

어휘 7개 + 프로젝트·장면 필드 2개 요약:

| 필드 | 값 | 기본 | 상시 비용(1080×1920) | 일시 비용 |
|---|---|---|---|---|
| `photoIn` | `none push plate reveal pop` | none | 0 | ≤0.2ms, 장면 앞 0.5초 |
| `photoFit` | `cover smart` | cover | smart 켜진 칸 1.0~1.5ms | 첫 프레임 15~25ms × 사진·칸 크기 1회(예열) |
| `transition` | +`flash push` | — | 0 | flash 덧칠 0.3ms(장면 1장만 그려 fade 보다 싸다) · push clip 1 |
| `deco` | 배열 `sweep vignette bars bokeh` | `[]` | vignette 0.5~1.0 · bokeh 1.5~3 · bars 0.05 | sweep 0.3ms(0.6초) |
| `titleAnim` | `none slide words scale mask` | none | 0 | ≤0.1ms(1.0초) |
| `extras` | 배열 `lower3 stamp` | `[]` | lower3 0.15~0.2 · stamp 0.2~0.25(장면에 있을 때) | — |
| `ending.cta` | 버튼 문구 | `''` | — | 0.3~0.4ms(엔딩만) |
| `brand` | `{ name, phone, sub }` | 없음 | — | lower3·엔딩 연락 줄이 읽음 |
| 장면 `stamp` | 글(8자까지, 6자 권장) | 없음 | — | `extras`/`overlay` 에 `stamp` 가 있을 때만 그림 |

### 2-1. `extras` — 2차 장식 배열 + `lower3`(로워서드) + `stamp`(도장) + `brand`

**값·기본값.** `p.extras` 배열(기본 `[]`), 허용 `lower3`·`stamp`, 주 장식 `p.overlay` 와 같은 id 는 건너뜀. 둘 다 `OVERLAYS`(HEAD 1884) 에도 등록해 주 장식으로 쓸 수 있다(새 스타일 `brand-lower3`=lower3, `listing-cine`·`review-stamp`=stamp). `PERSISTENT_OVERLAYS`(HEAD 1890)에 `lower3` 만 추가(`stamp` 는 비영속). `p.brand = { name, phone, sub }` → `brandOf(p)`(없으면 `channel`). 장면 `stamp` 는 **스타일이 stamp 를 켰을 때만** 그린다(결정: 심사관 1 의 게이트 — 옛 스타일로 바꿔도 도장이 남지 않고 `pickVisual` 이 빈 값을 채우므로 스타일 전환이 깨끗하다. 심사관 2 의 "장면 필드가 곧 스위치"는 사례 데이터가 스타일에 stamp 를 켜 두면 같은 결과를 내므로 효과 손실 없음).

**overlayEnv 에 `trDur` 추가**(HEAD 1896~1907 을 떼어 낸 함수 — 작업 트리 `overlayEnv`): 돌려주는 `e` 에 `trDur` 와 `enter: t − seg.start − trDur` 두 키만 늘린다(기존 장식은 읽지 않음). `drawOverlay(…, hidden = false, trDur = 0)` 가 그대로 넘긴다(주 장식이 stamp 인 스타일을 위해).

**lower3 자리 — 템플릿·비율로만 고정**(결정: 심사관 1. B 안의 장면별 자리는 PERSISTENT 바가 사진 장면↔글자 장면 사이에서 순간 이동한다. 둘 다 실현 가능하고 호환성은 같으므로 효과가 나은 쪽):

| 템플릿 | 기준 | 바 자리 | 바 색 | `adj` |
|---|---|---|---|---|
| band · blur · split · card | `L.img`(사진 칸; 글자 장면도 같은 칸 — band/blur 는 도면 패널, split 은 패널색, card 는 카드 안 패널. 1:1 card 훅은 `overlayEnv` 가 바꿔 준 `imgHook`) | x = `img.x + pad·0.5`, 아래끝 = `img.y + img.h − 24u` | 사진·도면 패널·카드 패널 위 → 검정 72% + 흰 글; split 글자 장면(`panelColor` 위)만 `isBright(panelColor)` 면 흰 94% + `inkColor` | `{ maxBottom: bar.y − 16u }` **글자 장면·훅 배경(blur 훅)일 때만**(사진 장면 자막은 아래 칸이라 겹치지 않음) |
| full · dark | 화면 | x = `pad·0.5`, 아래끝 = `H − 60u − inset`, `inset = (showProgress ? 9u : 0) + (overlay ticker 64u / warning·dots 30u)` | full 사진·훅 배경 위 → 검정 72%; 그 밖 `isBright(bandColor)` 면 흰 94% + ink | 항상 `{ maxBottom: bar.y − 16u }` |

좌표 검산(9:16, u=1): band 바 1354~1464 / 자막 칸 1512~1870(겹침 없음) · full 바 1741~1851 / 자막 아래끝 1651(여유 90u) · 훅 상자 아래 1770 → 1725 · dark 자막 1840 → 1725(910u 중 115u 손실) · 1:1 full 바 윗변 901 → 자막 칸 648~885(237u, 2줄) · **16:9 dark 는 자막 칸 290u → 176u(1줄)** → 데이터 규칙 "dark 스타일에 lower3 를 쓸 때 16:9 는 끄거나 1줄"(number-counter 는 lower3 를 쓰지 않으므로 해당 없음). `overlay === 'news'` 면 그리지 않음(흰 띠에 채널 글 HEAD 1466~1472). 엔딩엔 장식 없음.

```js
/** 로워서드 바 자리(템플릿·비율로 고정 — 장면 내용에 따라 움직이지 않음). dark=검정 바인지, adj=자막 아래 한계를 돌려줄지 */
function lower3Rect(e, bw, bh) {
  const { p, L, H, u, pad, scene } = e;
  const tpl = p.template;
  const hookBg = hasHookBg(p, scene);
  if (tpl === 'band' || tpl === 'blur' || tpl === 'split' || tpl === 'card') {
    const r = L.img;                                                   // 1:1 card 훅은 overlayEnv 가 imgHook 으로 바꿔 둔 L
    const bright = tpl === 'split' && !scene.img && isBright(p.panelColor); // split 글자 장면만 밝은 패널 위
    return { x: r.x + pad * 0.5, y: r.y + r.h - 24 * u - bh, w: bw, h: bh, dark: !bright, adj: !scene.img || hookBg };
  }
  const inset = (p.showProgress ? 9 : 0) * u + (p.overlay === 'ticker' ? 64 : p.overlay === 'warning' || p.overlay === 'dots' ? 30 : 0) * u;
  const onPhoto = tpl === 'full' && (!!scene.img || hookBg);
  return { x: pad * 0.5, y: H - 60 * u - inset - bh, w: bw, h: bh, dark: onPhoto || !isBright(p.bandColor), adj: true };
}

/**
 * lower3 — 로워서드: 강조색 세로 막대 12u + 둥근 바(r 8u). 1줄 brand.name(없으면 channel) 36u/800, 2줄 brand.phone(없으면 brand.sub) 28u/600 알파 0.85.
 * 폭 = max(글 폭) + 64u, 240u~0.6W(넘치면 글자를 0.75배까지 줄이고 그래도 넘치면 …). 영상 시작 0.35초 왼쪽 밖에서 easeOut 으로 들어온 뒤 고정(PERSISTENT).
 * 글 폭은 캐시하지 않는다(글꼴 로드 전 폭이 남는 tickw: 약점 반복 금지, 프레임당 measureText 수 µs).
 */
function ovLower3(ctx, e) {
  const { p, u, t, W } = e;
  if (p.overlay === 'news') return;
  const b = brandOf(p);
  const l1 = b.name.slice(0, 16);
  let l2 = (b.phone || b.sub).slice(0, 20);
  if (!l1 && !l2) return;
  const bh = (l1 && l2 ? 110 : 72) * u;                       // 두 줄일 때만 110u(상호 없이 연락처만이면 한 줄 바)
  const maxW = W * 0.6 - 64 * u;
  let k = 1, tw;
  for (;;) {
    ctx.font = uiFont(36 * u * k, 800); tw = l1 ? ctx.measureText(l1).width : 0;
    ctx.font = uiFont(28 * u * k, 600); tw = Math.max(tw, l2 ? ctx.measureText(l2).width : 0);
    if (tw <= maxW || k <= 0.75) break;
    k *= 0.9;
  }
  if (tw > maxW && l2) { while (l2.length > 4 && ctx.measureText(l2 + '…').width > maxW) l2 = l2.slice(0, -1); l2 += '…'; tw = maxW; }
  const bw = clamp(tw + 64 * u, 240 * u, W * 0.6);
  const r = lower3Rect(e, bw, bh);
  ctx.save();
  if (t < 0.35) ctx.translate(-(1 - easeOut(t / 0.35)) * (r.x + r.w + 20 * u), 0);     // 영상 시작 때 한 번 들어옴
  ctx.fillStyle = r.dark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.94)';
  roundRectPath(ctx, r.x, r.y, r.w, r.h, 8 * u); ctx.fill();
  ctx.fillStyle = p.highlightColor; ctx.fillRect(r.x, r.y, 12 * u, r.h);
  ctx.fillStyle = r.dark ? '#ffffff' : p.inkColor; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = uiFont(36 * u * k, 800); ctx.fillText(l1 || l2, r.x + 38 * u, l2 && l1 ? r.y + 36 * u : r.y + r.h / 2);
  if (l1 && l2) { ctx.font = uiFont(28 * u * k, 600); ctx.globalAlpha *= 0.85; ctx.fillText(l2, r.x + 38 * u, r.y + 78 * u); }
  ctx.restore();
  return r.adj ? { maxBottom: r.y - 16 * u } : undefined;
}
```

**stamp(도장)** — 결정: 모양은 A·B 공통(강조색 900 글 + 둥근 사각 이중 테두리, −10°), **시계는 심사관 1 의 `enter`**(두 심사관이 모두 "전환 앞 절반엔 capAlpha 0 이라 등장이 안 보인다"고 지적한 것을 고치는 유일한 방법), 흰 번쩍(심사관 2 A3 채택)은 뺀다(합성 1회·효과 미세 — 보수적인 쪽). 자리: 기준 사각 = 사진 있거나 훅 배경이면 `L.img`(full 은 화면 전체), 글자 장면이면 `noImgBox(p, L)`(HEAD 1052). 기본 **오른쪽 위**(오른끝 `area.x + area.w − pad·0.5`, 중심 y `e.top + pad·0.5 + 60u`), `overlay` 가 `price`(HEAD 1608 오른쪽 위 칩·1605 훅 위 가운데)·`ticker`(1713 날짜 칩)면 **왼쪽 위**. 훅 배경 + price 는 가격 칩이 화면 위 가운데(폭 ≈ 글폭 + 80u)라 가격 7자 이내면 왼쪽 도장과 겹치지 않는다(데이터 규칙). 뒷판: 사진 위(`scene.img && !hookBg`)면 검정 35%, 그 밖에 강조색이 어두우면(`!isBright(highlightColor)`) 흰 88%, 밝은 강조색이 글자 장면 위면 없음.

```js
/** stamp — 도장 배지(scene.stamp, 8자까지). enter(= local − trDur) 0.05초 뒤 0.22초 동안 1.6→1 로 "찍힘"(ease-in), 알파 0.08초. 비영속(앞 장면 것은 prevAlpha 로 사라짐) */
function ovStamp(ctx, e) {
  const { p, L, u, pad, scene, enter, top } = e;
  const text = String(scene.stamp || '').trim().slice(0, 8);
  if (!text) return;
  const x = (enter - 0.05) / 0.22;
  if (x <= 0) return;                                              // 전환 앞 절반(capAlpha 0)엔 아직 안 찍힘
  const k = clamp(x, 0, 1);
  const hookBg = hasHookBg(p, scene);
  const area = scene.img || hookBg ? L.img : noImgBox(p, L);
  const left = p.overlay === 'price' || p.overlay === 'ticker';
  let size = 52 * u;
  ctx.save();
  ctx.font = fontCss('900', size);
  let tw = ctx.measureText(text).width;
  while (tw + 48 * u > area.w * 0.45 && size > 26 * u) { size *= 0.9; ctx.font = fontCss('900', size); tw = ctx.measureText(text).width; }
  const w = tw + 48 * u;
  const h = size * 1.2 + 28 * u;
  const cx = left ? area.x + pad * 0.5 + w / 2 : area.x + area.w - pad * 0.5 - w / 2;
  const cy = top + pad * 0.5 + 60 * u;
  const s = 1.6 - 0.6 * k * k * k;                                  // 크게 떠 있다가 쾅
  ctx.globalAlpha *= Math.min(1, (enter - 0.05) / 0.08);
  ctx.translate(cx, cy); ctx.rotate(-0.1745); ctx.scale(s, s);
  if (scene.img && !hookBg) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRectPath(ctx, -w / 2, -h / 2, w, h, 12 * u); ctx.fill(); }
  else if (!isBright(p.highlightColor)) { ctx.fillStyle = 'rgba(255,255,255,0.88)'; roundRectPath(ctx, -w / 2, -h / 2, w, h, 12 * u); ctx.fill(); }
  ctx.strokeStyle = p.highlightColor; ctx.lineWidth = 6 * u; roundRectPath(ctx, -w / 2, -h / 2, w, h, 12 * u); ctx.stroke();
  ctx.lineWidth = 2 * u; roundRectPath(ctx, -w / 2 + 9 * u, -h / 2 + 9 * u, w - 18 * u, h - 18 * u, 8 * u); ctx.stroke();
  ctx.fillStyle = p.highlightColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 3 * u);
  ctx.restore();
}
```

전환 중 처리: fade(trDur 0.5)면 0.55초, flash(0.24)면 0.29초에 찍힌다 — 둘 다 `capAlpha` 가 1 이 된 뒤라 전부 보인다. 첫 장면은 trDur 0 → 0.05초. 앞 장면 것은 HEAD 2009~2013 블록(`prevAlpha`)이 그대로 사라지게 그린다.

**drawExtras / drawCaption** — 조정값은 `maxBottom` 만(결정: 두 심사관 일치). 작업 트리의 `minTop`·기존 장식 box 합성은 뺀다. **`drawCaption` 은 상자가 한계와 겹칠 때만 자른다** — 지금 작업 트리 코드(`y1 = min(box 아래, maxBottom)`, `h = max(60u, y1 − y0)`)는 자막 상자가 바 아래에 통째로 있을 때(band 사진 장면: 상자 1512~, 바 1354~1464) 높이가 60u 로 무너진다. lower3Rect 가 그 경우 adj 를 돌려주지 않지만 이중 안전으로 가드를 둔다.

```js
function drawExtras(ctx, p, L, W, H, seg, t, tl, alpha, adj, prevPass = false, trDur = 0) {
  const list = Array.isArray(p.extras) ? p.extras : null;
  if (!list || !list.length || seg.kind !== 'scene') return adj;        // 기본값 경로는 여기서 끝(adj 그대로)
  let e = null;
  let out = adj;
  for (const id of list) {
    const fn = OVERLAYS[id];
    if (!fn || id === p.overlay) continue;
    if (!e) e = overlayEnv(p, L, W, H, seg, t, tl, alpha, trDur);
    const persistent = PERSISTENT_OVERLAYS.has(id);
    ctx.save();
    if (prevPass && persistent) ctx.globalAlpha = 0;                      // 앞 장면 pass: 영속 장식은 조정값만
    else if (!persistent) ctx.globalAlpha *= alpha;
    let a;
    try { a = fn(ctx, e); } finally { ctx.restore(); }
    if (a?.maxBottom != null) out = { ...(out || {}), maxBottom: Math.min(out?.maxBottom ?? Infinity, a.maxBottom) };
  }
  return out;
}
// drawCaption(HEAD 1295~1299 의 adj 적용 뒤 한 줄):
if (adj?.maxBottom != null && box.y < adj.maxBottom && box.y + box.h > adj.maxBottom) box = { ...box, h: Math.max(60 * u, adj.maxBottom - box.y) };
// drawFrame(HEAD 2011 뒤 / 2014 뒤):
adjPrev = drawExtras(ctx, p, L, W, H, prev, t, tl, prevAlpha, adjPrev, true, trDur);
adj = drawExtras(ctx, p, L, W, H, seg, t, tl, capAlpha, adj, false, trDur);
```

비용: lower3 fillRect 2 + roundRect 1 + fillText 2 + measureText 2~4 ≈ 0.15~0.2ms, stamp roundRect 3 + fillText 1 + measureText 1~2 ≈ 0.2~0.25ms. 캐시 없음. 비율·템플릿: 모두 `L` 사각 기준. 1:1 card 훅은 `imgHook`(HEAD 1901) 기준이라 훅 장면에서만 바가 ≈100u 위 — 첫 장면이라 "들어오는" 동작과 겹쳐 수용. `titleMode:'hook'` 이면 1.45초간 훅 제목(HEAD 2025)이 덮어 등장이 안 보여도 무해.

### 2-2. `ending.cta` — 엔딩 CTA 알약 버튼 + 연락 줄

- **값·기본값**: `p.ending.cta` 문구(`''`/없음 → 지금 엔딩과 픽셀 동일). `ending.contact` 는 두지 않는다(결정: 심사관 1 — `brand.phone` 하나로 lower3·엔딩이 같은 값을 읽음, 필드 수 최소. sub 중복은 포함 검사로).
- **모양**(HEAD 1025 뒤·1026 restore 안, 작업 트리 `drawEndingCta`): `subY = y + H·E.h + 40u`(HEAD 1005~1006 의 `y`·`E`), 중심 `cy = subY + 110u`, 높이 112u, 폭 `clamp(글폭 + 112u, 360u, W − 2·pad)`, 모서리 56u, 채움 `highlightColor`, 글 `fontCss(p.font, 48u)` `onHl(p)`(넘치면 0.9배씩, 최소 28u), 그림자 대용 `rgba(0,0,0,0.18)` 같은 모양 6u 아래. 연락 줄 `brandOf(p).phone`(단 `plainText(ending.sub)` 에 그 번호가 있으면 생략 — `applyOfficeBrand` HEAD listing.js 442 가 sub 에 번호를 넣음) `uiFont(34u, 700)` `rgba(color, 0.85)` `cy + 100u`.
- **타이밍**(결정: 두 심사관이 모두 easeOutBack 을 채택. 수치는 심사관 1): `e = easeOutBack((local − 0.3)/0.4)`, scale `0.6 + 0.4·e`, 알파 `min(1, e)`; `local > 0.9` 부터 맥동 `× (1 + 0.03·sin(2π(local − 0.9)/1.2))`; 빛 스윕 1회 `0.8~1.3초`(버튼 패스 clip + 폭 90u 흰 0.35 선형 그라데이션 1개); 연락 줄은 버튼과 같은 알파. 모두 HEAD 1016 의 `textAlpha` save 안(fade·zoom·flash 는 capAlpha, slide·push 는 1 — 작업 트리 1951 조건에 push 포함됨).
- **좌표 검산**: 9:16 버튼 중심 1225/연락 줄 1325 · 1:1 755/855(로고 +120 → 975 < 1080) · 16:9 776/876(→ 996) — 모두 안전.
- **비용**: roundRect 2 + 그라데이션 ≤1(0.5초) + fillText 2 + measureText 1~3 ≈ 0.3~0.4ms, 엔딩 동안만. 글 폭 캐시 없음(`ctaw:` 제거). 엔딩 1초(최소, HEAD 80)면 맥동 전 끝남 → 사례 엔딩 ≥2.5초.

```js
function drawEndingCta(ctx, p, L, W, color, cta, subY, local) {
  const { u } = L;
  const e = easeOutBack((local - 0.3) / 0.4);
  if (e <= 0) return;
  const bh = 112 * u;
  const cy = subY + 110 * u;
  const pulse = local > 0.9 ? 1 + 0.03 * Math.sin(((local - 0.9) / 1.2) * Math.PI * 2) : 1;
  const s = (0.6 + 0.4 * e) * pulse;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, e);
  let size = 48 * u;
  ctx.font = fontCss(p.font, size);
  const maxW = W - L.pad * 2;
  let tw = ctx.measureText(cta).width;
  while (tw + 112 * u > maxW && size > 28 * u) { size *= 0.9; ctx.font = fontCss(p.font, size); tw = ctx.measureText(cta).width; }
  const bw = clamp(tw + 112 * u, 360 * u, maxW);
  const x0 = W / 2 - bw / 2;
  ctx.translate(W / 2, cy); ctx.scale(s, s); ctx.translate(-W / 2, -cy);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; roundRectPath(ctx, x0, cy - bh / 2 + 6 * u, bw, bh, bh / 2); ctx.fill();
  ctx.fillStyle = p.highlightColor; roundRectPath(ctx, x0, cy - bh / 2, bw, bh, bh / 2); ctx.fill();
  const sw = (local - 0.8) / 0.5;                                      // 빛 스윕 1회
  if (sw > 0 && sw < 1) {
    ctx.save(); roundRectPath(ctx, x0, cy - bh / 2, bw, bh, bh / 2); ctx.clip();
    const sx = x0 - 90 * u + easeInOut(sw) * (bw + 180 * u);
    const g = ctx.createLinearGradient(sx, 0, sx + 90 * u, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(sx, cy - bh / 2, 90 * u, bh); ctx.restore();
  }
  ctx.fillStyle = onHl(p); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cta, W / 2, cy + 3 * u);
  ctx.restore();
  const phone = brandOf(p).phone;
  if (phone && !plainText(p.ending?.sub).includes(phone)) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, e);
    ctx.font = uiFont(34 * u, 700); ctx.fillStyle = rgba(color, 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(phone, W / 2, cy + 100 * u); ctx.restore();
  }
}
```

엔진 밖: `DEFAULTS.ending`(shorts.js HEAD 43)에 `cta: ''`, `ENDING_BINDINGS`(1550)에 `['endingCta', 'cta']`, index.html 678~679 옆에 `<label class="field"><span>버튼 문구 (비우면 버튼 없음)</span><input type="text" id="endingCta" placeholder="예: 전화 문의"></label>`, `applyOfficeBrand`(listing.js 434~451)가 phone 이 있고 엔딩이 "처음 값/내가 넣은 값"이면 `cta: '전화 문의'` 를 함께(2-9).

### 2-3. `photoIn` — 사진 등장 `none | push | plate | reveal | pop`

- **값·기본값**: `none`. 허용 목록 밖·사진 없는 장면·훅 배경(`hasHookBg` HEAD 1034)·vs 두 장(HEAD 1098)·엔딩에는 없음 → **사진이 한 장 있는 장면만**(결정: 심사관 1 — split 글자 장면은 HEAD 1177~1185 에서 조기 반환, dark 글자 장면은 아무것도 안 그려 plate 삽입 지점이 없음. 심사관 2 의 "글자 장면 plate" 는 템플릿마다 예외가 생겨 보수적인 쪽을 택함). `PHOTO_IN = 0.5`, `T = min(0.5, dur·0.5)`.
- **시계**: `enter = local − delay`. **`delay = trDur`(slide·push·wipe) · `trDur·0.5`(flash — 컷이 raw 0.5 에 있으므로, 지연 0 이면 컷 순간 등장이 56% 진행돼 색판이 거의 안 보인다: 심사관 2 ⓑ) · 0(fade·zoom·none·첫 장면)**. `drawFrame` 이 한 번 계산해 **현재 장면을 그리는 모든 `draw(seg, …)`** 에 끝 인자로 넘긴다(전환이 끝난 프레임에서 시계가 튀지 않게: 심사관 2). `enter ≥ T` 면 `null` → 코드 경로 그대로(비용 0). `enter < 0`(전환 중): push 는 색판만, plate 는 색판이 칸을 다 덮음, reveal 은 앞선 10u 만, pop 은 알파 0.
- **값별**(`e = easeOut(max(0, enter)/T)`, 전부 clip 이 잡힌 사진 칸 `r` 안, 기존 `drawPhoto` 호출은 그대로 한 번):

| 값 | 사진 앞(`applyPhotoIn`) | 사진 뒤(`photoInAfter`) | 뜻 |
|---|---|---|---|
| `push` | `fillRect(r)` 를 `highlightColor` 로 + `translate(dir·(1−e)·r.w, 0)`(`dir` = 장면 번호 짝수 +1/홀수 −1) | — | 색판이 깔리고 사진이 옆에서 밀고 들어옴 |
| `plate` | 중심 기준 `scale(1 + 0.04·(1−e))`(살짝 눌러 앉음) | `fillRect(r.x + r.w·e2, r.y, r.w·(1−e2), r.h)` 강조색, `e2 = easeInOut(max(0, enter)/min(0.45, T·0.9))` | 색판이 덮고 있다가 왼→오로 빠지며 사진이 드러남(심사관 1 정의 — flash 와 겹쳐도 "두 번 움직임"이 아님) |
| `reveal` | `rect(r.x, r.y, e·r.w + 10u, r.h); clip()` 한 번 더 | 열리는 가장자리에 강조색 10u 세로 선 | 왼→오로 열림 |
| `pop` | 중심 기준 `scale(0.85 + 0.15·e)` + `globalAlpha *= min(1, enter/0.15)`; **card 는 카드 전체**(HEAD 1143 translate 직후, rotate 앞, if 안에서만) | — | 톡 커지며 나타남(두 심사관 모두 0.85→1; 작업 트리의 1.12→1 은 바꿈) |

- **훅 배경 장면**(심사관 2 ⓒ 채택 — 광고 첫 1초에 움직임이 없는 문제): photoIn 이 켜져 있으면 어느 값이든 `drawHookBackground(…, zoomIn)` 의 `'cover', 1.08 * zoomIn`, `zoomIn = 1 + 0.06·(1 − easeOut(local/0.5))`. 꺼져 있으면 `1.08 * 1` → 비트 동일.
- **삽입 지점**: card HEAD 1156 clip 뒤(pop 은 1143 뒤 if 안) · dark 1168 clip 뒤 · band/split/full 1188 clip 뒤 — 작업 트리의 `applyPhotoIn`/`photoInEdge` 호출 자리와 같음(`photoInEdge` → `photoInAfter` 로 이름만, iris 가지 삭제·plate 가지 추가).
- **데이터 규칙**: `wipe`+`plate`(띠가 두 번), `zoom`+`pop`(확대 겹침), `full`+`flash`+`push`(화면 전체 강조색 뒤 흰빛 — 눈부심) 는 같이 쓰지 않는다. `transition:'push'` 와 `photoIn:'push'` 는 delay 로 순차라 허용.
- **비용**: fillRect 1 또는 clip 1 또는 transform ≈ 0.05~0.2ms, 0.5초만. 캐시 없음. 비율·템플릿: 좌표가 전부 `r`(L.img / 카드 안쪽 / L.thumb) 기준.

```js
function photoInOf(p, seg, t, delay) {
  const mode = p.photoIn;
  if (!on(mode) || !PHOTO_IN_SET.has(mode) || !seg.scene.img) return null;
  const T = Math.min(PHOTO_IN, (seg.end - seg.start) * 0.5);
  const enter = t - seg.start - delay;
  if (enter >= T) return null;
  const x = Math.max(0, enter);
  return { mode, e: easeOut(x / T), a: Math.min(1, x / 0.15), dir: seg.index % 2 ? -1 : 1, e2: easeInOut(x / Math.min(0.45, T * 0.9)) };
}
function applyPhotoIn(ctx, p, pin, r, u) {
  const { mode, e } = pin;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (mode === 'push') { ctx.fillStyle = p.highlightColor; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.translate(pin.dir * (1 - e) * r.w, 0); }
  else if (mode === 'plate') { const s = 1 + 0.04 * (1 - e); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
  else if (mode === 'reveal') { ctx.beginPath(); ctx.rect(r.x, r.y, e * r.w + 10 * u, r.h); ctx.clip(); }
  else if (mode === 'pop') { const s = 0.85 + 0.15 * e; ctx.globalAlpha *= pin.a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
}
function photoInAfter(ctx, p, pin, r, u) {
  if (pin.mode === 'plate' && pin.e2 < 1) { ctx.fillStyle = p.highlightColor; ctx.fillRect(r.x + r.w * pin.e2, r.y, r.w * (1 - pin.e2), r.h); }
  else if (pin.mode === 'reveal') { ctx.fillStyle = p.highlightColor; ctx.fillRect(r.x + pin.e * r.w, r.y, 10 * u, r.h); }
}
// drawSceneVisual(ctx, p, L, W, H, seg, t, fx, delay = 0) 앞머리:
const local = t - seg.start;
const pin = photoInOf(p, seg, t, delay);
// 훅 배경(HEAD 1127):
drawHookBackground(ctx, p, W, H, scene, on(p.photoIn) ? 1 + 0.06 * (1 - easeOut(local / 0.5)) : 1);
// card(HEAD 1143 translate 뒤): if (pin?.mode === 'pop') { const s = 0.85 + 0.15 * pin.e; ctx.scale(s, s); ctx.globalAlpha *= pin.a; }
//      1156 clip 뒤: if (pin && pin.mode !== 'pop') applyPhotoIn(ctx, p, pin, r, u); … drawPhoto … if (pin) photoInAfter(ctx, p, pin, r, u);
// dark 1168 뒤 · 일반 1188 뒤: if (pin) applyPhotoIn(...); … 사진 …; if (pin) photoInAfter(...);
```

### 2-4. `photoFit` — `cover | smart`

- 기본 `cover`(지금과 동일). `smart`: 사진 비율 `ir` 과 칸 비율 `rr` 의 어긋남 `max(ir/rr, rr/ir) ≥ SMART_FIT_RATIO(1.35)` 일 때만 ① `blurredOf(img, Math.round(r.w), Math.round(r.h))`(HEAD 293~311; 반올림으로 키 폭발 방지) ② `rgba(0,0,0,0.25)` 베일 ③ contain 크기에만 그림자 `rgba(0,0,0,0.3)` (6u, 10u) ④ `drawImageFit(…,'contain', 1 + (zoom − 1)·0.35, 0, 0)`(HEAD 1205 blur 템플릿과 같은 완화 줌 — contain 사진이 잘리지 않음: 심사관 1 의 A 안 채택). **`ctx.save()/restore()` 로 감싼다**(`imageSmoothingQuality` 누출 — 심사관 2). 작업 트리 `drawPhoto` 에 save/restore 와 상수만 더하면 된다. cover 가지는 `drawImageFit(ctx, img, r.x, r.y, r.w, r.h, 'cover', zoom, m.ox, m.oy)` **글자 그대로**(HEAD 1159·1170·1207 과 동일).
- 적용 칸: band/split/full `L.img`, card 안쪽 `r`, dark `L.thumb`. 제외: blur 템플릿(이미 contain), 훅 배경(틴트), vs 두 장.
- 경계값(사양서 표): 1:1 → 9:16 full(0.5625) 1.78 smart · 1:1 → band 칸(1080×1075) 1.00 cover · 3:2 → band 칸 1.49 smart · 3:2 → card 칸(1.11) 1.35 smart(경계) · 1:1 → dark 썸네일(1.45) smart · 3:2 → dark 1.03 cover · 3:4 → 9:16 full 1.33 cover(폭 25% 잘림, 자연스러움) · 4:3 → 9:16 band 1.33 cover · **16:9 의 band/blur 칸(3.04)은 어떤 사진이든 smart** → 가로 레시피는 split(1.15)·full·card 로. 데이터 지침: full 레시피의 사진 자리에는 3:4·9:16 사진이 가장 좋고, 1:1 은 위아래 흐림 띠가 커진다(사례 썸네일 확인), 4:3 사용자 사진은 어디서나 smart.
- **첫 프레임 비용 15~25ms**(blurredOf 생성, 사진·칸 크기마다 1회) → **내보내기 예열**(2-9, export.js). 메모리 ≈ 4.6MB/장(1080×1075), 540 폭 1.2MB. 상시 1.0~1.5ms(blur 템플릿 측정치 비례).

### 2-5. `transition` 추가값 `flash` · `push`

- **flash**: `trMax = FLASH_DUR = 0.24`(≈7프레임; 작업 트리 0.2 → 0.24). `raw < 0.5` 앞 장면만, `raw ≥ 0.5` 새 장면만(하드 컷) + 새 장면 `zoom = 1 + 0.06·(1 − easeOut(sinceCut/FLASH_ZOOM))`, `FLASH_ZOOM = 0.35`, `sinceCut = t − seg.start − trDur/2`(전환이 끝난 뒤에도 0.35초까지 `else if` 가지로 이어 그림 — 작업 트리 그대로. 심사관 안의 "raw=1 까지"는 4프레임 스냅이라 이탈). 화면 전체 덧칠은 **진행 막대(HEAD 2017~2023) 뒤·훅 제목(2025) 앞**: 색 = 흰색에 `highlightColor` 25%(`rgbOf` HEAD 42 로 1회), 알파 `0.92·sin(raw·π)` → 제목·장식·자막까지 함께 하얘진다(결정: B 안 — 진짜 컷). `capAlpha`(1945)·앞 자막 블록(2009)은 기존 식 그대로 — `easeInOut(0.5) = 0.5` 라 컷 프레임에서 앞 자막이 사라지고 새 자막이 나타나기 시작한다. flash 가지의 `draw(seg, …)` 두 곳(전환 중·컷 뒤 줌)에 `delay` 를 넘긴다. 광과민: 알파 ≤0.92, 장면당 1회·0.24초, 장면 1.5초 이상 권장(3Hz 미만).
- **push**: `trMax 0.5`. `draw(prev, { alpha:1, dx:0, dy: −k·H, zoom:1 })`, `draw(seg, { alpha:1, dx:0, dy: (1−k)·H, zoom:1 }, delay)`. **창(window) 클립**(결정: 심사관 1 — B 안의 `titleH − 10u` 클립은 split 패널·card/dark 자막 위로 사진이 지나간다. 둘 다 실현 가능하므로 침범이 없는 쪽): full·blur·엔딩(앞뒤 어느 쪽이든)은 클립 없음(화면 전체가 밀림, 제목·채널은 `1−k` 로 사라짐), band·split = `L.img`, dark = `L.thumb`, card = 앞·뒤 장면 카드 사각의 합집합을 40u 넓힌 상자(−2° 모서리 16.7u 포함). 사진 칸 안에서만 밀리고 제목 띠·패널·자막 칸은 그대로(자막은 평소처럼 capAlpha 교차). `drawSceneVisual` HEAD 1124 와 `draw()` 1950 의 `translate(fx.dx, fx.dy || 0)` 는 작업 트리에 있음. 엔딩 `textAlpha` 규칙(1951)에 push 포함(있음). 데이터 규칙: split 은 push 대신 slide 권장(패널색이 사진 칸 안에서 밀리는 모양이 어색).

```js
const trMax = p.transition === 'wipe' ? 0.55 : p.transition === 'flash' ? FLASH_DUR : 0.5;                 // HEAD 1936
const delay = !prev ? 0 : p.transition === 'slide' || p.transition === 'push' || p.transition === 'wipe' ? trDur : p.transition === 'flash' ? trDur * 0.5 : 0;
const titleStart = (tl.segs.find((s) => s.kind === 'scene' && !hasHookBg(p, s.scene)) || tl.segs[0]).start;  // 2-7
function pushWindow(p, L, prev, seg) {
  const tpl = p.template;
  if (seg.kind === 'ending' || prev.kind === 'ending' || tpl === 'full' || tpl === 'blur') return null;
  if (tpl === 'dark') return L.thumb;
  if (tpl === 'card') {
    const a = cardRects(p, L, prev.scene).card, b = cardRects(p, L, seg.scene).card, m = 40 * L.u;
    const x = Math.min(a.x, b.x) - m, y = Math.min(a.y, b.y) - m;
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) + m - x, h: Math.max(a.y + a.h, b.y + b.h) + m - y };
  }
  return L.img;                                                                                                 // band · split
}
// 분기(zoom 뒤·wipe 앞, 마지막 else(fade) 불변):
} else if (p.transition === 'flash') {
  if (raw < 0.5) draw(prev, { alpha: 1, dx: 0, zoom: 1 });
  else draw(seg, { alpha: 1, dx: 0, zoom: flashZoom(t - seg.start - trDur / 2) }, delay);
} else if (p.transition === 'push') {
  ctx.save();
  const win = pushWindow(p, L, prev, seg);
  if (win) { ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip(); }
  draw(prev, { alpha: 1, dx: 0, dy: -k * H, zoom: 1 });
  draw(seg, { alpha: 1, dx: 0, dy: (1 - k) * H, zoom: 1 }, delay);
  ctx.restore();
}
// 전환이 끝난 뒤: else if (p.transition === 'flash' && trDur > 0 && t - seg.start < trDur / 2 + FLASH_ZOOM) draw(seg, { alpha: 1, dx: 0, zoom: flashZoom(...) }, delay);
//                else draw(seg, { alpha: 1, dx: 0, zoom: 1 }, delay);   // delay 가 0 이면 photoInOf 안에서 같은 결과
```

`draw(s, fx, delay = 0)` 는 scene 이면 `drawSceneVisual(ctx, p, L, W, H, s, t, fx, delay)`. 엔진 밖: index.html `#transition`(HEAD 582~588)에 `<option value="flash">플래시 컷</option><option value="push">위로 밀기</option>` — **필수**(`syncControls` shorts.js 1560~1564 가 목록에 없는 값을 DEFAULTS 로 되돌려 project 까지 덮어씀; regress-30 165~167 이 검사). `tests/style-sheet.html` VOCAB 은 `TRANSITIONS` 를 import(작업 트리에 있음).

### 2-6. `deco` — 장식 레이어 배열 `sweep | vignette | bars | bokeh`

결정: 배열(심사관 1·작업 트리) — `bars`+`sweep` 처럼 두 개가 함께 쓰이는 스타일(listing-cine)이 있고 이미 구현돼 있다. 심사관 2 가 단일값을 권한 이유(성능·select UI)는 데이터 규칙 **"한 스타일에 ≤2개, 상시 비용 1ms 이상(vignette·bokeh)은 하나만, card 에는 vignette·bokeh 금지, full·blur 에는 bokeh 금지(사진에 덮여 안 보임)"** 과 화면의 체크박스 묶음으로 흡수. `frame` 은 뺀다(두 심사관 일치 — 효과 대비 코드량·사진 면적). `vignette` 는 두 심사관 모두 포함.

- 그리는 순서(사진 clip 안): `bars` → (photoIn → 사진 → photoInAfter) → `sweep` → `vignette`. `bokeh` 는 배경층(`drawStaticBackground` HEAD 1942 직후 + wipe 분기의 다시 칠하기 1980 뒤), `template` 이 full·blur 면 호출하지 않음.
- `sweep`: `local 0.4~1.0`(작업 트리 0.35 → 0.4; delay 와 무관 — 1.0초 안에 끝나 `previewTime` HEAD 97 의 +1.4초 썸네일이 정착 모양) 동안 폭 220u 흰 띠(0→0.32→0 선형 그라데이션 1개, 아래가 왼쪽으로 `r.h·0.45` 기울어진 평행사변형, 작업 트리의 `ctx.transform(1,0,−0.45,1,0.45·r.y,0)` 수법)가 사진 칸을 `easeInOut` 으로 왼→오 1회. 글자 장면·훅 배경·엔딩 없음. `source-over`(screen 아님 — 밝은 매물 사진에서도 보임).
- `vignette`: `cachedFx('vig:${w}x${h}')` 캔버스 1장(방사 그라데이션: 반지름 0.45R 투명 → R `rgba(0,0,0,0.45)`, R = 대각선/2). full·blur·훅 배경은 화면 전체(훅 틴트 위), 그 밖은 사진 칸만. 사진 장면·훅 배경에만(글자 장면 없음). 정적. 비용 칸 ≈0.5ms, 화면 전체 ≈1ms 상시.
- `bars`: 사진 칸(full·훅 배경은 화면) 위·아래 70u `bandColor` 띠 + 안쪽 3u `highlightColor` 선. 정지. 4 rect(작업 트리 그대로).
- `bokeh`: `cachedFx('bokeh:${W}x${H}:${hl}')` 캔버스(원 18개, 반지름 40~140u, 알파 0.10~0.22, 가장자리 투명, **고정 시드 Park–Miller** — 작업 트리 `bokehCanvas` 를 `cached` → `cachedFx` 로만 바꿈)를 `x 오프셋 = (t·14u) % W` 로 두 번 이어 그림. **card 금지**(before-after 29.0ms + 3ms = 33ms 턱밑), dark·split 글자 중심 스타일에.
- 전환: sweep·vignette·bars 는 `fx.alpha`·`fx.dx/dy` 를 상속해 장면과 함께 사라짐, bokeh 는 전역 `t` 라 앞·뒤 장면 위상이 같음.

```js
function drawVignette(ctx, r) {
  const w = Math.round(r.w), h = Math.round(r.h);
  const c = cachedFx(`vig:${w}x${h}`, () => {
    const cv = makeCanvas(w, h); const g = cv.getContext('2d'); const R = Math.hypot(w, h) / 2;
    const grad = g.createRadialGradient(w / 2, h / 2, R * 0.45, w / 2, h / 2, R);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h); return cv;
  });
  ctx.drawImage(c, r.x, r.y, r.w, r.h);
}
// drawSceneVisual: 사진 가지마다 사진·photoInAfter 뒤에 drawDeco(sweep·bars) → if (hasDeco(p,'vignette')) drawVignette(ctx, fullScreen ? {x:0,y:0,w:W,h:H} : r)
//   fullScreen = tpl === 'full' || tpl === 'blur' || hookBg. 훅 배경 가지에도(틴트 뒤) 같은 호출.
// drawFrame: drawStaticBackground(...); if (hasDeco(p, 'bokeh') && p.template !== 'full' && p.template !== 'blur') drawBokeh(ctx, p, L, W, H, t);  (wipe 1980 뒤도 같은 조건)
```

### 2-7. `titleAnim` — 제목 등장 `none | slide | words | scale | mask`

결정: slide·words·scale 은 자막 어휘(`makeState` HEAD 520·`drawRichText` 646 의 `anim`) 재사용(두 심사관 일치, 비용 0·어휘 증가 0), `mask` 는 심사관 1(자막 어휘에 없는 고유 동작, 작업 트리에 이미 있음), `type` 은 뺌(제목 2줄을 0.72초에 타자 치면 떨림 — 심사관 1), `rise`·`stamp`(이름 충돌)·밑줄은 뺌(두 심사관 모두 밑줄 기하 오류: 제목 상자 아랫변 = `titleH − 14u`(HEAD 115), +12u 는 band 사진(y = titleH) 안). **허용 목록 Set 필수**(심사관 2: `pop` 은 제목을 1~2단어 묶음으로 바꾸고 `karaoke`·`bounce`·`wave`·`flash` 는 makeState 가 처리함).

- `titleMode === 'band'` 일 때만. **시계 `tTitle = t − titleStart`**(심사관 2 ⓐ: full/blur 훅 스타일(listing-price·field-pin·breaking-news·ai-tool-glass 등)은 첫 장면에서 `drawChrome` 이 `titleMode:'none'` 으로 불려(HEAD 2003) 제목이 둘째 장면에 처음 보이므로 영상 시각 기준이면 아무것도 안 움직임), `titleStart` = 훅 배경이 아닌 첫 장면의 시작(2-5 코드). 창 1.0초(slide 줄별 0.12초 지연·0.42초, words 0.6초, scale 0.35초, mask 0.6초 — 모두 안에서 끝남 → `previewTime` +1.4초 정착).
- slide·words·scale: HEAD 1341 `drawRichText` 옵션에 `anim: { mode, t: tTitle, dur: 1.0 }`. `tTitle ≥ 1.0` 이면 `anim` 을 **넘기지 않아**(undefined) 648 검사에서 null → 기존 경로(상태가 전부 VIS 라 결과도 같지만 경로까지 같게). mask: 1341 앞뒤 `save/restore` 에 `rect(L.title.x − 20u, L.title.y − 20u, (L.title.w + 40u)·easeOut(tTitle/0.6), L.title.h + 40u); clip()`.
- `drawChrome(…, alpha, tTitle = Infinity)`; HEAD 2003~2004 호출에 `t − titleStart`. 가로 한 줄 제목(1341 replace)도 같은 anim. 비용 0(1.0초 동안 clip 1 또는 상태 함수).

```js
if (p.titleMode === 'band') {
  const ta = p.titleAnim;
  const live = tTitle < 1.0 && on(ta) && TITLE_ANIM_SET.has(ta);
  if (live && ta === 'mask') { ctx.save(); ctx.beginPath(); ctx.rect(L.title.x - 20 * u, L.title.y - 20 * u, (L.title.w + 40 * u) * easeOut(tTitle / 0.6), L.title.h + 40 * u); ctx.clip(); }
  const opts = { size: p.captionSize * 1.08 * u, weight: p.font, color: p.titleColor || ink, hl: p.highlightColor, style: overPhoto ? 'outline' : 'plain', shadow: overPhoto, valign: 'center', maxLines: L.wide ? 2 : 3, u };
  if (live && ta !== 'mask') opts.anim = { mode: ta, t: tTitle, dur: 1.0 };   // 비활성이면 키 자체를 넣지 않음(textLayoutCache 키·648 검사 모두 기존 경로)
  drawRichText(ctx, L.wide ? String(p.title || '').replace(/\s*\n\s*/g, ' ') : p.title, L.title, opts);
  if (live && ta === 'mask') ctx.restore();
}
```

### 2-8. 파이프라인 순서·캐시·성능 규칙

수정 뒤 `drawFrame` 한 프레임(`[ ]` 가 새 것):

```
withDefaults · layout ─ 변경 없음                                                    HEAD 1918~1919
bandColor 채움                                                                       1921
trMax(wipe .55 | [flash .24] | .5) · trDur · [delay] · [titleStart]                 1936~1940
drawStaticBackground → [bokeh — full·blur 아님]                                      1942
draw(s, fx, [delay])
  ├ ending: drawEnding(…, textAlpha, [local]) → [ending.cta 버튼·연락 줄]
  └ scene : drawSceneVisual(…, [delay]) — hookBg → drawHookBackground(…, [zoomIn]) → [vignette]
            clip → [bars] → [applyPhotoIn] → drawPhoto([smart]) → [photoInAfter] → [sweep] → [vignette]
전환: slide · zoom · [flash] · [push(창 clip)] · wipe(bandColor→static→[bokeh]→draw) · fade   1958~1998
chromeAlpha → drawChrome(…, [t − titleStart]) → [titleAnim]                          2001~2005
(k<0.5) adjPrev = drawOverlay(prev, …, [trDur]) → [drawExtras(prev, prevPass, trDur)] → drawCaption(prev)   2009~2013
adj = drawOverlay(seg, …, [trDur]) → [drawExtras(seg, …, trDur)] → drawCaption(seg, adj{…, [maxBottom]})    2014~2015
진행 막대 → [flash 덧칠] → drawHookTitle                                             2017~2025
```

- **등장 시계 규칙**: 장면 소속 등장(photoIn·stamp)은 `enter`; lower3(전역 `t < 0.35`)·titleAnim(`tTitle < 1.0`)·bokeh(전역 `t`)·sweep(`local 0.4~1.0`). 모든 등장은 1.05초 안에 끝난다(`previewTime` +1.4초 썸네일·시트 1.6초가 정착 모양).
- **캐시**: `fxCache` 에 `vig:`·`bokeh:` 캔버스만(크기·색 키, 시간·알파 금지). 글 폭(lower3·stamp·cta)은 캐시하지 않는다. `blurredOf` 는 `Math.round` 한 크기로. `patternCache` 는 손대지 않는다(상한 64 그대로). `ensureFonts`(HEAD 2030~2036)의 미리 받기 글자(2032)에 `brandOf(p).name·phone`, `p.ending?.cta`, 장면 `stamp` 를 더한다.
- **결정성**: `Math.random`·`Date` 금지. bokeh 는 고정 시드. 모든 보간은 `t`·`local`·`enter` 의 순수 함수. 기준선 해시가 두 번 돌려도 같아야 한다(`baseline-hashes.json` = `baseline-hashes-2.json` 으로 이미 확인된 성질 유지).
- **성능**: shadowBlur·filter 금지, 그라데이션은 프레임당 ≤2개(sweep·CTA 스윕), 전부 일시. 상시 1ms 이상은 smart·vignette·bokeh 셋 → **card 스타일은 smart 만 허용**(before-after 실측 29.03ms). 측정 로그(`scratchpad/style-sheet.log`) 기준 합계: 매물 레시피(full + lower3·stamp + push + smart + sweep + flash + cta) ≈ 6.5ms, card 최악(29.0 + lower3·stamp 0.45 + smart 1.5) ≈ 31ms — 33ms 안이지만 **전환 프레임은 카드 두 장을 그려 오늘도 33ms 를 넘을 수 있다**(기존 위험, `measurePerf` HEAD style-sheet.html 333 은 전환 프레임을 거의 뽑지 않음) → 7절의 `measureWorstPerf`.
- **광과민성**: flash 는 장면당 1회·0.24초·정점 0.92, 장면 1.5초 이상 권장.

### 2-9. 엔진 밖 동반 변경(없으면 저장·스타일 전환·화면이 깨짐)

| 파일 | 변경 |
|---|---|
| `js/styles.js` | `VISUAL_KEYS` + `photoIn photoFit deco titleAnim extras`(작업 트리에 있음, `fx` 삭제), `MOTION_DEFAULTS` 로 빈 값 **항상** 채움 + 배열 복사(있음 — 스타일을 바꿔도 앞 스타일의 extras·photoIn 이 남지 않게) |
| `js/shorts.js` | `SETTINGS_KEYS`(HEAD 18~22) + `photoIn photoFit deco titleAnim extras brand`; `DEFAULTS.ending.cta: ''`(43); `ENDING_BINDINGS`(1550) + `endingCta`; `BINDINGS`(1542) + `photoIn photoFit titleAnim`(select); `deco`·`extras` 는 체크박스 묶음 `#decoBox`·`#extrasBox`(`data-key`)를 `wireControls` 옆 `wireArrayControls()` 로(값은 켜진 체크 id 배열, `syncControls` 에서 체크 상태 복원); `saveProject`(1134)/`openProject`(1161) 장면 필드 `stamp`·`slot`·`slot2`·`hint2`·`vsLabel`(6절의 `recipe` 도); `api.setBrand(patch)`(`project.brand = { ...(project.brand||{}), ...patch }; changed(false)`) |
| `index.html` | `#overlay`(HEAD 551)에 `<option value="lower3">상호·연락처 바</option><option value="stamp">도장</option>`; `#transition`(582) flash·push; 세부 조절에 `#photoIn`(없음·색판 밀기·색판 빠짐·왼→오 열기·톡 커짐)·`#photoFit`(채우기·가로 사진은 흐린 배경)·`#titleAnim`(없음·밀려 들어옴·단어가 떠오름·커지며·왼→오 열림) select 3개, `#decoBox`(빛 스윕·가장자리 어둡게·레터박스·배경 빛방울)·`#extrasBox`(상호·연락처 바·도장) 체크박스, 엔딩 `#endingCta`, 상호·연락처 `#brandName`·`#brandPhone`(매물 상자가 채우지만 직접 고칠 수 있게) |
| `js/listing.js` | `applyOfficeBrand`(434~451): 같은 "처음 값/내가 넣은 값" 규칙으로 `api.setBrand({ name, phone, sub: regNo ? '등록 ' + regNo : '' })`, phone 이 있으면 `ending.cta` 가 비었을 때 `'전화 문의'`(`ls.autoEnding` 에 cta 포함) |
| `js/listing-prompt.js` | (P2, 선택) `LISTING_SCHEMA` 장면에 `stamp`(≤6자, 허용 단어: 급매·신축·역세권·즉시입주·올수리·남향·모집중·D-7 처럼 사실 표현만) — 스타일에 stamp 가 켜져 있을 때만 프롬프트에 포함 |
| `js/export.js` | 46 `drawFrame(…, 0, timeline)` 뒤 **예열**: `for (const seg of timeline.segs) { drawFrame(ctx, project, W, H, seg.start + 0.01, timeline); drawFrame(ctx, project, W, H, Math.min(seg.end - 0.01, seg.start + 0.6), timeline); }` → `blurredOf`(smart·blur)·`fxCache`·`textLayoutCache` 가 채워진 뒤 `captureStream`(실시간 rAF 루프 71~82 의 첫 프레임 드롭 방지) |
| `tests/style-sheet.html` | VOCAB 에서 `fx` 제거(작업 트리의 photoIn·photoFit·deco·titleAnim·extras·TRANSITIONS 는 그대로), `sweepAll` 의 `motionVocab` 에서 fx 제거, `measureWorstPerf` 추가(7절) |
| `docs/STYLE-SPEC.md` | 3절 문안으로 교체(작업 트리 2절 단락 대체) |

---

## 3. `docs/STYLE-SPEC.md` 에 추가할 문안 (그대로 붙이기)

작업 트리의 "광고용 추천 표시와 광고 업그레이드 어휘 (2026-11)" 단락은 아래로 **교체**한다(iris·rise·stamp(titleAnim)·fx·ribbon 이 들어 있음).

### 1절 표에 추가할 행

| 필드 | 값 | 뜻 |
|---|---|---|
| `photoIn` | `none` `push` `plate` `reveal` `pop` | 사진 등장(장면 앞 0.5초, 짧은 장면은 길이의 절반; 사진이 한 장 있는 장면만). push=강조색 색판이 먼저 깔리고 사진이 옆에서 밀려 들어옴(짝수 장면은 오른쪽, 홀수 장면은 왼쪽에서), plate=색판이 사진을 덮고 있다가 왼→오로 빠지며 사진이 드러남(사진은 1.04→1 로 살짝 눌러 앉음), reveal=사진이 왼→오로 열리며 가장자리에 강조색 선 10u, pop=사진(card 는 카드 전체)이 0.85→1 로 톡 커지며 알파 0→1. 등장 시계는 전환 뒤부터(slide·push·wipe 는 전환이 끝난 뒤, flash 는 컷 뒤, 그 밖은 장면 시작). 훅 배경 장면(full·blur 훅)은 어느 값이든 사진이 1.06→1 로 살짝 정착만. 사진 없는 장면·vs 두 장·엔딩엔 없음. 같이 쓰지 않기: wipe+plate, zoom+pop, full+flash+push. 기본 none |
| `photoFit` | `cover` `smart` | smart=사진 비율이 칸 비율과 1.35배 이상 어긋나면(1:1 사진을 9:16 full 화면에, 3:2 사진을 세로 칸에, 어떤 사진이든 16:9 의 band·blur 칸에) 흐린 사진 배경(`blurredOf`) + 검정 25% 베일 위에 contain 으로 온전히(켄번스 줌은 0.35배로 완화, 사진 둘레에 얇은 그림자). 1.35 미만(3:4 사진을 9:16 에, 4:3 사진을 정사각 칸에)은 cover 로 긴 쪽 25% 까지 잘림. blur 템플릿·훅 배경·vs 두 장은 제외. 기본 cover(지금과 같음). 광고 스타일은 모두 smart 를 켠다 |
| `transition` | 기존 5 + `flash` `push` | flash=0.24초 흰빛(강조색 25%)이 sin 곡선으로 한 번 번쩍이며 정점(0.12초)에서 하드 컷, 새 장면은 1.06→1 로 0.35초 살짝 줌. 제목·자막까지 함께 하얘진다. 장면 1.5초 이상 권장(깜빡임). push=앞 장면이 위로 밀려 나가고 새 장면이 아래서 올라오는 세로 밀기 — full·blur·엔딩은 화면 전체가, 그 밖(band·split·card·dark)은 사진 칸 안에서만 밀린다(제목 띠·패널·자막 칸은 그대로). split 은 push 대신 slide 권장 |
| `deco` | 배열: `sweep` `vignette` `bars` `bokeh` | 장식 레이어(사진 위·자막 아래; bokeh 만 배경). sweep=장면 0.4~1.0초에 폭 220u 흰 빛 띠(알파 0.32)가 사진을 사선으로 한 번 쓸고 지나감, vignette=가장자리를 검정 45% 로 어둡게(full·blur·훅 배경은 화면 전체, 그 밖은 사진 칸), bars=사진 칸(full 은 화면) 위아래 70u 레터박스(`bandColor`)+강조색 3u 선, bokeh=배경(`bandColor` 구역)에 강조색 빛방울 18개가 천천히 흐름(고정 시드). 한 스타일에 2개까지, vignette·bokeh 는 둘 중 하나만, card 에는 vignette·bokeh 를 쓰지 않고(프레임 예산) full·blur 에는 bokeh 를 쓰지 않는다(사진에 덮여 안 보임). 기본 `[]` |
| `titleAnim` | `none` `slide` `words` `scale` `mask` | titleMode=band 제목의 등장. 제목이 처음 보이는 장면(훅 배경 스타일은 둘째 장면) 시작 1.0초 안에 한 번, 그 뒤는 지금 제목과 같음. slide·words·scale 은 자막 등장(captionAnim)과 같은 움직임, mask=제목이 왼→오로 열림(0.6초). 그 밖의 값은 none. hook·none 모드엔 없음. 기본 none |
| `extras` | 배열: `lower3` `stamp` | 주 장식(overlay) 위에 겹쳐 그리는 2차 장식. 주 장식과 같은 값은 건너뜀. 자막 상자는 아래 한계(`maxBottom`)만 조정한다. 기본 `[]` |
| `brand` | `{ name, phone, sub }` | 상호·연락처·(등록번호 줄). `lower3` 와 엔딩 CTA 연락 줄이 읽는다(없으면 `channel`). 매물 상자의 중개사무소 정보와 따라하기 사례가 채운다. 스타일이 입히는 값이 아니라 프로젝트 값(`VISUAL_KEYS` 에 넣지 않음) |
| `ending.cta` | 버튼 문구 | 있을 때만 엔딩 작은 글 아래에 강조색 알약 버튼(높이 112u, 0.3초 뒤 0.4초 동안 살짝 넘치며 등장, 0.9초부터 1.2초 주기 3% 맥동, 빛 스윕 1회) + `brand.phone` 연락 줄(작은 글에 같은 번호가 없을 때). text·sub·로고는 그대로. 엔딩 2.5초 이상 권장. 기본 `''` |

### overlay 표에 추가할 행

| 값 | 그리는 것 |
|---|---|
| `lower3` | 로워서드 바: 강조색 세로 막대 12u + 둥근 바에 두 줄 — `brand.name`(없으면 `channel`) / `brand.phone`(없으면 `brand.sub`). 자리는 템플릿으로 정해져 장면이 바뀌어도 움직이지 않는다 — band·blur·split·card 는 사진 칸 왼쪽 아래(사진·도면 패널·카드 위라 검정 72% 바 + 흰 글, split 글자 장면의 밝은 패널 위만 흰 94% 바 + `inkColor`), full·dark 는 화면 왼쪽 아래(진행 막대·ticker·warning·dots 만큼 띄움). 영상 시작 0.35초 왼쪽에서 밀려 들어오고 그 뒤 고정(PERSISTENT). 글자 장면·훅 배경·full·dark 에선 자막 상자 아래 한계를 바 위 16u 로 올린다(dark 가로 화면은 자막 칸이 낮아져 1줄 — 끄는 것을 권장). `news` 와 함께면 그리지 않음. 2차 장식(extras)으로도, 주 장식으로도 쓸 수 있다 |
| `stamp` | 도장 배지: `scene.stamp`(8자까지, 6자 권장)를 강조색 이중 테두리 둥근 사각에 −10° 기울여 사진 칸 오른쪽 위(price·ticker 장식과 함께면 왼쪽 위, 글자 장면은 글 상자 오른쪽 위). 등장 시계는 전환이 끝난 뒤(`local − trDur`) 0.05초 뒤 0.22초 동안 1.6→1 로 "찍힘". 사진 위에선 검정 35% 뒷판, 어두운 강조색이면 흰 88% 뒷판. 장면 소속(전환 때 앞 장면 것은 함께 사라짐). 스타일이 `overlay` 나 `extras` 로 켰을 때만 그린다 |

### 장면 추가 필드

`stamp`(도장 글, 6자 권장 — 급매·신축·역세권·즉시입주·올수리·남향·모집중·D-7 처럼 표시·광고 규칙 안의 사실 표현만). 2절 예시 scene 에 `stamp: '급매'` 한 줄 추가. 장식이 읽는 장면 필드: price·date → `tag`, pin·comment → `label`, counter → `counter`, vs → `img2`(+`vsLabel`), stamp → `stamp`. `tag` 는 7자, `stamp` 는 6자 권장.

### 2절(스타일 데이터)에 추가

광고(매물·브랜드·강의·상담·후기·행사)에 맞는 스타일은 `ad: true` 와 용도 목록 `adFor`(`listing brand course consult proof event`)를 가진다. 스타일 패널의 「광고용 추천」 필터와 따라하기 사례(`js/cases-data.js`)가 읽고, `styles.js` 의 `makeStyle` 이 `...data` 로 펼치므로 `style.ad` 로 바로 읽힌다(`VISUAL_KEYS` 밖이라 프로젝트에 입혀지지 않음). 광고 업그레이드 어휘 값은 위 목록 안에서만(`photoIn` none/push/plate/reveal/pop · `photoFit` cover/smart · `deco` sweep/vignette/bars/bokeh · `titleAnim` none/slide/words/scale/mask · `extras` lower3/stamp). 엔딩 CTA(`ending.cta`)와 상호(`brand`)는 스타일이 아니라 사례(`js/cases.js caseToProject`)·매물 상자가 프로젝트에 싣는 값이다. 스타일 수는 화면에 적지 않는다(`data-style-count`). 데이터·사례 점검 `node tests/check-cases.mjs`, 사례 렌더 시트 `node tests/cases-sheet.cjs`.

### 3절(엔진이 지켜야 할 것)에 추가

- 새 필드(`photoIn photoFit deco extras titleAnim brand ending.cta`, 장면 `stamp`)는 없거나 `'none'`·`'cover'`·`[]`·`''` 이면 **기존 코드 경로를 한 줄도 바꾸지 않는다** — `RENDER_DEFAULTS` 에 넣지 않고 사용처 게이트로만 읽는다. 고친 뒤 픽셀 기준선(스크래치패드 `tests/pixel-hash.cjs` → `pixel-compare.cjs`)과 비교해 업그레이드하지 않은 스타일·옛 프로젝트의 9:16·1:1·16:9 모든 시각 해시가 같아야 한다(엔진만 고친 커밋에서는 30개 전부, 허용 목록 없이).
- 장면 소속 등장 효과(photoIn·stamp)는 전환이 끝난 뒤의 시계(`local − trDur`; flash 는 컷부터)를 쓴다 — 전환 앞 절반은 자막·장식 알파가 0 이라 그 전에 움직이면 보이지 않는다. 모든 등장은 1.05초 안에 끝나 `previewTime` 의 +1.4초 썸네일이 정착 모양이 된다. 제목 등장은 제목이 처음 보이는 장면 시작 기준이다.
- 2차 장식(extras)은 자막 조정값으로 `maxBottom` 만 돌려주고, `drawCaption` 은 상자가 그 한계와 겹칠 때만 자른다. 색·모양·정렬·상자 조정은 주 장식만. 항상 보이는 2차 장식은 `lower3` 만(PERSISTENT_OVERLAYS).
- 효과용 캔버스(비네트·보케)는 `patternCache`(64개 넘으면 전부 비움)가 아닌 별도 `fxCache` 에 두고, 키에 시간·알파를 넣지 않는다. 글 폭은 캐시하지 않는다. 난수·현재 시각 금지(bokeh 는 고정 시드).
- 상시 비용 1ms 이상 어휘는 `photoFit:'smart'`(≈1.5ms)·`vignette`(≈1ms)·`bokeh`(≈2~3ms) 셋이다. card 템플릿(지금 22~29ms)에는 smart 만 허용한다. `node tests/style-sheet.cjs` 의 평균·최대와 전환 프레임 표본(각 장면 시작 +0.1/0.25/0.4초)에서 1080×1920 최대 33ms 를 지킨다. 내보내기는 녹화 전에 장면마다 한 프레임씩 예열한다(흐림 캔버스 첫 생성 15~25ms).
- `js/styles.js` `pickVisual` 은 새 키의 빈 값을 항상 채워, 스타일을 바꾸면 앞 스타일의 2차 장식·사진 등장·장식 레이어가 남지 않게 하고 배열은 복사한다. 엔진은 `TRANSITIONS`·`PHOTO_INS`·`PHOTO_FITS`·`DECOS`·`TITLE_ANIMS`·`EXTRA_OVERLAYS` 목록을 내보내고, 화면 select·체크박스와 `tests/style-sheet.html` VOCAB 은 이 목록을 쓴다. 스타일 데이터가 쓰는 `transition`·`overlay` 값은 `index.html` select 에도 있어야 한다(`syncControls` 가 없는 값을 기본값으로 되돌림).
- 2절 규칙에: wipe 와 `photoIn:'plate'`, zoom 과 `pop`, full+flash 와 `push` 는 같이 쓰지 않는다. split 은 push 대신 slide. card 에는 `deco` 의 vignette·bokeh 를, full·blur 에는 bokeh 를 쓰지 않는다. 광고용 스타일은 `photoFit:'smart'` 를 켠다. dark 스타일에 lower3 를 쓸 때 16:9 는 자막이 1줄로 줄어드니 피한다.

---
## 4. 광고용 추천 스타일 — `ad:true` 표, 업그레이드 값, 새 스타일 4개, 조합 중복 검사

2-3 보충(vs 두 장과 photoIn): `push`·`plate`·`reveal` 은 `drawSplitImages`(HEAD 1098) 가 두 장을 그리는 vs 장면을 건너뛴다. `pop` 은 card 에서 **카드 전체** 변환이라 vs 장면에도 적용한다 — `photoInOf` 에 `if (p.overlay === 'vs' && seg.scene.img2 && !(mode === 'pop' && p.template === 'card')) return null;`. before-after 가 이 조합을 쓴다.

### 4-1. 기존 스타일 10개 — 정체성(template·captionAnim·captionStyle·overlay·색·글꼴) 그대로, 새 어휘만 켠다

`rank.md` 의 선정(합계 점수 + 용도마다 5점 스타일 + 사진이 주인공인 템플릿 + 템플릿 분산 full4·split2·card2·dark1·blur1)을 그대로 쓴다. 표의 "전환" 열에서 바뀐 두 개(field-pin·breaking-news)는 이미 작업 트리에 반영돼 있다. `fx:'ad'`·`labelA/labelB` 는 모두 뺀다(0절).

| id | 정체성(tpl/anim/style/overlay, 전환) | `adFor` | `photoIn` | `photoFit` | `deco` | `titleAnim` | `extras` | 왜(한 줄) · 작업 트리와 차이 |
|---|---|---|---|---|---|---|---|---|
| listing-price | full/none/pill/price, fade | listing | `push` | `smart` | `['sweep']` | `mask` | `['stamp','lower3']` | 금색 색판 뒤에서 사진이 밀려 들어오고 조건 도장 + 상호 바 · 작업 트리에 deco·titleAnim 추가, fx 삭제 |
| field-pin | full/words/outline/pin, slide→**flash** | listing, consult | `plate` | `smart` | `['sweep','vignette']` | —(hook) | `['stamp','lower3']` | 답사 브이로그 플래시 컷, 색판이 빠지며 현장이 드러남(full+flash 라 push 금지) · plate·vignette 추가, fx 삭제 |
| site-tour-tag | split/bounce/tag/pin, slide | listing | `reveal` | `smart` | `['sweep']` | `slide` | `['lower3']` | 방마다 문을 여는 리빌 · frame→sweep, titleAnim 추가, fx 삭제 |
| calc-marker | split/scale/marker/counter, slide | listing, consult, proof | `push` | `smart` | `['sweep']` | `scale` | `['stamp','lower3']` | 숫자 장면마다 검남색 색판 컷, 결과 도장(단순 계산) · titleAnim 추가, fx 삭제 |
| before-after | card/slide/shadow3d/vs, wipe | proof, listing, consult | `pop`(카드 전체) | `smart` | `['sweep']` | `slide` | `['stamp']` | 카드가 톡 튀어나오고 후 사진에 광택, 성과 도장. 크림 카드엔 바가 무거워 lower3 없음(엔딩 연락 줄이 대신) · pop 0.85, fx·labelA/B 삭제 |
| cta-consult | card/pop/pill/dots, zoom | consult, brand, course, event | `push` | `smart` | `['sweep']` | `words` | `['stamp','lower3']` | 라임 색판 푸시인 + 제안 도장(무료 상담) + 상호 바, 엔딩 CTA 가 핵심 · rise→words, deco 추가, fx 삭제 |
| number-counter | dark/words/plain/counter, fade, hook | brand, proof | `push` | `smart` | `['bokeh']` | —(hook) | `['stamp']` | 검은 배경에 민트 보케(dark 4.3~6.6ms 라 여유), 썸네일 푸시인. lower3 없음(16:9 자막 1줄 회피; 상호는 엔딩 연락 줄) · extras 추가, fx 삭제 |
| case-gradient | blur/slide/gradient/quote, fade, none | proof | `pop` | —(blur) | `['vignette']` | —(none) | `['stamp']` | 사례 사진이 톡 나타나고 가장자리가 어두워 고급 인용 느낌(blur 엔 bokeh 가 안 보임). lower3 없음(제목 없음 + 오른쪽 아래 서명) · iris→pop, bokeh→vignette, fx 삭제 |
| ai-tool-glass | full/slide/glass/steps, slide | course, brand | `reveal` | `smart` | `['sweep']` | `mask` | `['stamp','lower3']` | 화면 녹화 인트로처럼 제목이 열리고 사진이 왼→오 리빌, 유리 위 빛 · reveal 추가, fx 삭제 |
| breaking-news | full/none/plain/news, none→**flash** | event, course, listing | `plate` | `smart` | `[]` | `scale` | `['stamp']` | 뉴스 하드컷 + 플래시, 색판이 빠지는 보도 사진 컷, 공지 도장(NEW·D-3). news 띠가 곧 로워서드라 lower3 없음(엔진도 news 와 함께면 안 그림) · push→plate(full+flash+push 금지), titleAnim 추가, fx 삭제 |

예비(2군, `ad` 없음, 업그레이드 없음): comment-reply · qna-bubble · step-tutorial · lecture-paper · policy-timeline · check-blue. lecture-paper(사례 08)와 quote-wave(사례 12)는 사례가 쓰지만 스타일 데이터는 그대로 둔다(픽셀 기준선 허용 목록에 넣지 않음 — 사례는 `extras` 없이 그 스타일 모양 그대로 나간다).

엔딩 CTA 는 스타일이 아니라 프로젝트 값이므로 스타일 데이터엔 없다. 사례(`ending.cta`)와 매물 상자(`applyOfficeBrand` → `'전화 문의'`)가 넣는다. 스타일 스트립 썸네일은 `previewTime`(첫 보통 장면 +1.4초)을 그리므로 엔딩이 보이지 않아 영향 없음.

### 4-2. 새 광고 스타일 4개 — `styles-data.js` 형식 그대로(31~34번째)

작업 트리의 네 항목에서 `visual` 과 주석만 바꾼다. `event-ribbon` 은 **`event-dday`** 로 id·이름·장식이 바뀐다(ribbon 삭제 → `price` 칩이 D-day 를 그림; `overlay:'price'` 와 split 조합은 기존 listing-price(full) 와 template 이 달라 규칙 충족).

```js
  // ───────── 31~34: 광고용 새 스타일(2026-11) — 로워서드·도장·D-day 칩·플래시 컷. template×captionAnim×overlay 조합이 앞 30개와 겹치지 않음(장식 lower3·stamp 가 새 것, price 는 full↔split) ─────────

  {
    id: 'brand-lower3',
    name: '브랜드형 — 로워서드 바',
    tagline: '사진 꽉 채운 화면 왼쪽 아래 상호·연락처 바, 3D 그림자 자막이 커지며 등장',
    ref: {
      format: '중개사무소·가맹 브랜딩 숏츠',
      why: '상호와 연락처가 처음부터 끝까지 보이면 영상이 끝나기 전에 전화를 건다',
      search: '공인중개사 사무소 홍보 쇼츠',
    },
    platforms: ['instagram', 'youtube', 'facebook', 'threads'],
    hook: '숫자 신뢰 선언 — "28년 공법 강의, 가맹점 100여 곳"',
    beats: ['훅: 숫자로 신뢰', '무엇을 돕나', '어떻게 다른가', '가맹·방문 혜택', '연락처 CTA'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'scale', captionStyle: 'shadow3d', overlay: 'lower3', transition: 'flash', motion: 'in', titleMode: 'band',
      bandColor: '#0c1222', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#0c1222', highlightColor: '#ff7a1a', // 남색 위 흰 글자 + 주황 3D 그림자·바
      font: '900', captionSize: 66, showProgress: true,
      // 로워서드(상호·연락처 = p.brand, 없으면 channel)가 주 장식, 조건 도장은 2차 장식. 주황 색판이 빠지며 사진이 드러나고(full+flash 라 push 대신 plate) 빛 스윕, 제목은 단어가 떠오름, 가로 사진은 smart
      photoIn: 'plate', photoFit: 'smart', titleAnim: 'words', deco: ['sweep'], extras: ['stamp'],
    },
    sample: {
      title: '*미스터홈즈* 가맹점\n모집합니다',
      scenes: [
        { caption: '28년 공법 강의,\n가맹점 *100여 곳*', img: 'o01-office-front', kind: 'hook', duration: 2.8, stamp: '가맹 모집' },
        { caption: '매물 영상·광고를 *AI*로 함께 만듭니다', img: 'h02-hero-studio', duration: 3 },
        { caption: '토지·공법 상담은 *본사*가 뒷받침', img: 's06-consultant-desk', duration: 3 },
        { caption: '교육과 시스템을 *개업 첫날*부터', img: 'e01-seminar', duration: 3, stamp: '교육 지원' },
        { caption: '가맹 상담은 *프로필 연락처*로', img: 'r01-contract', kind: 'cta', duration: 2.8 },
      ],
    },
    music: 'corporate',
    prompt: '브랜드형: 첫 장면은 숫자(연차·점포 수·수강생 수)로 신뢰를 세우고, 무엇을 돕는지·어떻게 다른지·혜택을 한 장면씩, 마지막은 연락 방법. 과장(최고·유일·보장) 금지, 숫자는 확인된 것만. 조건 한 단어는 stamp 에.',
    ad: true, adFor: ['brand', 'consult'],
  },

  {
    id: 'listing-cine',
    name: '매물 시네마형 — 플래시 컷',
    tagline: '검은 레터박스 바 사이로 사진이 드러나고, 컷마다 플래시와 조건 도장',
    ref: {
      format: '룸투어 시네마틱 숏츠',
      why: '플래시 컷 리듬이 사진 한 장을 한 컷처럼 보이게 해 사진만 넣어도 영상처럼 느껴진다',
      search: '신축 아파트 룸투어 쇼츠',
    },
    platforms: ['instagram', 'tiktok', 'youtube'],
    hook: '첫 컷에 핵심 조건 도장 — "신축 · 남향 · 즉시입주"',
    beats: ['훅: 외관 + 조건 도장', '거실', '주방', '안방', '욕실', '문의 CTA'],
    visual: {
      aspect: '9:16', template: 'full', captionAnim: 'pop', captionStyle: 'plain', overlay: 'stamp', transition: 'flash', motion: 'auto', titleMode: 'hook',
      bandColor: '#0a0a0a', panelColor: '#161616', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#4f8cff', // 검정 레터박스 + 파란 도장·플래시
      font: '800', captionSize: 72, showProgress: false,
      // 도장(scene.stamp)이 주 장식, 상호·연락처 바는 2차. 레터박스 바 + 빛 스윕, 파란 색판이 빠지며 사진이 드러남(full+flash 라 plate), 실내 가로 사진은 smart. 제목은 hook 모드(첫 1.2초 전체 화면)
      photoIn: 'plate', photoFit: 'smart', deco: ['bars', 'sweep'], extras: ['lower3'],
    },
    sample: {
      title: '*신축* 아파트\n34평 남향',
      scenes: [
        { caption: '이 집, *3초*만 보세요', img: 'a01-apt-exterior', kind: 'hook', duration: 2.4, stamp: '신축' },
        { caption: '거실 *남향* 통창', img: 'a02-apt-living', duration: 2.6, stamp: '남향' },
        { caption: '*ㄷ자* 주방, 식탁 자리 넉넉', img: 'a03-apt-kitchen', duration: 2.6 },
        { caption: '안방 *드레스룸* 별도', img: 'a04-apt-bedroom', duration: 2.6 },
        { caption: '욕실 *2개*, 건식 세면대', img: 'a05-apt-bath', duration: 2.6, stamp: '올수리' },
        { caption: '문의는 *설명란 연락처*로', img: null, kind: 'cta', duration: 2.6 },
      ],
    },
    music: 'epic',
    prompt: '매물 시네마형: 장면마다 공간 하나(외관·거실·주방·안방·욕실)와 장점 한 가지를 15자 안팎으로, stamp 에 조건 한 단어(신축·남향·올수리·즉시입주). 과장 금지, 마지막은 문의 안내.',
    ad: true, adFor: ['listing'],
  },

  {
    id: 'event-dday',
    name: '행사안내형 — D-day 칩',
    tagline: '위 사진 오른쪽 위 금색 칩에 D-day, 아래 연분홍 패널에 밑줄 자막으로 일정',
    ref: {
      format: '세미나·오픈·개강 안내 숏츠',
      why: '장면마다 붙어 있는 D-day 칩이 "지금 신청"을 재촉한다',
      search: '부동산 세미나 안내 쇼츠',
    },
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    hook: '날짜 선언 — "11월 20일, 딱 하루 엽니다"',
    beats: ['훅: 날짜+행사명', '누구를 위한 자리', '무엇을 배우나', '장소·시간', '신청 방법 CTA'],
    visual: {
      aspect: '9:16', template: 'split', captionAnim: 'words', captionStyle: 'underline', overlay: 'price', transition: 'slide', motion: 'in', titleMode: 'band',
      bandColor: '#111827', panelColor: '#fff1f2', textColor: '#ffffff', inkColor: '#111827', highlightColor: '#e11d48', // 연분홍 패널 위 검남 글자 + 장미색 밑줄·칩
      font: '800', captionSize: 60, showProgress: true,
      // D-day 칩(scene.tag — price 장식이 사진 오른쪽 위에 그림, 훅은 위 가운데 크게)이 주 장식, 패널 안 상호·연락처 바는 2차. 사진 왼→오 리빌 + 빛 스윕, 제목은 왼→오로 열림, 행사 가로 사진은 smart
      photoIn: 'reveal', photoFit: 'smart', titleAnim: 'mask', deco: ['sweep'], extras: ['lower3'],
    },
    sample: {
      title: '부동산 AI *자동화 4기*\n설명회',
      scenes: [
        { caption: '11월 20일, *딱 하루* 엽니다', img: 'e01-seminar', kind: 'hook', duration: 2.6, tag: 'D-7' },
        { caption: '매물 영상을 직접 만들고 싶은 *중개사*', img: 'o01-office-front', duration: 3, tag: 'D-7' },
        { caption: '사진 넣고 1분이면 *쇼츠* 완성', img: 'h02-hero-studio', duration: 3, tag: '모집중' },
        { caption: '저녁 7시, *줌* 온라인 진행', img: 's06-consultant-desk', duration: 3, tag: '온라인' },
        { caption: '신청은 *프로필 링크*, 선착순 30명', img: null, kind: 'cta', duration: 2.8, tag: '선착순' },
      ],
    },
    music: 'upbeat',
    prompt: '행사안내형: 첫 장면은 날짜와 행사명, 이어서 대상·내용·장소와 시간·신청 방법을 한 장면씩, tag 에 D-day·모집중·선착순 같은 짧은 말(7자 이내). 확정되지 않은 날짜는 "예정"으로.',
    ad: true, adFor: ['event', 'course'],
  },

  {
    id: 'review-stamp',
    name: '후기형 — 형광펜 도장',
    tagline: '흐린 배경 위 사진, 타자기로 찍히는 후기 문장에 형광펜, 오른쪽 위 ‘실제 후기’ 도장',
    ref: {
      format: '고객·수강생 후기 숏츠',
      why: '남이 한 말을 그대로 보여 주는 후기는 내가 하는 자랑보다 믿게 만든다',
      search: '공인중개사 고객 후기 쇼츠',
    },
    platforms: ['instagram', 'facebook', 'youtube'],
    hook: '후기 첫 문장 인용 — "계약 다음 날 영상이 올라왔어요"',
    beats: ['훅: 후기 한 문장', '고객 상황', '우리가 한 일', '결과', '같은 고민이면 CTA'],
    visual: {
      aspect: '9:16', template: 'blur', captionAnim: 'type', captionStyle: 'marker', overlay: 'stamp', transition: 'fade', motion: 'in', titleMode: 'band',
      bandColor: '#1c1917', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#1c1917', highlightColor: '#fbbf24', // 갈색 흐림 위 호박색 형광펜 띠 + 검은 글자
      font: '800', captionSize: 60, showProgress: true,
      // 도장(scene.stamp — 실제 후기·계약 완료)이 주 장식, 상호·연락처 바는 2차. 사진이 톡 나타나고 가장자리를 어둡게(blur 엔 bokeh 가 안 보임), 제목은 밀려 들어옴. blur 는 이미 contain 이라 photoFit 없음
      photoIn: 'pop', titleAnim: 'slide', deco: ['vignette'], extras: ['lower3'],
    },
    sample: {
      title: '고객 *후기*\n이렇게 남겨 주셨어요',
      scenes: [
        { caption: '"계약 다음 날 *영상*이 올라왔어요"', img: 'r01-contract', kind: 'hook', duration: 2.8, stamp: '실제 후기' },
        { caption: '3개월 안 나가던 *빌라*였습니다', img: 'v01-villa-before', duration: 3 },
        { caption: '사진 6장으로 *쇼츠* 3편을 만들었고', img: 'v02-villa-after', duration: 3 },
        { caption: '2주 만에 *계약*으로 이어졌습니다', img: 'a02-apt-living', duration: 3, stamp: '계약 완료' },
        { caption: '비슷한 고민이면 *연락* 주세요', img: null, kind: 'cta', duration: 2.8 },
      ],
    },
    music: 'calm',
    prompt: '후기형: 첫 장면은 따옴표로 감싼 후기 한 문장, 이어서 상황→한 일→결과를 짧게, 마지막은 연락 안내. 후기는 동의받은 것만, 이름은 익명, 수익·시세 약속 금지.',
    ad: true, adFor: ['proof'],
  },
```

### 4-3. 조합 중복 검사 (`template × captionAnim × overlay`, 보조 규칙 "overlay 가 같으면 template 이 달라야")

| 새 스타일 | 조합 | 같은 (template, captionAnim) 을 쓰는 기존 스타일 | 같은 overlay 를 쓰는 기존 스타일 | 결과 |
|---|---|---|---|---|
| brand-lower3 | full / scale / lower3 | 없음(full/scale 은 비어 있던 조합) | 없음(새 장식) | ✓ |
| listing-cine | full / pop / stamp | 없음(full/pop 비어 있음) | 없음(review-stamp 는 blur) | ✓ |
| event-dday | split / words / price | myth-vs-truth(split/words/**vs**) — overlay 다름 | listing-price(**full**/none/price) — template 다름 | ✓ |
| review-stamp | blur / type / stamp | comment-reply(blur/type/**comment**) — overlay 다름 | listing-cine(**full**) — template 다름 | ✓ |

기존 30개 조합표는 `rank.md` 1절(작업 트리와 동일). 템플릿 분포 34개: full 10 · split 7 · dark 6 · card 4 · band 3 · blur 4. 음악: corporate·epic·upbeat·calm(10가지 분포 유지). 새 샘플 자막은 35자 이내·`*강조*` 1개·BANNED_WORDS 없음(`tests/check-cases.mjs` 가 검사). 새 사진 13장 id 는 `js/samples.js` SAMPLES 에 이미 등록됨(a01~a05·b01·b02·l01·o01·e01·r01·v01·v02).

픽셀 기준선 허용 목록(7절): **업그레이드 10개 id** = `listing-price,field-pin,site-tour-tag,calc-marker,before-after,cta-consult,number-counter,case-gradient,ai-tool-glass,breaking-news`. 새 4개는 `pixel-compare` 에 "새로 생김"으로만 찍힌다(불합격 아님).

---

## 5. 사례 데이터 최종 — `js/cases-data.js` 에 그대로

작업 트리의 `js/cases-data.js`(13개 = 설계 12개 + 행사 1개 `office-open-event`, 10:42 기준)를 **그대로 쓰되** 다음만 바꾼 것이 아래 전문이다(이 문서가 만든 `scratchpad/plan/cases-final.js` 와 같음, `node --input-type=module` 로 파싱 확인):

1. `office-open-event` 의 `style: 'event-ribbon'` → **`'event-dday'`**(4-2). `tag` 필드는 그대로(price 칩이 그림).
2. `villa-remodel-ba` 의 `labelA/labelB` 삭제(fx:'ad' 가 이번 범위 밖 — 전/후 글자는 자막 "전:"·"후:" 에 있음). `vsLabel: '→'` 는 유지(`ovVs` HEAD 1800 이 읽고, `cases.js SCENE_COPY_KEYS` 가 넘김). 저장·열기(`saveProject` 1134/`openProject` 1161)에 `vsLabel` 을 넣어야 왕복 뒤 '→' 가 'VS' 로 돌아가지 않는다.
3. notes 세 곳의 문구(`labelA/labelB`·`fx 가 띠에`·`리본`)를 최종 어휘로.
4. 머리 주석의 `ribbon`·`labelA/labelB` 언급 삭제(아래 전문엔 주석 대신 이 절의 규칙이 설명).

필드 형식(`cases.js` 가 읽는 이름 — recipe-ux.md 9-1 과 cases.md 2-6 의 "이름 맞추기"가 반영된 것): `id name category(listing|brand|course|consult|proof|event) purpose inputLine platforms aspect style title channel('' = 상호 → 기본 채널) ending{text,sub('{office}' 자리표시),cta,duration} music scenes[{slot(1부터, 같은 번호 = 같은 사진, 글자 장면 null) img hint slot2 img2 hint2 vsLabel kind tag label stamp counter caption narration duration}] extraScene{caption('{n}' 번호 틀),narration,duration} upload{desc,hashtags} notes`.

데이터 규칙(`tests/check-cases.mjs` 가 검사): 장면 6~8(첫 hook·끝 cta), 자막 별표 뺀 32자 이내·`*강조*` 1개·2줄 이내, 읽을 문장 70자 이내, `tag` 7자·`stamp` 6자 권장(엔진 8자에서 자름), 엔딩 ≥2.5초·cta 있음, 사진 자리 1~6개, 모든 img 는 SAMPLES 에, slot 번호 1부터 빈틈 없이, BANNED_WORDS + '확실' 없음, 장식이 요구하는 필드(price → tag 전 장면, pin → label 전 장면, counter → 한 장면 이상, vs → 훅에 img2, stamp → 한 장면 이상), 매물 사례 `ending.sub === '{office}'` 와 notes 의 표시·광고 문구. 가격·면적·숫자는 모두 **예시**이고 ② 매물 정보 값으로 바뀐다(05 는 연 임대료 ÷ (매매가 − 보증금) 재계산 — 9절).

### 요약표

| id | 이름 | 용도 | 스타일 | 비율 | 사진 자리 | 장면 | 길이(초) | 음악 | 도장 |
|---|---|---|---|---|---|---|---|---|---|
| apt-sale-tour | 아파트 매매 투어 | listing | listing-price | 9:16 | 5 | 7 | 23.2 | calm | 급매·올수리 |
| shop-corner-lease | 코너 상가 임대 투어 | listing | site-tour-tag | 9:16 | 3 | 7 | 23.2 | playful | — |
| land-plan-road | 계획관리 토지 답사 | listing | field-pin | 9:16 | 4 | 8 | 26.2 | epic | 도로 접함·계획관리·155만/평 |
| villa-remodel-ba | 빌라 리모델링 전후 | listing | before-after | 1:1 | 3 | 7 | 23.2 | upbeat | 올수리·즉시 입주 |
| shop-yield-calc | 상가 수익률 계산 | listing | calc-marker | 9:16 | 4 | 8 | 26.6 | corporate | 임대 중·단순 계산 |
| fc-franchise-ask | 미스터홈즈 가맹 문의 | brand | brand-lower3 | 9:16 | 6 | 7 | 23.4 | corporate | 가맹 모집·교육 지원 |
| ai-cohort-recruit | 부동산AI 기수 모집 | course | ai-tool-glass | 16:9 | 5 | 7 | 23.4 | lofi | 모집중·실습 과정 |
| developer-course | 토지 디벨로퍼 과정 | course | lecture-paper | 9:16 | 6 | 7 | 23.4 | corporate | — |
| land-consult-qna | 토지 컨설팅 Q&A | consult | cta-consult | 9:16 | 6 | 7 | 23 | lofi | 무료 상담·공법 28년 |
| consult-review-story | 컨설팅 후기 이야기 | proof | review-stamp | 9:16 | 5 | 7 | 23.4 | calm | 상담 사례·의뢰인 후기 |
| new-listing-flash | 신규 매물 속보 | listing | breaking-news | 9:16 | 5 | 7 | 23.2 | news | 신규 매물·올수리 |
| brand-slogan-wave | 사무소 슬로건 | brand | quote-wave | 9:16 | 1 | 6 | 21 | epic | — |
| office-open-event | 사무소 오픈 설명회 | event | event-dday | 9:16 | 5 | 7 | 23.4 | upbeat | — |

용도 분포 매물 6 · 브랜드 2 · 강의 2 · 상담 1 · 후기 1 · 행사 1. 스타일 13종 모두 다름(광고용 추천 10 중 8 + 새 4 중 4 모두 사용 — number-counter·case-gradient 만 사례 없음; lecture-paper·quote-wave 는 광고용 추천 밖이지만 강의 브랜드 일관성·글자만 사례라 유지). 비율 9:16 11 · 1:1 1 · 16:9 1.

### `js/cases-data.js` 전문

```js
// 따라하기 사례(레시피) 데이터 — 사용자는 사진만 넣고, 자막·읽을 문장·스타일·음악·엔딩은 이 데이터 그대로 씁니다.
// 사례 화면(갤러리)과 숏폼 화면의 레시피 모드가 js/cases.js 의 변환 함수(caseToProject·caseSlots·caseScript·caseUpload)를 통해 이 배열을 읽습니다.
// 사진 id 는 js/samples.js 의 SAMPLES(assets/samples/*.jpg), 스타일 id 는 js/styles-data.js, 음악은 js/music.js 의 MOODS id.
// 장면: slot = 사진 자리 번호(1부터, 같은 번호 = 같은 사진, 글자 장면은 null) · hint = 어떤 사진을 넣을지 · slot2/img2/hint2 = 비교·전후의 둘째 사진 자리 · vsLabel = 가운데 원 글자
//       kind hook|normal|answer|cta · caption(별표 뺀 32자 이내, *강조* 1개) · narration(읽을 문장 70자 이내) · tag(price 칩 ≤7자) · label(핀) · stamp(도장 ≤6자) · counter{from,to,suffix}
// 장식이 읽는 필드만 채웁니다: price·date → tag, pin·comment → label, counter → counter, vs → img2(+vsLabel), stamp → stamp(스타일이 stamp 를 켰을 때만 그려짐).
// {office} 는 엔딩 부제에서 중개사무소 상호·연락처로 바뀌는 자리표시입니다(없으면 채널 이름). 가격·면적·숫자는 모두 예시입니다.
// 점검: node tests/check-cases.mjs(데이터) · node tests/cases-sheet.cjs(실제 렌더 시트)

export const CASE_CATEGORIES = [
  { id: 'listing', label: '매물' },
  { id: 'brand', label: '브랜드·가맹' },
  { id: 'course', label: '강의·과정' },
  { id: 'consult', label: '상담' },
  { id: 'proof', label: '후기·성과' },
  { id: 'event', label: '행사' },
];

export const CASE_DATA = [
  // ───────── 01 매물 · 아파트 매매 ─────────
  {
    id: 'apt-sale-tour',
    name: '아파트 매매 투어',
    category: 'listing',
    purpose: '아파트 매매 매물을 외관→거실→주방→안방→욕실 순서로 가격 태그와 함께 보여 주고 문의로 연결',
    inputLine: '사진 5장(외관·거실·주방·안방·욕실) + 대본 그대로',
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    aspect: '9:16',
    style: 'listing-price',
    title: '역 가까운 *남향* 24평\n아파트 매매',
    channel: '',
    ending: { text: '*문의*는 프로필·전화로', sub: '{office}', cta: '문의하기', duration: 2.6 },
    music: 'calm',
    scenes: [
      { slot: 1, img: 'a01-apt-exterior', hint: '외관', kind: 'hook', tag: '매매 7.2억', stamp: '급매', caption: '이 가격에 *남향* 24평?', narration: '남향 24평 아파트가 이 가격이면, 한번 보실 만하죠.', duration: 2.8 },
      { slot: 2, img: 'a02-apt-living', hint: '거실', kind: 'normal', tag: '남향', caption: '거실 창으로 *햇살*이 가득 들어와요', narration: '거실 창이 남쪽이라 낮에 햇살이 깊게 들어옵니다.', duration: 3 },
      { slot: 3, img: 'a03-apt-kitchen', hint: '주방', kind: 'normal', tag: '아일랜드', stamp: '올수리', caption: '주방은 *올수리*, 아일랜드 조리대', narration: '주방은 올수리를 마쳤고, 아일랜드 조리대가 있습니다.', duration: 3 },
      { slot: 4, img: 'a04-apt-bedroom', hint: '안방', kind: 'normal', tag: '방 3', caption: '안방엔 *붙박이장*, 방은 세 개', narration: '안방에는 붙박이장이 있고, 방은 모두 세 개입니다.', duration: 3 },
      { slot: 5, img: 'a05-apt-bath', hint: '욕실', kind: 'normal', tag: '욕실 2', caption: '욕실 두 개, *유리 파티션*으로 깔끔', narration: '욕실은 두 개고, 유리 파티션이라 물 튐 걱정이 적습니다.', duration: 3 },
      { slot: 1, img: 'a01-apt-exterior', hint: '외관(1번 다시)', kind: 'normal', tag: '즉시 입주', caption: '*즉시 입주* 가능, 계약 전 등기부 확인', narration: '바로 입주할 수 있고, 계약 전에는 등기부등본을 꼭 확인하세요.', duration: 3 },
      { slot: null, img: null, kind: 'cta', tag: '문의', caption: '더 궁금하면 *프로필·전화*로 문의', narration: '더 궁금한 점은 프로필이나 전화로 편하게 문의 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트, 사진으로 확인하세요', narration: '{n}번째 포인트도 사진으로 확인해 보세요.', duration: 3 },
    upload: {
      desc: '역에서 가까운 남향 24평 아파트 매매 매물(예시)을 사진 순서대로 소개합니다. 거실·주방·안방·욕실을 영상으로 먼저 보고, 방문은 프로필·전화로 예약해 주세요. 가격·면적 등 자세한 정보는 아래 표시 항목을 확인하세요.',
      hashtags: ['#아파트매매', '#남향아파트', '#24평아파트', '#역세권아파트', '#아파트매물', '#부동산쇼츠', '#공인중개사'],
    },
    notes: '가격(7.2억)·면적(24평)·방 수는 예시 — 따라하기 때 ② 매물 정보 칸의 값으로 바꾼다. 채광·조망은 사진에 보이는 만큼만, 과장어(최고·무조건·100%·보장·확실) 금지. 도장(급매·올수리)은 사실일 때만 남긴다. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 건축물이므로 층수·사용승인일·방향·방·욕실 수·입주 가능일·주차·관리비도 밝힌다. 마지막 장면의 상호·전화는 {office} 자리로 자동.',
  },

  // ───────── 02 매물 · 1층 코너 상가 임대 ─────────
  {
    id: 'shop-corner-lease',
    name: '코너 상가 임대 투어',
    category: 'listing',
    purpose: '1층 코너 상가 임대 매물을 현장 투어처럼 핀 라벨로 공간마다 포인트 하나씩 짚고 업종 상담으로 연결',
    inputLine: '사진 3장(전면·내부·앞 거리) + 대본 그대로',
    platforms: ['instagram', 'youtube', 'facebook', 'threads'],
    aspect: '9:16',
    style: 'site-tour-tag',
    title: '1층 *코너* 상가\n임대 같이 보기',
    channel: '',
    ending: { text: '*임대 문의*는 프로필·전화로', sub: '{office}', cta: '전화하기', duration: 2.6 },
    music: 'playful',
    scenes: [
      { slot: 1, img: 'b01-shop-front', hint: '상가 전면', kind: 'hook', label: '역 앞 코너', caption: '1층 코너 상가, *같이* 보시죠', narration: '역 앞 1층 코너 상가, 저와 같이 한번 보시죠.', duration: 2.8 },
      { slot: 1, img: 'b01-shop-front', hint: '전면(1번 다시)', kind: 'normal', label: '전면', caption: '*통유리* 전면, 두 면이 길에 닿아요', narration: '전면이 통유리고 두 면이 길에 닿아 있어 멀리서도 잘 보입니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부 공실', kind: 'normal', label: '내부', caption: '전용 *15평*, 바닥·천장 마감 완료', narration: '전용 15평이고, 바닥과 천장 마감이 되어 있습니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부(2번 다시)', kind: 'normal', label: '설비', caption: '*화장실*·급배수 안에 있어요', narration: '화장실과 급배수가 안에 있어서 쓸 수 있는 업종이 많습니다.', duration: 3 },
      { slot: 3, img: 's04-city-commercial', hint: '앞 거리', kind: 'normal', label: '유동인구', caption: '퇴근길 *유동인구* 많은 거리', narration: '퇴근 시간대에 사람이 많이 지나는 거리입니다.', duration: 3 },
      { slot: 1, img: 'b01-shop-front', hint: '전면(1번 다시)', kind: 'normal', label: '임대 조건', caption: '보증금 *5천*, 월세 250만원', narration: '임대 조건은 보증금 5천만원에 월세 250만원입니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', label: '문의', caption: '업종 상담은 *프로필·전화*로', narration: '어떤 업종이 맞을지 프로필이나 전화로 상담해 드릴게요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트, 현장에서 확인', narration: '{n}번째 포인트도 현장에서 직접 확인했습니다.', duration: 3 },
    upload: {
      desc: '역 앞 1층 코너 상가 임대 매물(예시)입니다. 통유리 전면에 두 면이 길에 닿고, 전용 15평에 화장실·급배수가 안에 있습니다. 보증금·월세와 업종 상담은 프로필·전화로 문의해 주세요.',
      hashtags: ['#상가임대', '#1층상가', '#코너상가', '#역세권상가', '#상가매물', '#창업자리', '#공인중개사'],
    },
    notes: '보증금·월세·전용면적은 예시. 음식점 등 업종 가능 여부(용도·정화조·소방)는 단정하지 말고 "확인 후"로. 권리금·유동인구 숫자는 쓰지 않음. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 상가는 건축물이므로 층수·사용승인일·주차·관리비도 밝힌다. 핀 라벨(label)은 장소·지점 이름 — 사용자 사진에 맞춰 바꿔도 됨. 전면 가로 사진은 photoFit smart 로 흐린 배경 위에 온전히 들어간다.',
  },

  // ───────── 03 매물 · 계획관리지역 토지 ─────────
  {
    id: 'land-plan-road',
    name: '계획관리 토지 답사',
    category: 'listing',
    purpose: '도로에 접한 계획관리지역 토지 매물을 답사하듯 핀 라벨로 보여 주고(도로·용도지역·건폐율·가격·허가 확인) 문의 유도',
    inputLine: '사진 4장(도로 쪽·항공·부지·주변) + 대본 그대로',
    platforms: ['youtube', 'facebook', 'instagram'],
    aspect: '9:16',
    style: 'field-pin',
    title: '도로 붙은 *계획관리* 땅\n직접 가봤습니다',
    channel: '',
    ending: { text: '*토지 문의*는 프로필·전화로', sub: '{office}', cta: '문의하기', duration: 2.6 },
    music: 'epic',
    scenes: [
      { slot: 1, img: 'l01-land-road', hint: '대지 전경', kind: 'hook', label: '현장', caption: '이 땅, 직접 *가봤습니다*', narration: '도로 바로 옆 이 땅, 제가 직접 가봤습니다.', duration: 2.8 },
      { slot: 1, img: 'l01-land-road', hint: '도로 접면(1번 다시)', kind: 'normal', label: '도로', stamp: '도로 접함', caption: '*2차선 도로*에 바로 붙어 있어요', narration: '2차선 도로에 바로 접해 있어 진입이 쉽습니다.', duration: 3 },
      { slot: 2, img: 's01-land-zoning', hint: '항공·필지 경계', kind: 'normal', label: '용도지역', stamp: '계획관리', caption: '용도지역은 *계획관리지역*', narration: '토지이용계획확인원 기준으로 계획관리지역입니다.', duration: 3 },
      { slot: 3, img: 's03-permit-site', hint: '평탄한 부지', kind: 'normal', label: '지형', caption: '평탄한 *660㎡*, 성토 부담 적어 보여요', narration: '660제곱미터 평탄한 땅이라 흙을 돋울 부담이 적어 보입니다.', duration: 3 },
      { slot: 4, img: 'h01-hero-land', hint: '주변 드론', kind: 'normal', label: '건폐율', caption: '계획관리는 *건폐율 40%*까지, 조례 확인', narration: '계획관리지역은 건폐율 40퍼센트까지인데, 시군 조례를 꼭 확인하세요.', duration: 3 },
      { slot: 1, img: 'l01-land-road', hint: '대지(1번 다시)', kind: 'normal', label: '가격', stamp: '155만/평', caption: '매매가 *3억 1천*, 평당 155만원', narration: '매매가는 3억 1천만원, 평당 155만원 정도입니다.', duration: 3 },
      { slot: 3, img: 's03-permit-site', hint: '부지(3번 다시)', kind: 'normal', label: '허가', caption: '*개발행위허가* 여부, 계약 전 확인', narration: '개발행위허가가 나는 땅인지 계약 전에 꼭 확인합니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', label: '문의', caption: '땅 문의는 *프로필·전화*로', narration: '이 땅이 궁금하면 프로필이나 전화로 문의 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트, 현장에서 확인', narration: '{n}번째 포인트도 현장에서 확인했습니다.', duration: 3 },
    upload: {
      desc: '2차선 도로에 접한 계획관리지역 토지 매물(예시)을 현장 답사 순서로 소개합니다. 용도지역·건폐율은 토지이용계획확인원과 시군 조례로 확인했고, 개발행위허가 가능 여부는 계약 전에 함께 확인해 드립니다. 자세한 사항은 프로필·전화로 문의해 주세요.',
      hashtags: ['#토지매매', '#계획관리지역', '#도로접한땅', '#전원주택부지', '#창고부지', '#토지투자', '#공법의신'],
    },
    notes: '면적(660㎡)·가격(3억 1천)·평당가는 예시. 용도지역·건폐율은 토지이용계획확인원·조례로 확인한 것만 쓰고 "개발 예정·값 오른다" 같은 기대 표현 금지. 도장(도로 접함·계획관리·평당가)도 확인된 사실로 바꾼다. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함(토지는 건축물 항목 불필요). 지역명은 핀 라벨(label)에 사용자가 적는다.',
  },

  // ───────── 04 매물 · 빌라 리모델링 비포애프터(1:1) ─────────
  {
    id: 'villa-remodel-ba',
    name: '빌라 리모델링 전후',
    category: 'listing',
    purpose: '리모델링을 마친 빌라 매물을 전·후 사진 짝 비교로 보여 주고 방문 예약으로 연결(인스타 피드용 정사각)',
    inputLine: '사진 3장(전·후 짝 + 외관) + 대본 그대로',
    platforms: ['instagram', 'facebook', 'threads'],
    aspect: '1:1',
    style: 'before-after',
    title: '*올수리* 빌라\n전과 후',
    channel: '',
    ending: { text: '*방문 예약*은 프로필·전화로', sub: '{office}', cta: '방문 예약', duration: 2.6 },
    music: 'upbeat',
    scenes: [
      { slot: 1, img: 'v01-villa-before', hint: '전(거실)', slot2: 2, img2: 'v02-villa-after', hint2: '후(거실)', vsLabel: '→', kind: 'hook', stamp: '올수리', caption: '이 거실, *두 달* 만에 이렇게', narration: '이 거실이 두 달 만에 이렇게 바뀌었습니다.', duration: 2.8 },
      { slot: 1, img: 'v01-villa-before', hint: '전(1번 다시)', slot2: 2, img2: 'v02-villa-after', hint2: '후(2번 다시)', vsLabel: '→', kind: 'normal', caption: '전: 낡은 장판과 *어두운* 벽', narration: '전에는 장판이 낡고 벽이 어두웠습니다.', duration: 3 },
      { slot: 1, img: 'v01-villa-before', hint: '전(1번 다시)', slot2: 2, img2: 'v02-villa-after', hint2: '후(2번 다시)', vsLabel: '→', kind: 'normal', caption: '후: *마루*·조명·도배 새로 했어요', narration: '후에는 마루와 조명, 도배를 모두 새로 했습니다.', duration: 3 },
      { slot: 2, img: 'v02-villa-after', hint: '후(2번 다시)', kind: 'normal', caption: '*새시*·보일러까지 교체', narration: '새시와 보일러까지 바꿨습니다.', duration: 3 },
      { slot: 3, img: 'c04-listing-sub', hint: '빌라 외관', kind: 'normal', caption: '*3층*, 방 2 욕실 1, 주차 1대', narration: '3층이고 방 둘에 욕실 하나, 주차는 한 대 됩니다.', duration: 3 },
      { slot: 1, img: 'v01-villa-before', hint: '전(1번 다시)', slot2: 2, img2: 'v02-villa-after', hint2: '후(2번 다시)', vsLabel: '→', kind: 'normal', stamp: '즉시 입주', caption: '매매 *2억 4천*, 바로 입주 가능', narration: '매매가는 2억 4천만원이고, 바로 입주할 수 있습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '보러 오실 분은 *프로필·전화*로', narration: '직접 보고 싶으시면 프로필이나 전화로 예약해 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '전후 *{n}번째* 비교', narration: '{n}번째 전후 비교입니다.', duration: 3 },
    upload: {
      desc: '리모델링을 마친 빌라 매매 매물(예시)을 전·후 사진으로 비교했습니다. 마루·조명·도배·새시·보일러를 새로 했고 바로 입주할 수 있습니다. 방문 예약은 프로필·전화로 해 주세요.',
      hashtags: ['#빌라매매', '#리모델링빌라', '#올수리', '#비포애프터', '#신혼집', '#빌라매물', '#공인중개사'],
    },
    notes: '리모델링 범위는 실제 한 것만(사진에 없는 새시·보일러는 사용자 사실로 바꾸거나 뺀다). 하자·누수 없음 같은 단정 금지. 전·후 사진은 같은 자리·같은 각도여야 비교가 통한다(사진 자리 1=전, 2=후, 3=외관). 1:1 정사각 — before-after 의 card 템플릿은 엔진이 정사각 배치로 바꾼다. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 건축물 항목(층수·사용승인일·방향·방·욕실·입주일·주차·관리비)도 밝힌다. 가운데 원의 →(vsLabel)은 cases.js 변환이 장면에 그대로 넘긴다. 전/후 글자는 자막 앞("전:"·"후:")에 둔다(좌우 라벨 칩은 다음 단계).',
  },

  // ───────── 05 매물 · 수익률 계산형 상가 ─────────
  {
    id: 'shop-yield-calc',
    name: '상가 수익률 계산',
    category: 'listing',
    purpose: '상가 매매 매물의 임대 수익률을 숫자 카운트로 단순 계산해 보여 주고(매매가→월세→연 임대료→실투자→수익률) 상담 유도',
    inputLine: '사진 4장 + 숫자 5개(매매가·월세·연 임대료·실투자·수익률)',
    platforms: ['youtube', 'instagram', 'facebook'],
    aspect: '9:16',
    style: 'calc-marker',
    title: '이 상가 사면\n*수익률* 몇 %?',
    channel: '',
    ending: { text: '*수익률 상담*은 프로필·전화로', sub: '{office}', cta: '상담 신청', duration: 2.8 },
    music: 'corporate',
    scenes: [
      { slot: 1, img: 'b01-shop-front', hint: '상가 전면', kind: 'hook', caption: '이 상가, 연 *수익률* 몇 %일까요?', narration: '이 1층 상가, 연 수익률이 몇 퍼센트쯤 나올까요? 같이 계산해 보죠.', duration: 2.8 },
      { slot: 1, img: 'b01-shop-front', hint: '전면(1번 다시)', kind: 'normal', counter: { from: 0, to: 60000, suffix: '만원' }, caption: '매매가 *6억*원', narration: '매매가는 6억원입니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부', kind: 'normal', stamp: '임대 중', counter: { from: 0, to: 250, suffix: '만원' }, caption: '보증금 1억, 월세 *250만원*', narration: '지금 보증금 1억에 월세 250만원으로 임대 중입니다.', duration: 3 },
      { slot: 2, img: 'b02-shop-inside', hint: '내부(2번 다시)', kind: 'normal', counter: { from: 0, to: 3000, suffix: '만원' }, caption: '연 임대료 *3,000만원*', narration: '월세 250만원이면 1년에 3천만원입니다.', duration: 3 },
      { slot: 3, img: 's04-city-commercial', hint: '앞 거리', kind: 'normal', counter: { from: 60000, to: 50000, suffix: '만원' }, caption: '보증금 빼면 실투자 *5억*', narration: '매매가에서 보증금 1억을 빼면 실제 들어가는 돈은 5억입니다.', duration: 3 },
      { slot: null, img: null, kind: 'normal', stamp: '단순 계산', counter: { from: 0, to: 6, suffix: '%' }, caption: '연 *6%*, 세금·대출 전 단순 계산', narration: '3천만원 나누기 5억, 연 6퍼센트. 세금과 대출을 빼기 전 단순 계산입니다.', duration: 3.2 },
      { slot: 4, img: 'r01-contract', hint: '계약서·서류', kind: 'normal', caption: '계약 전 *임대차계약서*·공실 확인', narration: '계약 전에 임대차계약서와 공실 가능성은 꼭 확인하세요.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '내 조건 계산은 *프로필·전화*로', narration: '내 대출 조건으로 계산해 보고 싶으면 프로필이나 전화로 문의하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 숫자도 확인', narration: '{n}번째 숫자도 같이 보시죠.', duration: 3 },
    upload: {
      desc: '1층 상가 매매 매물(예시)의 임대 수익률을 단순 계산해 보았습니다. 매매가 6억, 보증금 1억·월세 250만원이면 연 임대료 3,000만원, 실투자금 5억 기준 연 6%입니다(세금·대출·공실·관리비 반영 전, 예시 계산). 내 조건으로 계산은 프로필·전화로 문의해 주세요.',
      hashtags: ['#상가투자', '#상가수익률', '#1층상가', '#상가매매', '#임대수익', '#수익형부동산', '#공인중개사'],
    },
    notes: '수익률은 "세금·대출·공실·관리비 반영 전 단순 계산 예시" 문구를 자막·설명에 반드시 유지 — "확정 수익"·"수익 보장" 같은 말은 findBannedWords 가 잡는다. 숫자는 ② 매물 정보 값으로 치환하고 계산도 다시 한다(연 임대료 ÷ (매매가 − 보증금)). counter 가 없는 장면은 숫자가 뜨지 않음(추가 장면은 세부 조절에서 counter 를 넣어야 숫자 등장). 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 상가는 건축물 항목(층수·사용승인일·주차·관리비)도 밝힌다.',
  },

  // ───────── 06 브랜드 · 미스터홈즈 FC 가맹 문의 ─────────
  {
    id: 'fc-franchise-ask',
    name: '미스터홈즈 가맹 문의',
    category: 'brand',
    purpose: '미스터홈즈 FC 가맹(체인 가입) 문의를 받는 브랜드 광고 — 사실은 "대한민국 최초 기업형부동산, 100여 개 체인점, 28년 공법 강의" 세 가지만',
    inputLine: '사진 6장 + 대본 그대로(사실 3개만)',
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    aspect: '9:16',
    style: 'brand-lower3',
    title: '혼자 하는 중개,\n*함께* 하면 달라집니다',
    channel: '',
    ending: { text: '*가맹 문의*는 프로필 링크로', sub: '미스터홈즈 FC · MR.K 고상철', cta: '가맹 문의', duration: 2.8 },
    music: 'corporate',
    scenes: [
      { slot: 1, img: 's06-consultant-desk', hint: '혼자 일하는 책상', kind: 'hook', stamp: '가맹 모집', caption: '이런 고민 있으세요?\n*혼자* 하는 중개', narration: '혼자 사무소를 꾸리면서 광고에 상담까지, 벅차지 않으세요?', duration: 2.8 },
      { slot: 2, img: 'h02-hero-studio', hint: '영상 작업실', kind: 'normal', caption: '매물 광고도 *교육*도 혼자서는 벅차죠', narration: '매물 광고도 교육도 혼자 다 하기는 벅찹니다.', duration: 3 },
      { slot: 3, img: 'o01-office-front', hint: '중개사무소 내부', kind: 'normal', caption: '대한민국 *최초* 기업형부동산, 미스터홈즈', narration: '미스터홈즈는 대한민국 최초의 기업형 부동산입니다.', duration: 3 },
      { slot: 4, img: 's04-city-commercial', hint: '상가 거리', kind: 'normal', caption: '전국 *100여 개* 체인점이 함께합니다', narration: '전국 100여 개 체인점이 함께하고 있습니다.', duration: 3 },
      { slot: 5, img: 'e01-seminar', hint: '세미나·교육', kind: 'normal', stamp: '교육 지원', caption: '*28년* 공법 강의, 고상철이 함께합니다', narration: '28년 부동산공법을 가르친 고상철이 같이 갑니다.', duration: 3 },
      { slot: 6, img: 'r01-contract', hint: '계약·상담', kind: 'normal', caption: '가맹 조건은 *상담*으로 설명드려요', narration: '가맹 조건은 전화 상담으로 자세히 설명드리겠습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '프로필 링크에서 *가맹 문의*', narration: '프로필 링크에서 가맹 문의를 남겨 주세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 이유, 사진으로', narration: '{n}번째 이유입니다.', duration: 3 },
    upload: {
      desc: '대한민국 최초 기업형부동산 미스터홈즈 FC가 가맹 문의를 받습니다. 전국 100여 개 체인점과 함께하며, 28년 부동산공법 강의의 고상철이 교육을 맡습니다. 가맹 조건은 프로필 링크로 문의해 주세요.',
      hashtags: ['#미스터홈즈', '#부동산가맹', '#공인중개사창업', '#기업형부동산', '#중개사무소', '#부동산프랜차이즈', '#MRK'],
    },
    notes: '사실은 "대한민국 최초 기업형부동산"·"100여 개 체인점"·"28년 공법 강의" 세 가지만 쓰고 정확한 점포 수·매출·수익은 쓰지 않는다. 수익·매출 보장 표현 금지(가맹사업법상 예상 매출은 서면 자료 없이 말하지 않는다). 가맹비·조건 숫자는 영상에 넣지 않고 상담으로. 매물 광고가 아니므로 표시·광고 항목은 불필요하나 상호·연락처는 설명란에. 스타일은 brand-lower3 — 상호·연락처 로워서드가 끝까지 보이는 브랜드형(설계 초안의 cta-consult 는 09 상담 사례가 쓴다). 채널 이름은 MR.K 고상철(기본값), 사무소 정보가 있으면 상호로 바뀐다.',
  },

  // ───────── 07 강의 · 부동산AI 자동화 기수 모집(16:9) ─────────
  {
    id: 'ai-cohort-recruit',
    name: '부동산AI 기수 모집',
    category: 'course',
    purpose: '공인중개사 대상 부동산AI 자동화 기수 모집 — "사진만 넣으면 매물 쇼츠" 3단계 시연 흐름, 유튜브 가로 영상용',
    inputLine: '가로 사진 5장 + 3단계 대본 그대로',
    platforms: ['youtube', 'facebook'],
    aspect: '16:9',
    style: 'ai-tool-glass',
    title: '사진만 넣으면 *매물 쇼츠*\n자동화 기수 모집',
    channel: '',
    ending: { text: '*기수 신청*은 설명란 링크로', sub: 'MR.K 고상철 · 부동산AI 자동화', cta: '신청하기', duration: 2.8 },
    music: 'lofi',
    scenes: [
      { slot: 1, img: 'h02-hero-studio', hint: '작업실(가로)', kind: 'hook', stamp: '모집중', caption: '매물 사진만 넣으면 *쇼츠*가 나옵니다', narration: '매물 사진만 넣으면 쇼츠 한 편이 나옵니다. 어떻게 하는지 보여 드릴게요.', duration: 2.8 },
      { slot: 2, img: 'a02-apt-living', hint: '매물 사진 예(거실)', kind: 'normal', caption: '1단계: 매물 *사진*을 올립니다', narration: '1단계, 매물 사진을 순서대로 올립니다.', duration: 3 },
      { slot: 3, img: 's06-consultant-desk', hint: '책상·서류', kind: 'normal', caption: '2단계: AI가 *대본*과 자막을 씁니다', narration: '2단계, AI가 사진을 보고 대본과 자막을 써 줍니다.', duration: 3 },
      { slot: 1, img: 'h02-hero-studio', hint: '작업실(1번 다시)', kind: 'normal', caption: '3단계: 목소리 입혀 *MP4*로 저장', narration: '3단계, 목소리를 입혀 MP4로 바로 저장합니다.', duration: 3 },
      { slot: 4, img: 'e01-seminar', hint: '강의 장면(가로)', kind: 'normal', stamp: '실습 과정', caption: '기수 과정에서 *직접* 만들어 봅니다', narration: '자동화 기수 과정에서는 이걸 내 매물로 직접 만들어 봅니다.', duration: 3 },
      { slot: 5, img: 'o01-office-front', hint: '중개사무소 내부', kind: 'normal', caption: '표시·광고 *규정*까지 같이 배웁니다', narration: '매물 광고의 표시·광고 규정까지 같이 배웁니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '다음 기수 신청은 *설명란 링크*로', narration: '다음 기수 신청은 설명란 링크에서 하실 수 있습니다.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 단계도 화면으로', narration: '{n}번째 단계입니다.', duration: 3 },
    upload: {
      desc: '공인중개사를 위한 부동산AI 자동화 기수를 모집합니다. 매물 사진만 넣으면 AI가 대본·자막을 쓰고 목소리를 입혀 MP4 쇼츠로 저장하는 과정을 직접 만들어 보고, 표시·광고 규정까지 함께 배웁니다. 다음 기수 일정과 신청은 설명란 링크를 확인하세요.',
      hashtags: ['#부동산AI', '#자동화기수', '#공인중개사교육', '#매물쇼츠', '#AI영상', '#고상철', '#MRK영상만들기'],
    },
    notes: '합격·매출·수익 보장 표현 금지. 기수 번호·날짜·수강료는 영상에 넣지 않고 설명란 링크로(바뀌는 값) — 도장도 "모집중"처럼 숫자 없는 말만. 16:9 는 제목 띠가 얇고 제목 줄바꿈이 한 줄로 이어지므로 제목을 짧게 유지. 3:2 가로 사진(h02·e01)이 16:9 에 잘 맞는다. 매물 상자(listing.js)로 따라하면 비율 경고가 뜰 수 있음.',
  },

  // ───────── 08 강의 · 토지 디벨로퍼 과정 ─────────
  {
    id: 'developer-course',
    name: '토지 디벨로퍼 과정',
    category: 'course',
    purpose: '건국대 디벨로퍼 과정(대표강사 고상철) 모집 — 땅을 개발하는 사람이 보는 3가지를 STEP 으로 맛보기',
    inputLine: '사진 6장 + 원칙 3개 대본 그대로',
    platforms: ['youtube', 'instagram', 'facebook', 'threads'],
    aspect: '9:16',
    style: 'lecture-paper',
    title: '땅을 *개발*하는 사람은\n이 세 가지를 봅니다',
    channel: '',
    ending: { text: '*과정 안내*는 설명란 링크로', sub: '건국대 디벨로퍼 과정 · 대표강사 고상철', cta: '과정 안내', duration: 2.8 },
    music: 'corporate',
    scenes: [
      { slot: 1, img: 'h01-hero-land', hint: '개발 예정지 드론', kind: 'hook', caption: '땅을 *개발*하는 사람은\n이걸 먼저 봅니다', narration: '땅을 개발하는 사람은 가격보다 이것부터 봅니다.', duration: 2.8 },
      { slot: 2, img: 's01-land-zoning', hint: '항공·필지', kind: 'normal', caption: '*용도지역*, 무엇을 지을 수 있나', narration: '첫째, 용도지역. 이 땅에 무엇을 지을 수 있는지 정합니다.', duration: 3 },
      { slot: 3, img: 'l01-land-road', hint: '도로 접한 대지', kind: 'normal', caption: '*도로*, 허가의 출발점', narration: '둘째, 도로. 도로가 있어야 허가가 시작됩니다.', duration: 3 },
      { slot: 4, img: 's03-permit-site', hint: '공사 준비 부지', kind: 'normal', caption: '*개발행위허가*, 나야 사업이 됩니다', narration: '셋째, 개발행위허가. 이게 나야 사업이 됩니다.', duration: 3 },
      { slot: 5, img: 'e01-seminar', hint: '세미나·강의', kind: 'normal', caption: '건국대 디벨로퍼 과정에서 *실전*으로', narration: '건국대 디벨로퍼 과정에서는 이 세 가지를 실전 사례로 익힙니다.', duration: 3 },
      { slot: 6, img: 's06-consultant-desk', hint: '강사 책상·지적도', kind: 'normal', caption: '28년 공법 강의, *대표강사* 고상철', narration: '28년 부동산공법을 가르친 고상철이 대표강사로 함께합니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '과정 안내는 *설명란 링크*에서', narration: '과정 안내와 신청은 설명란 링크에서 확인하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 원칙, 현장 사진으로', narration: '{n}번째 원칙입니다.', duration: 3 },
    upload: {
      desc: '땅을 개발하는 사람이 가격보다 먼저 보는 세 가지, 용도지역·도로·개발행위허가를 건국대 디벨로퍼 과정에서 실전 사례로 익힙니다. 28년 부동산공법을 가르친 고상철이 대표강사로 함께합니다. 과정 안내와 신청은 설명란 링크를 확인하세요.',
      hashtags: ['#디벨로퍼과정', '#건국대', '#토지개발', '#부동산공법', '#공법의신', '#토지투자', '#고상철'],
    },
    notes: '모집 일정·수강료·정원은 설명란에(영상엔 넣지 않음). 수익·인허가 보장 표현 금지. 과정 정식 명칭·기관명은 사용자가 확인해 적는다. steps 장식은 훅·cta 를 빼고 STEP 01/05 로 번호를 매기므로 본문 장면 수가 곧 STEP 수. 스타일은 광고용 추천이 아닌 lecture-paper(공법의 신 대표 스타일) — 강의 브랜드 일관성 때문에 그대로 둔다.',
  },

  // ───────── 09 상담 · 토지 컨설팅 Q&A ─────────
  {
    id: 'land-consult-qna',
    name: '토지 컨설팅 Q&A',
    category: 'consult',
    purpose: '땅 가진 사람이 자주 묻는 질문 3개에 결론부터 답하고 토지 컨설팅 상담 신청으로 연결',
    inputLine: '사진 6장 + 질문·답 3쌍 그대로',
    platforms: ['youtube', 'instagram', 'facebook'],
    aspect: '9:16',
    style: 'cta-consult',
    title: '땅 가진 분들 *질문* 3개,\n답해 드립니다',
    channel: '',
    ending: { text: '*내 땅 상담*은 프로필 링크로', sub: 'MR.K 고상철 · 토지 컨설팅', cta: '상담 신청', duration: 2.8 },
    music: 'lofi',
    scenes: [
      { slot: 1, img: 's01-land-zoning', hint: '농촌 토지 항공', kind: 'hook', stamp: '무료 상담', caption: '물려받은 땅, *팔아야* 할까요?', narration: '첫 질문. 물려받은 땅, 지금 팔아야 할까요?', duration: 2.8 },
      { slot: 2, img: 's06-consultant-desk', hint: '상담 책상·지적도', kind: 'normal', caption: '*용도지역*부터 보고 정합니다', narration: '용도지역부터 확인하고 정하자는 게 답입니다. 땅마다 다르니까요.', duration: 3 },
      { slot: 3, img: 's02-landlocked', hint: '맹지', kind: 'normal', caption: '맹지라는데 *방법*이 있나요?', narration: '둘째 질문. 우리 땅이 맹지라는데 방법이 있을까요?', duration: 2.8 },
      { slot: 4, img: 'l01-land-road', hint: '도로 접한 대지', kind: 'normal', caption: '*진입로* 확보 방법이 몇 가지 있어요', narration: '진입로를 확보하는 방법이 몇 가지 있습니다. 조건을 봐야 해요.', duration: 3 },
      { slot: 5, img: 's03-permit-site', hint: '공사 준비 부지', kind: 'normal', caption: '창고 지으려는데 *허가* 될까요?', narration: '셋째 질문. 창고를 지으려는데 허가가 날까요?', duration: 2.8 },
      { slot: 6, img: 'h01-hero-land', hint: '개발 예정지 드론', kind: 'normal', stamp: '공법 28년', caption: '도로·경사·용도지역 *세 가지*로 판단', narration: '도로와 경사도, 용도지역 세 가지를 보면 대략 판단이 됩니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '내 땅은 어떤지 *프로필 링크*로 상담', narration: '내 땅은 어떤지 궁금하면 프로필 링크로 상담을 신청하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 질문도 같이 봅니다', narration: '{n}번째 질문입니다.', duration: 3 },
    upload: {
      desc: '물려받은 땅을 팔아야 할지, 맹지에 방법이 있는지, 창고 허가가 날지 — 땅 가진 분들이 자주 묻는 질문 3개에 결론부터 답했습니다. 내 땅은 어떤지 궁금하면 프로필 링크로 상담을 신청하세요.',
      hashtags: ['#토지컨설팅', '#토지상담', '#맹지', '#용도지역', '#개발행위허가', '#땅투자', '#공법의신'],
    },
    notes: '답은 일반론 — "됩니다" 단정 대신 조건부("조건을 봐야")로. 상담 비용·절차는 설명란에. 과장어 금지. 질문·답 장면이 번갈아 가므로 추가 사진(extraScene)은 질문 틀로 들어가고 답은 사용자가 세부 조절에서 적는다. 스타일은 상담 용도 1순위 cta-consult(점 진행 + 무료 상담 도장 + 로워서드) — 설계 초안의 qna-bubble 은 말풍선이 사진을 크게 가려 광고용 추천에서 빠진 스타일이라 바꿨고, 자막의 "Q./A." 접두는 pop 등장과 어울리게 뺐다. 채널 이름은 MR.K 고상철.',
  },

  // ───────── 10 후기 · 컨설팅 후기 이야기(익명·예시) ─────────
  {
    id: 'consult-review-story',
    name: '컨설팅 후기 이야기',
    category: 'proof',
    purpose: '토지 컨설팅 후기를 익명·예시로 재구성해 상담 신뢰를 쌓는 광고(3년 묵힌 맹지가 풀린 이야기)',
    inputLine: '사진 5장 + 사례 한 편 그대로',
    platforms: ['youtube', 'facebook', 'threads'],
    aspect: '9:16',
    style: 'review-stamp',
    title: '맹지 때문에 *3년* 묵힌 땅,\n이렇게 풀렸습니다',
    channel: '',
    ending: { text: '*내 땅도* 상담받기', sub: 'MR.K 고상철 · 토지 컨설팅', cta: '상담 신청', duration: 2.8 },
    music: 'calm',
    scenes: [
      { slot: 1, img: 's02-landlocked', hint: '맹지(문제의 땅)', kind: 'hook', stamp: '상담 사례', caption: '3년 동안 *안 팔리던* 땅이 있었습니다', narration: '3년 동안 안 팔리던 땅이 있었습니다. 상담 사례를 재구성한 이야기입니다.', duration: 2.8 },
      { slot: 1, img: 's02-landlocked', hint: '맹지(1번 다시)', kind: 'normal', caption: '"도로가 없어서 *건축*이 안 된대요"', narration: '의뢰인은 도로가 없어 건축이 안 된다는 말만 들었다고 했습니다.', duration: 3 },
      { slot: 2, img: 's06-consultant-desk', hint: '지적도·상담 책상', kind: 'normal', caption: '지적도를 보니 *현황도로*가 있었습니다', narration: '지적도와 현장을 같이 보니 현황도로가 있었습니다.', duration: 3 },
      { slot: 3, img: 'l01-land-road', hint: '도로 접한 대지', kind: 'normal', caption: '*토지사용승낙*으로 진입로 정리', narration: '옆 필지 소유자의 토지사용승낙으로 진입로를 정리했습니다.', duration: 3 },
      { slot: 4, img: 's03-permit-site', hint: '공사 준비 부지', kind: 'normal', caption: '허가 신청 뒤 *매수 문의*가 왔습니다', narration: '개발행위허가를 신청하자 매수 문의가 들어오기 시작했습니다.', duration: 3 },
      { slot: 5, img: 'r01-contract', hint: '계약서 서명', kind: 'normal', stamp: '의뢰인 후기', caption: '"*먼저* 물어볼걸 그랬어요" — 의뢰인', narration: '의뢰인은 먼저 물어볼걸 그랬다고 하셨습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '내 땅도 *상담*, 프로필 링크로', narration: '내 땅도 풀 방법이 있는지 프로필 링크로 상담 신청하세요.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 장면, 사진으로', narration: '{n}번째 장면입니다.', duration: 3 },
    upload: {
      desc: '3년 동안 팔리지 않던 맹지가 현황도로 확인과 토지사용승낙으로 진입로를 정리한 뒤 매수 문의를 받기까지의 상담 사례를 익명으로 재구성했습니다. 모든 땅에 같은 방법이 통하는 것은 아니며, 내 땅은 어떤지 프로필 링크로 상담을 신청하세요.',
      hashtags: ['#토지컨설팅후기', '#맹지탈출', '#토지사용승낙', '#현황도로', '#토지상담', '#공법의신', '#고상철'],
    },
    notes: '실제 인물·지번·지역을 드러내지 않는다(익명·예시 표시, 후기 사용 동의 확인). "모든 땅이 된다" 같은 일반화와 땅값 몇 배 같은 결과 수치는 쓰지 않는다. 후기 인용(따옴표)은 의뢰인이 한 말의 뜻을 바꾸지 않는 범위에서. 도장은 "상담 사례"·"의뢰인 후기"처럼 사례임을 밝히는 말만("실제 후기" 도장은 동의받은 실제 후기일 때만). 스타일은 후기형 review-stamp(형광펜 자막 + 도장 + 상호 로워서드) — 설계 초안의 case-gradient 는 제목이 없어(titleMode none) 브랜드 노출이 약해 바꿨다. 채널 이름은 MR.K 고상철.',
  },

  // ───────── 11 매물 · 속보형 신규 매물(전세) ─────────
  {
    id: 'new-listing-flash',
    name: '신규 매물 속보',
    category: 'listing',
    purpose: '방금 나온 신규 매물(아파트 전세 예시)을 속보처럼 알려 빠른 문의를 받는 광고',
    inputLine: '사진 5장 + 가격·입주일',
    platforms: ['youtube', 'instagram', 'threads', 'facebook'],
    aspect: '9:16',
    style: 'breaking-news',
    title: '[속보] *역세권* 24평\n전세 매물 나왔습니다',
    channel: '',
    ending: { text: '*전세 문의*는 프로필·전화로', sub: '{office}', cta: '전화하기', duration: 2.6 },
    music: 'news',
    scenes: [
      { slot: 1, img: 'a01-apt-exterior', hint: '외관(단지)', kind: 'hook', stamp: '신규 매물', caption: '방금 나왔습니다\n*역세권* 전세 24평', narration: '방금 나온 매물입니다. 역세권 24평 전세예요.', duration: 2.8 },
      { slot: 2, img: 'a02-apt-living', hint: '거실', kind: 'normal', caption: '전세 *3억 5천*, 남향 거실', narration: '전세가는 3억 5천만원, 거실은 남향입니다.', duration: 3 },
      { slot: 3, img: 'a03-apt-kitchen', hint: '주방', kind: 'normal', stamp: '올수리', caption: '주방·욕실 *올수리* 마쳤습니다', narration: '주방과 욕실은 올수리를 마쳤습니다.', duration: 3 },
      { slot: 4, img: 'a04-apt-bedroom', hint: '안방', kind: 'normal', caption: '입주는 *다음 달*부터 가능', narration: '입주는 다음 달부터 가능합니다.', duration: 3 },
      { slot: 5, img: 'a05-apt-bath', hint: '욕실', kind: 'normal', caption: '계약 전 *등기부* 근저당 꼭 확인', narration: '전세는 계약 전에 등기부등본의 근저당을 꼭 확인하세요.', duration: 3 },
      { slot: 1, img: 'a01-apt-exterior', hint: '외관(1번 다시)', kind: 'normal', caption: '*전세보증보험* 가입 여부도 체크', narration: '전세보증보험 가입이 되는지도 같이 확인해 드립니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '문의는 *프로필·전화*로', narration: '문의는 프로필이나 전화로 주세요. 연락 주신 순서대로 안내합니다.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 포인트도 확인하세요', narration: '{n}번째 포인트입니다.', duration: 3 },
    upload: {
      desc: '방금 나온 역세권 24평 아파트 전세 매물(예시)입니다. 전세 3억 5천, 남향 거실, 주방·욕실 올수리, 입주는 다음 달부터 가능합니다. 계약 전 등기부 근저당과 전세보증보험 가입 여부를 함께 확인해 드리니 프로필·전화로 문의해 주세요.',
      hashtags: ['#신규매물', '#아파트전세', '#역세권전세', '#24평전세', '#전세매물', '#부동산속보', '#공인중개사'],
    },
    notes: '"방금 나왔습니다"와 "신규 매물" 도장은 실제 신규 매물일 때만. "선착순·마감 임박" 같은 압박 문구는 쓰지 않는다. 전세가·입주일은 예시 — ② 매물 정보 값으로. 업로드 글 끝에 표시·광고 필수 항목(상호·등록번호·소재지·연락처·개업공인중개사)이 붙어야 함. 건축물 항목(층수·사용승인일·방향·방·욕실·입주일·주차·관리비)도 밝힌다. breaking-news 는 날짜 라벨을 쓰지 않는다(ticker 만 p.dateLabel 사용); 상호·연락처는 엔딩 CTA 아래 연락 줄(brand.phone)로 나간다(news 띠와 lower3 는 함께 쓰지 않음).',
  },

  // ───────── 12 브랜드 · 슬로건(글자만) ─────────
  {
    id: 'brand-slogan-wave',
    name: '사무소 슬로건',
    category: 'brand',
    purpose: '사무소·채널 슬로건을 글자만으로 크게 띄우는 브랜딩 영상 — 사진 없이 또는 사무소 사진 한 장',
    inputLine: '사진 0~1장 + 문장 6개',
    platforms: ['instagram', 'threads', 'tiktok', 'youtube'],
    aspect: '9:16',
    style: 'quote-wave',
    title: '우리 사무소 *한 문장*',
    channel: '',
    ending: { text: '*공법*을 아는 중개', sub: '{office}', cta: '프로필 보기', duration: 3 },
    music: 'epic',
    scenes: [
      { slot: null, img: null, kind: 'hook', caption: '부동산은 *아는 만큼* 보입니다', narration: '부동산은 아는 만큼 보입니다.', duration: 3 },
      { slot: null, img: null, kind: 'normal', caption: '모르면 *계약서*에 사인만 하고', narration: '모르면 계약서에 사인만 하게 되고요.', duration: 3 },
      { slot: null, img: null, kind: 'normal', caption: '알면 *손해*를 먼저 막습니다', narration: '알면 손님의 손해를 먼저 막습니다.', duration: 3 },
      { slot: null, img: null, kind: 'normal', caption: '*공법*을 아는 중개가 다릅니다', narration: '공법을 아는 중개가 다릅니다.', duration: 3 },
      { slot: 1, img: 'o01-office-front', hint: '사무소 사진(없어도 됨)', kind: 'normal', caption: '믿고 맡길 중개, *가까이* 있습니다', narration: '믿고 맡길 중개, 가까이 있습니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', caption: '지금 *프로필*에서 확인하세요', narration: '지금 프로필에서 확인하세요.', duration: 3 },
    ],
    extraScene: { caption: '*{n}번째* 문장', narration: '{n}번째 문장입니다.', duration: 3 },
    upload: {
      desc: '부동산은 아는 만큼 보입니다. 공법을 아는 중개가 손해를 먼저 막습니다. 믿고 맡길 중개사무소, 프로필에서 확인하세요.',
      hashtags: ['#공인중개사', '#부동산공법', '#공법의신', '#중개사무소', '#부동산슬로건', '#미스터홈즈'],
    },
    notes: '글자만 — 사진은 1장 이하(사진 자리 1개, 비워도 됨). 모든 장면 20자 이내·강조 1개(quote-wave 규칙). 과장어 금지. 상호는 채널(왼쪽 위)과 엔딩 {office} 로 자동 — 사무소 정보가 없으면 MR.K 고상철 채널로 나간다. 슬로건 문장은 사용자가 바꿔도 되며, 글자 장면은 사진 없이도 완성된다. 스타일은 광고용 추천이 아닌 quote-wave — 슬로건은 사진 없는 큰 글자가 곧 용도라 그대로 둔다.',
  },

  // ───────── 13 행사 · 사무소 오픈 설명회(D-day) ─────────
  {
    id: 'office-open-event',
    name: '사무소 오픈 설명회',
    category: 'event',
    purpose: '새 사무소 오픈 기념 토지 공법 설명회를 D-day 리본과 함께 알려 참가 신청을 받는 행사 안내',
    inputLine: '사진 5장(사무소·설명회·토지·책상·작업실) + 날짜·시간',
    platforms: ['instagram', 'facebook', 'youtube', 'threads'],
    aspect: '9:16',
    style: 'event-dday',
    title: '사무소 *오픈* 기념\n토지 공법 설명회',
    channel: '',
    ending: { text: '*참가 신청*은 프로필·전화로', sub: '{office}', cta: '참가 신청', duration: 2.8 },
    music: 'upbeat',
    scenes: [
      { slot: 1, img: 'o01-office-front', hint: '새 사무소', kind: 'hook', tag: 'D-7', caption: '11월 20일, 새 사무소 *문 엽니다*', narration: '11월 20일 토요일, 새 사무소가 문을 엽니다.', duration: 2.8 },
      { slot: 2, img: 'e01-seminar', hint: '설명회 자리', kind: 'normal', tag: 'D-7', caption: '오픈 기념 *토지 공법* 설명회', narration: '오픈을 기념해 토지 공법 설명회를 열어요.', duration: 3 },
      { slot: 3, img: 's01-land-zoning', hint: '토지 항공', kind: 'normal', tag: '특강', caption: '내 땅에 *무엇을* 지을 수 있나', narration: '주제는 내 땅에 무엇을 지을 수 있는지, 용도지역 읽는 법입니다.', duration: 3 },
      { slot: 4, img: 's06-consultant-desk', hint: '상담 책상', kind: 'normal', tag: '무료', caption: '설명회 뒤 *무료 상담* 30분', narration: '설명회가 끝나면 한 분씩 30분 무료 상담을 해 드립니다.', duration: 3 },
      { slot: 5, img: 'h02-hero-studio', hint: '영상 작업실', kind: 'normal', tag: '시연', caption: '매물 쇼츠 만들기 *시연*도 합니다', narration: '사진만 넣어 매물 쇼츠를 만드는 시연도 보여 드립니다.', duration: 3 },
      { slot: 1, img: 'o01-office-front', hint: '사무소(1번 다시)', kind: 'normal', tag: 'D-7', caption: '토요일 *오후 2시*, 사무소 2층', narration: '시간은 토요일 오후 2시, 장소는 사무소 2층입니다.', duration: 3 },
      { slot: null, img: null, kind: 'cta', tag: '선착순', caption: '신청은 *프로필·전화*로, 선착순 20명', narration: '참가 신청은 프로필이나 전화로 해 주세요. 선착순 스무 분입니다.', duration: 2.8 },
    ],
    extraScene: { caption: '*{n}번째* 순서도 준비했습니다', narration: '{n}번째 순서도 준비했습니다.', duration: 3 },
    upload: {
      desc: '새 사무소 오픈을 기념해 토지 공법 설명회(예시 일정)를 엽니다. 내 땅에 무엇을 지을 수 있는지 용도지역 읽는 법을 배우고, 설명회 뒤에는 30분 무료 상담과 매물 쇼츠 시연이 이어집니다. 참가 신청은 프로필·전화로 해 주세요.',
      hashtags: ['#사무소오픈', '#부동산설명회', '#토지공법', '#용도지역', '#무료상담', '#공인중개사', '#공법의신'],
    },
    notes: '날짜·시간·장소·정원(20명)은 예시 — 확정되지 않은 날짜는 "예정"으로 적고, 선착순은 실제 정원일 때만. D-day 칩 글(tag — 이 스타일의 주 장식 price 가 사진 오른쪽 위 금색 칩으로 그림)은 7자 이내로 D-7·오픈 기념·무료 상담처럼 짧게. 행사 안내는 매물 광고가 아니라 표시·광고 항목이 붙지 않지만 상호·연락처는 설명란에 적는다. 사무소 사진은 오픈 전이면 공사 중 사진이나 간판 사진도 된다.',
  },

];

/** id 로 사례 하나 찾기(없으면 null) */
export const findCase = (id) => CASE_DATA.find((c) => c.id === id) || null;
```

---
## 6. 따라하기 흐름 최종 스펙

`recipe-ux.md` 의 설계를 그대로 채택하고, 이름·규칙만 아래처럼 확정한다. 변환 함수는 작업 트리의 `js/cases.js`(`caseToProject`·`caseSlots`·`caseScript`·`caseUpload`·`caseUploadInfo`·`fillOffice`·`endingFor`·`channelFor`·`BASE_VISUAL`)를 그대로 쓴다(갤러리와 레시피가 **같은 함수**를 써야 "이대로"가 참). 새 파일: `js/recipe.js`(레시피 모드 UI·사진 교체·AI 다듬기), `js/recipe-prompt.js`(다듬기 프롬프트·스키마·정리), `css/cases.css`, `css/recipe.css`, `tests/recipe-flow.cjs`. 기존 파일은 함수 단위로만(6-11).

### 6-1. 사례 화면 — 「따라하기 사례」 갤러리(`#case-follow`)

- 자리: `index.html` 히어로(HEAD 46~72) 바로 아래, `.case-nav`(74~78) 위에 `<section class="follow" id="case-follow" aria-labelledby="h-follow" data-reveal>`. 클래스가 `.case` 가 아니므로 `showcase.js wireCaseDots`(174~191)의 점 3개·"사례 n / 3"·사례 01~03 번호는 그대로. id 가 `case-` 로 시작해 `main.js currentView`(83~88)·hashchange 의 `scrollIntoView`(220)가 그대로 동작.
- 머리: 라벨 "따라하기 사례", 제목(`data-kinetic-title`) "사진만 바꿔 넣으면 *그대로* 나오는 광고 사례", 힌트 "사례를 고르면 자막·대본·스타일·음악·엔딩이 그대로 들어오고, 사진 자리만 내 사진으로 바뀝니다.", 용도 칩 필터(`aria-pressed`, `CASE_CATEGORIES` 순서 + "전체", 칩 뒤 개수, `store.set('followFilter')`), 「❚❚ 미리보기 멈춤」(`#followPause` — 히어로 `#heroPause` 와 같은 `userPaused` 공유, `wirePause` 61~76 의 `sync` 를 두 버튼에).
- 히어로 수정: lede(51) 끝에 "광고 사례를 골라 사진만 바꿔 넣으면 그대로 나옵니다.", 칩(53~59)에 `따라하기 사례 <span data-case-count>13</span>가지`(`main.js fillCaseCount()` — `fillStyleCount` 175~181 과 같은 방식, `CASE_DATA.length`), 버튼(62) `사례 3가지 보기` → **「따라하기 사례 보기」**(href `#case-follow`). `.case-label`(78) "실제 결과 미리보기" → "도구가 하는 일 3가지".
- 카드(`article.follow-card[data-id][data-cat]`): 「넣는 것」= 사진 자리 띠(`caseSlots(c)` 순서로 최대 5장 + `+N`, 라벨 `hint`, 전후 짝은 "전 / 후" 두 칸) + `caseInputLine(c)`; 「나오는 것」= 비율에 맞는 캔버스(9:16 216×384 `.phone.sm`, 16:9 384×216 `.monitor`, 1:1 300×300, `role="img" aria-label="사례 「이름」 미리보기"`); 칩(용도·비율·"따라하기 01"), `h3` 이름, `purpose`, "스타일 「…」 · 음악 「…」"(`STYLES`·`MOODS` 이름), 「이대로 따라하기」= **일반 링크** `<a class="btn accent small" href="#follow=<id>" aria-label="「이름」 이대로 따라하기">`, 「대본 보기」(`aria-expanded`/`aria-controls`, 카드 안에서 펼침 — `caseScript(c)` 줄 목록: 자리·힌트·자막·읽기·도장·태그·길이, 마지막 엔딩 줄, 끝에 힌트 "가격·면적 같은 숫자는 예시입니다…").
- 살아 있는 미리보기 정책: 카드마다 `{ el, canvas, data, project, tl, ready, ratio }`. IO A(`rootMargin 320px`)에 들어오면 `prepare()` — `caseToProject(c, { office })` + `buildTimeline` + **정지 프레임 한 장**(`previewTime(tl)`). IO B(threshold 0/.25/.5/.75/1)가 `ratio` 갱신, `pickActive()` 가 `ratio` 내림차순·문서 순서로 **앞의 2개만** `active`, `showcase.js drawLoop`(35~46)에 `for (const c of activeFollow) drawFrame(c.canvas.getContext('2d'), c.project, c.canvas.width, c.canvas.height, ((now − t0)/1000) % c.tl.total, c.tl)` 한 줄 추가. 활동에서 빠지면 정지 프레임 한 번 다시. `ratio === 0`·`hidden`·`closest('[hidden]')` 이면 그리지 않음(38~41 규칙). `prefers-reduced-motion` 이면 `userPaused` 로 처음부터 정지. `document.fonts.ready` 뒤 준비된 카드 정지 프레임 다시. `pauseShowcase/resumeShowcase`(48~58) 그대로. 비용: 216×384 는 1080×1920 의 1/25 라 2개 ≈ 2ms.
- 사무소 정보(`store 'office'`)가 있으면 갤러리 미리보기에도 상호·연락처가 로워서드·엔딩에 보인다(결정: 넣는다 — "내 상호가 찍힌 사례"가 설득).

### 6-2. 레시피 모드 진입 — `followCase(id, { from })`(`js/recipe.js`)

- 두 갈래: 장면이 비었거나 모두 예시(`allSamples()` HEAD 119)면 **바로 불러오기**; 사용자의 사진·글이 있는 장면이 하나라도 있으면(`scenes.some((s) => !s.sample && (s.img || plainText(s.caption).trim()))`) 레시피 바를 **묻는 상태**로(확인창 없음): "**사례 「○○」를 불러올까요?** 지금 있는 장면 n개와 제목·엔딩이 사례 것으로 바뀝니다. 만든 목소리·영상도 지웁니다." [불러오기] [프로젝트 먼저 저장] [취소](`role="group" aria-label="사례 불러오기 확인"`). 「프로젝트 먼저 저장」= `api.saveProject()` 뒤 묻는 상태 유지.
- `loadCase(c)` 순서(스타일 → 비율 → 장면 → 제목·채널·brand·엔딩 → 음악 → 업로드 글):

```js
async function loadCase(c) {
  const office = api.officeInfo();                                  // 새 api: listingIO.office() → 없으면 store.get('office', {})
  api.resetMedia();                                                 // 새 api: openProject 1170~1178 을 떼어 낸 함수(내레이션·결과 영상 버림, 배경음악 파일은 둠)
  const built = await caseToProject(c, { office, defaults: api.defaults, newScene: api.newScene });   // cases.js — 사진 자리 장면은 sample:true
  api.applyStyle(c.style, { keepScenes: true });                    // ① 스타일(apply 가 visual·aspect 를 덮으므로 먼저)
  api.setAspect(built.aspect);                                      // ② 사례 비율(16:9 사례는 여기서 가로)
  api.setScenes(built.scenes);                                      // ③ projectToken++ · #scriptText · 대본 칸 초기화(1507~1513)
  api.setTitle(built.title);
  api.setChannel(built.channel);
  api.setBrand(built.brand);                                        // 2-9 — lower3·엔딩 연락 줄이 읽음
  api.setEnding(built.ending);                                      // text·sub('{office}' 치환됨)·cta·duration·enabled
  api.noteBrand({ channel: built.channel, ending: built.ending, keepText: true });   // listing.js 가 "내가 넣은 값"으로 알게(6-4)
  api.setStyleMusic(built.styleMusic);                              // 새 api
  api.setUploadInfo(caseUploadInfo(c, office));                     // 매물 사례는 source 'listing' → 표시 항목 경고 흐름
  recipe = { id: c.id, name: c.name, styleId: c.style, aspect: c.aspect, extra: c.extraScene, slots: slotsFor(c, built.scenes), confirmKey: '' };
  api.registerPhotoSink(placeImages);                               // 6-4 — addImageFiles 가 사진을 이쪽으로
  renderBar(); announce(`사례 「${c.name}」를 불러왔습니다. 사진 ${recipe.slots.length}장을 넣으면 그 자리에 들어갑니다.`);
  api.seek(0.6);
}
```
`slotsFor(c, scenes)` 는 `caseSlots(c)` 의 `targets[].sceneIndex` 를 `scenes[i].id` 로 바꾼 것(`{ no, hint, img, filled:false, targets:[{ sceneId, key }] }`).

- `api.applyStyle(idOrStyle, { keepScenes })`: 지금 `applyStyle(st)`(HEAD 683~710)은 `allSamples()` 이면 스타일의 예시 장면으로 **바꿔 버린다**(699~707) — 레시피 장면은 사진 자리가 모두 `sample:true` 라 그대로 두면 뒤집힌다 → `keepScenes` 가 true 면 그 분기를 건너뜀. `project.style`·`finish()` 는 그대로. 카드 클릭(653)은 `applyStyle(st, { keepScenes: !!photoSink })`.
- 새 api(shorts.js `api` 1457~1540 에 추가): `applyStyle(idOrStyle, opts)`, `setStyleMusic(v)`(`project.styleMusic = v; syncControls(); renderAudioInfo(); syncMusicPreview(); changed(false)`), `resetMedia()`, `officeInfo()`, `noteBrand(o)`(listingIO 로 전달), `setBrand(patch)`, `registerPhotoSink(fn)`, `pickReplacement(scene, key)`, `styleOf(id)`, `saveProject`, `isSampleTitle` 에 **사례 제목 포함**(`CASE_DATA.some((c) => k(c.title) === v)`). 이미 있는 것: `setAspect`(1494)·`setTitle`(1503)·`setScenes`(1507)·`setChannel`(1482)·`setEnding`(1484)·`setUploadInfo`(1521)·`seek`·`defaults`(1486)·`newScene`·`addImageFiles`·`lockStructure/unlockStructure`·`projectToken`·`busy`·`openKeyBar`.

### 6-3. 레시피 바(`#recipeBar`) — 자리와 문구

자리: `index.html` `.studio-controls`(213) **첫 자식**, `#listingBox`(215) 위(좁은 화면 ≤1100px 은 `.studio-preview` 가 `order:-1` 라 미리보기 → 레시피 바 → 매물 상자 순).

```html
<section class="panel recipe" id="recipeBar" role="region" aria-labelledby="h-recipe" hidden>
  <div class="recipe-head">
    <span class="recipe-badge">따라하기</span>
    <h2 id="h-recipe" tabindex="-1">아파트 매매 투어</h2>
    <span class="tag cat" id="recipeCat">매물</span><span class="tag" id="recipeAspect">9:16 쇼츠</span>
    <span class="kchip" id="recipeProgress" role="status" aria-live="polite">사진 0/5 바꿈</span>
    <button type="button" class="btn small ghost" id="recipeStop">사례 그만</button>
  </div>
  <ol class="recipe-slots" id="recipeSlots" aria-label="사진 자리(순서대로 들어갑니다)"></ol>
  <p class="hint recipe-hint" id="recipeHint"></p>
  <div class="row wrap recipe-actions">
    <label class="btn accent" for="recipeFiles">사진 넣기<input type="file" id="recipeFiles" accept="image/*" multiple hidden></label>
    <button type="button" class="btn" id="recipeRefine" disabled>AI 로 사진에 맞춰 대본 다듬기</button>
    <button type="button" class="btn small ghost" id="recipeRefineStop" hidden>멈춤</button>
    <button type="button" class="btn small ghost" id="recipeFill" hidden>남은 자리 채우기</button>
    <button type="button" class="btn small ghost" id="recipeTrim" hidden>남은 장면 빼기</button>
    <button type="button" class="btn small ghost" id="recipeRestyle" hidden>사례 스타일로 되돌리기</button>
  </div>
  <p class="hint ls-status" id="recipeStatus" role="status" aria-live="polite"></p>
  <div class="recipe-ask" id="recipeAsk" hidden></div>
</section>
```

- 슬롯 띠: `<li><button type="button" aria-label="자리 1 (예시 사진 · 외관) — 내 사진으로 바꾸기"><img><b>1</b><span>외관</span></button></li>`; 예시가 남은 자리 `.sample`(흐린 덧칠 `rgb(11 13 20 / 55%)` + "예시"), 바뀐 자리 밝게(`aria-label` "자리 1 (내 사진 · 외관) — 다른 사진으로 바꾸기"); 버튼 → `api.pickReplacement(scene, key)`(img2 자리는 이 버튼만으로 바꿈). 전후 짝은 "1 전 / 2 후" 두 칸.
- 진행 칩: `사진 0/5 바꿈` → `사진 2/5 바꿈` → `사진 5/5 바꿈 ✓`(`.on`) → 초과 `사진 5/5 바꿈 ✓ · 장면 2개 추가`.
- 안내 줄 상태별 문구: 0/N "사진 자리가 5개 있습니다(외관 → 거실 → 주방 → 안방 → 욕실). 내 사진을 넣으면 순서대로 들어가고, 자막·대본·스타일·음악·엔딩은 그대로입니다." / 일부 "사진 2/5 바꿈 — 예시 사진 3장(주방·안방·욕실)이 아직 남아 있습니다. 3장 더 넣거나, 내 사진으로 남은 자리를 채우려면 「남은 자리 채우기」를 누르세요." / 전부 "사진 5/5 바꿈 — 이제 「AI 로 사진에 맞춰 대본 다듬기」를 누르거나, 아래 ④ 목소리 → ⑤ 영상 만들기로 가세요." / 초과 "사진이 자리보다 2장 많아 마지막 문의 장면 앞에 장면 2개를 더 만들었습니다. 그 장면 자막은 「AI 로 사진에 맞춰 대본 다듬기」가 채워 줍니다(직접 적어도 됩니다)." / 16:9 사례는 뒤에 "이 사례는 가로(16:9) 유튜브용입니다. 릴스·틱톡용이면 세로(9:16) 사례를 고르세요." / 스타일을 바꿨을 때 "스타일을 「○○」로 바꿨습니다. 사례 그대로 돌아가려면 「사례 스타일로 되돌리기」."
- 버튼: 「사진 넣기」 → `api.addImageFiles(files)` 그대로(이름순·형식 검사·토스트 재사용, 안에서 `photoSink` 로). 「AI 로 … 다듬기」 바뀐 사진 1장 이상일 때만(6-5). 「남은 자리 채우기」(일부 상태만) = 바뀐 사진들을 `no` 순서로 돌려 남은 자리에(사진 2·자리 5 → 1·2·1·2·1). 「남은 장면 빼기」 = 자리가 모두 빈 장면 삭제(마무리 cta 제외). 「사례 스타일로 되돌리기」 = `api.applyStyle(recipe.styleId, { keepScenes: true })` + `setAspect(recipe.aspect)`. 「사례 그만」 = `recipe = null; api.registerPhotoSink(null); renderBar()`(장면·`sample`·`slot` 은 그대로 — 남은 예시가 있으면 6-7 경고는 계속), 토스트 "사례 모드를 끝냈습니다. 장면은 그대로 두었습니다. 이제 사진을 넣으면 뒤에 장면으로 추가됩니다.", 초점 `#sceneDrop`(437).
- 상호·연락처 규칙: `listingIO.office()`(새 메서드, listing.js 1317~1350 에 `office() { return { ...ls.office }; }`)·`noteBrand({ channel, ending, keepText })`(`ls.autoChannel = channel; ls.autoEnding = { ...ending, keepText }; saveListingPrefs()`). `applyOfficeBrand`(434~452)의 `end.text` 는 `ls.autoEnding?.keepText ? (p.ending?.text || '') : '*문의*는 설명란 연락처로'` — 사례 문구("*가맹 문의*는 프로필 링크로")가 덮이지 않게. `brand`·`cta` 도 같은 자리에서(2-9).

### 6-4. 사진 바꿔 넣기 규칙

- `addImageFiles`(HEAD 125~140)는 **그대로**, 뒤의 "`dropSamples()` + 뒤에 붙임" 한 덩어리만 `photoSink` 가 있으면 건너뛴다:

```js
let photoSink = null;   // 레시피가 등록 — (imgs: HTMLImageElement[]) => { placed, added }
async function addImageFiles(files) {
  if (structureLocked()) return 0;
  const imgs = files.filter(/* 125~128 그대로 */);
  if (!imgs.length) { toast('이미지 파일만 넣을 수 있습니다.'); return 0; }
  imgs.sort(/* 130 그대로 */);
  const loaded = []; let fails = 0;
  for (const f of imgs) { try { loaded.push(await imageFromFile(f)); } catch { fails++; } }
  if (photoSink) {                                      // ★ 레시피 모드: 지우지 않고 자리에 넣는다
    const r = photoSink(loaded);
    changed(true);
    toast(`사진 ${r.placed}장을 사례 자리에 넣었습니다.${r.added ? ` 장면 ${r.added}개를 더 만들었습니다.` : ''}${fails ? ` (${fails}장은 열지 못함)` : ''}`);
    return loaded.length;
  }
  dropSamples();
  for (const img of loaded) project.scenes.push(newScene(img, ''));
  changed(true); toast(`사진 ${loaded.length}장을 장면으로 넣었습니다.${fails ? ` (${fails}장은 열지 못함)` : ''}`); return loaded.length;
}
// dropSamples(120~122): if (photoSink) return;   — 「글자 장면 추가」(1621~1626)·「대본을 장면 자막에 넣기」(applyLines 142)가 사례 장면을 통째로 지우지 않게
```

- 자리 모델 `recipe.slots = [{ no, hint, img, filled, extra, targets:[{ sceneId, key:'img'|'img2' }] }]`(장면은 `img/img2/sample/slot/slot2` 만 들고 "어느 자리가 어느 장면의 어느 칸인지"는 레시피가 든다). 장면 `sample` = "그 장면에 예시 사진이 하나라도 남아 있음" — 자리를 채울 때마다 그 장면의 모든 자리가 찼는지 보고 내린다 → `renderScenes` '예시' 태그(254~259)·`photoScenes()`(listing.js 301)·`allSamples()`(119) 가 지금 뜻 그대로.
- `placeImages(imgs)`: ① 비어 있는 자리를 **지금 장면 순서**로(사용자가 ↑↓ 로 바꿨으면 바뀐 순서) 채움 — `targets` 의 모든 장면에 같은 사진(`s[key] = img`), `filled = true`; ② 남은 사진은 `extraScene` 틀로 `api.newScene(img, extra.caption, { narration, kind:'normal', slot: n, duration, hint:'추가한 사진' })` 을 마지막 `cta` 앞에(`findLastIndex`), 슬롯에 `{ no, hint:'추가', filled:true, extra:true }` 추가. **자막·읽을 문장·kind·tag·stamp·label·counter·duration 은 건드리지 않는다** — 바뀌는 건 `img/img2` 와 `sample`.
- 적을 때: 남은 자리는 예시 그대로 + 흐린 슬롯 + 안내 문구(결정: 기본은 "알리기", 채우기는 버튼 — 과제 지시대로; rank.md 초안의 "마지막 사진 반복"은 「남은 자리 채우기」로 흡수). 6-7 관문이 마지막 그물.
- 장면 목록 썸네일 클릭(`pickReplacement` 298~302 → `replaceInput` change 286~297): `replaceTarget = { scene, key }` 로 늘리고 change 끝에 `recipeHooks.replaced?.(scene, key)` → 그 자리 `filled = true`. 순서 바꾸기(`moveScene` 164~172, listing.js `movePhoto` 377~388): 슬롯은 장면 id 에 묶여 같이 움직임. 빼기(✕ 268~275, `removePhoto` 390~398): 자리도 사라짐(`open` 계산에서 `byId.has` 로 걸러짐). 「장면 모두 지우기」(1627~1635): 레시피도 끝냄 — "장면을 모두 지워 사례 모드를 끝냈습니다." 「대본을 장면 자막에 넣기」: 평소처럼 자막을 바꾸고 `narration` 비움 — 바에 "직접 넣은 대본으로 자막이 바뀌었습니다(사례 읽을 문장은 비웠습니다)."
- 매물 상자 ① `addPhotos`(listing.js 400~408)는 `api.addImageFiles` 를 그대로 부르므로 **같은 규칙**. 이어지는 `syncAutoTitle(true)`(420)는 `api.isSampleTitle` 이 true 인 제목만 바꾸므로 사례 제목을 포함시켜 ②에 종류·위치를 적으면 예시 제목("역 가까운 남향 24평")이 사실 제목으로 바뀌게. `renderThumbs`(326~375)는 `photoScenes()` = 바꾼 사진만(슬롯 띠가 전체 자리 담당).
- `renderScenes`(183~284) 보강: `s.slot` 있으면 `.tag` "자리 n"; `s.sample && s.img` 이면 '예시' 글자를 "예시 사진 — 눌러서 내 사진으로"(썸네일 `title` "내 사진으로 바꾸기"), 썸네일 `.sample` 덧칠(`recipe.css` 의 `.scene-thumb.sample::after`); `s.hint` 는 지금처럼 "사진 제안: 거실"(260~264).

### 6-5. 「AI 로 사진에 맞춰 대본 다듬기」(`recipe.js refine()`, `js/recipe-prompt.js`)

1. 막는 조건·문구: `inArtifact` → "Claude 미리보기에서는 쓸 수 없습니다. ko372.com 에서 써 주세요." / `api.busy` → "영상이나 목소리를 만드는 중입니다. 끝난 뒤 눌러 주세요." / 바뀐 사진 0장 → "먼저 사진을 한 장 이상 넣어 주세요." / 키 없음(`pickProvider()` — 결정: 제미나이 우선 기본, `ls.ai` 는 따르지 않음) → "AI 키가 없습니다. 맨 위 AI 키 칸에 제미나이 키(무료)를 넣어 주세요." + `api.openKeyBar({ focus: 'gemini' })`.
2. `api.lockStructure('AI 가 대본을 다듬는 중에는 장면·사진을 바꿀 수 없습니다. 끝나거나 「멈춤」을 누른 뒤 해 주세요.')`, `token = api.projectToken`, `AbortController`, 버튼 "AI 가 대본을 다듬는 중…"(aria-busy), 「멈춤」 보임.
3. 보내는 사진: **바뀐 사진 장면만**(`!s.sample && s.img`, 추가 장면 포함) 장면 순서로 최대 `MAX_AI_PHOTOS`(listing.js 249, 10장), `imageToBase64(img, { max: 1024, quality: 0.85 })`, "사진 k = 장면 i".
4. `generateJSON({ provider, prompt: buildRecipePrompt(...), schema: RECIPE_SCHEMA, images, signal })`(llm.js 33~61; `schemaFor` 87~124 가 서비스별 손질). 프롬프트는 `buildListingPrompt`(listing-prompt.js 125~178)의 사실·금지어·자막 길이 문장을 재사용(`factLines`·`officeOf` export 추가)하고 사례 특성(장면 수·순서·역할·도장·태그 **고정**, 사진이 바뀐 장면만 그 사진에 맞게, 예시 장면은 원래 글 유지 또는 사진 묘사만 뺌, 숫자는 적힌 사실이 없으면 뺌, 제목은 어긋날 때만)을 덧붙인다. 스키마 `RECIPE_SCHEMA = { title, scenes[{ index, caption(18~32), narration }], upload{ description, hashtags≤10 } }`(recipe-ux.md 4-3 그대로), `normalizeRecipeResult(data, scenes)` 는 범위 밖 index·빈 자막 버림, 자르지 않고 `long` 표시, `findBannedWords`.
5. 적용(살아 있음 검사: 보낸 장면이 그대로 있고 `token === api.projectToken`, generate 538~541 과 같음): 장면마다 `caption`·`narration` 만. 제목은 `api.isSampleTitle(project.title)` 일 때만. 업로드 글 갱신. `api.setScenes([...api.project.scenes])`.
6. 상태: "제미나이가 사진 n장을 보고 자막·읽을 문장을 다듬었습니다. 장면 수·순서·도장·태그는 그대로입니다. 숫자는 올리기 전에 꼭 확인하세요." + "자막이 긴 장면 n개 — 32자 이내로 줄여 주세요" / "과장 표현으로 보일 수 있는 말: …" / 목소리가 있으면 "지금 목소리는 예전 대본으로 만든 것이라 ④에서 다시 만들어 주세요."
7. `finally`: `api.unlockStructure()`, 버튼 복구. 「멈춤」 → "대본 다듬기를 멈췄습니다."

### 6-6. 딥링크 `#follow=<id>`

- `main.js currentView()`(83~88): `if (h.startsWith('follow=')) return 'shorts';` 를 `case-` 규칙 앞에. `boot()`(209~235): hashchange(216~221)에서 `follow=` 면 `switching.then(consumeFollow)`; 첫 진입은 `Promise.all([...])`(225~230) **뒤에** `consumeFollow()`.
- `consumeFollow()`: `location.hash.match(/^#follow=([a-z0-9-]+)$/i)` → `history.replaceState(null, '', '#shorts')`(새로고침·뒤로가기에 다시 불러오지 않게) → `followCase(id, { from: 'link' })`; 모르는 id 면 `toast('그런 사례가 없습니다. 사례 화면에서 다시 골라 주세요.')` 후 숏폼 화면만.
- `#case-*` 앵커·`wireKeyLinks`(72~81)의 `pushState('#shorts')` 와 충돌 없음. 레시피 상태는 `recipe.js` 모듈 변수(새로고침하면 사라짐 — 사진은 어차피 .json 으로만; `store` 에 남기지 않음).

### 6-7. 저장/열기 · 스타일 바꾸기 · 경고 · 16:9

- `saveProject`(1123~1145): 장면에 `slot: s.slot ?? null, slot2: s.slot2 ?? null, hint2: s.hint2 || '', stamp: s.stamp || '', vsLabel: s.vsLabel || ''`, 맨 위에 `recipe: recipe ? { id, styleId, aspect, slots: slots.map(({ no, filled, extra, hint, targets }) => ({ no, filled, extra, hint, targets: targets.map(({ sceneId, key }) => ({ sceneIndex: indexOf(sceneId), key })) })) } : null`, `version: 3`(읽는 쪽은 버전 검사 없음). `openProject`(1147~1195): 장면 필드 복원(1153~1158 `newScene` 호출에 추가), `data.recipe` 가 있고 `findCase(id)` 가 있으면 `recipe.restore(data.recipe, project.scenes)`(sceneIndex → 새 sceneId, 바 표시); id 를 모르면 레시피 없이 열고 토스트 없음. `resetMedia()` 로 1170~1178 분리.
- 스타일 바꾸기: 레시피 모드에서 카드 클릭 → `applyStyle(st, { keepScenes: true })` — 장면 그대로, 바에 「사례 스타일로 되돌리기」(`recipe.styleId` 는 사례 값 유지). 필터로 숨은 카드면 '전체'로 되돌리고 `scrollIntoView({ inline:'center', block:'nearest' })`.
- **예시 사진이 남은 채 영상 만들기** — `exportVideo`(804~864)·`exportAllStyles`(913~978) 거절 목록(809~814 / 915~920) 뒤에 한 번 더 누르기 관문(listing.js `send` 1180~1186 과 같은 방식):

```js
function sampleGate(say) {
  const left = project.scenes.filter((s) => s.sample && s.img);
  const mixed = left.length && project.scenes.some((s) => !s.sample && s.img);
  if (!left.length || !(photoSink || mixed)) return true;        // 사례 모드가 아니고 순수 예시(첫 화면 데모)면 지금처럼 바로
  const key = left.map((s) => s.id).join(',');
  if (sampleConfirm === key) { sampleConfirm = ''; return true; }
  sampleConfirm = key;
  say(`예시 사진 ${left.length}장이 아직 들어 있습니다(자리 ${left.map((s) => s.slot).filter(Boolean).join('·')}). 내 사진으로 바꾼 뒤 만들거나, 그대로 만들려면 한 번 더 누르세요.`, 0);
  return false;
}
```
`changed(true)`(구조 변경)에서 `sampleConfirm = ''`. `exportVideo` 는 `say(...)`(매물 상자 ⑤ `runExport` 1041~1062 상태 칸 포함), `exportAllStyles` 는 `#batchStatus`.
- 16:9 사례: `api.setAspect('16:9')` → listing.js `syncAspect`(1302~1306)의 `#lsAspectWarn`(index.html 313)·`renderButtons`(1291)의 `#lsSendWarn`(401) **그대로**(사실이고 의도를 다시 알림), 바의 비율 칩 "16:9 유튜브" + 안내 한 줄.
- `projectSig`(886~889)는 장면 id·자막·읽을 문장을 보므로 사진만 바꾼 뒤 만든 영상은 "지금 대본" — 의도대로. `uploadInfo.source` 'recipe'/'listing' 은 `listingContext()`(1144~1149)·`uploadTextOf`(1090~1121) 규칙 그대로.

### 6-8. 스타일 패널 「광고용 추천」 필터

`index.html` `.style-strip`(427) 앞에 `#styleFilter`(칩 `전체 <span data-style-count>` / `광고용 추천 <span id="adStyleCount">`, `aria-pressed`). `renderStyleStrip`(626~656): 카드 전부 만들고 `applyStyleFilter()` 가 `card.hidden = filter === 'ad' && !st.ad`, `st.ad` 면 `<small class="ad-badge">광고용 추천</small>`(색은 기존 토큰 `--mark` 바탕 + `--ink` 글자 — 새 토큰 없음); `renderStripThumbs`(658~681) `if (card.hidden) continue;`. 필터는 `store.set('styleFilter')`(프로젝트 설정 아님). 권장: 필터가 광고용이면 `#styleBatchBtn` 글 "광고용 추천 N가지 만들기", `exportAllStyles(list = visibleStyles())`, `batchLabel()`(598)도 필터를 봄(`data-style-count` 총수는 그대로).

### 6-9. 모바일 400px · 다크 · 움직임 줄이기 · 접근성

- 400px: 갤러리 `grid-template-columns: repeat(auto-fill, minmax(164px, 1fr))`(2열), 카드 캔버스 `width:100%`, 레시피 바 `flex-wrap`, 슬롯 띠는 바 **안에서만** 가로 스크롤(`overflow-x:auto; scrollbar-width:thin`), 버튼 `min-height:36px`(style.css 760 과 같음), `.recipe-head h2 { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }`, 필터 칩 줄 `overflow-x:auto`(메뉴 줄 748 과 같은 방식). 문서 가로 스크롤 0.
- 다크: 새 CSS 는 `:root` 토큰만(`--surface --surface-2 --line --ink --muted --accent --accent-soft --accent-ink --mark --ok --ok-soft --bad --monitor --shadow`), 캔버스 바탕 `#000`(`.phone canvas` 644), 예시 덧칠 `rgb(11 13 20 / 55%)`(676) → 다크 블록 두 곳(38~62·63~84) 불변.
- 움직임 줄이기: 갤러리 루프 처음부터 멈춤(6-1), `@media (prefers-reduced-motion: reduce)`(817~822)에 `.follow-card, .recipe-slots li, .chipbtn { transition: none }`.
- 접근성: `section[aria-labelledby]`·`article[aria-labelledby]`·캔버스 `role="img"`·「대본 보기」 `aria-expanded/controls`·칩 `aria-pressed`·레시피 바 `role="region"` + 들어오는 순간 `#h-recipe`(tabindex −1) 초점 + `#recipeStatus`(aria-live polite)·`#recipeProgress`(role status)·슬롯 버튼 `aria-label`·「사진 넣기」 `<label for>`·숨은 카드 `hidden`(탭 순서 제외).

### 6-10. 파일별 변경 목록(함수 단위)

| 파일 | 변경 |
|---|---|
| 새 `js/recipe.js` | `initRecipe(api)`(바 그리기·버튼·`registerPhotoSink`), `followCase(id, opts)`(묻기 → `loadCase`), `loadCase`, `placeImages`, `fillRemaining`, `trimEmpty`, `onSceneImage(scene, key)`, `refine`, `restore(saved, scenes)`, `snapshot()`, `stop()`, `renderBar/renderSlots/announce`. shorts.js 를 import 하지 않고 `api` 만 받는다(순환 import 회피, listing.js 와 같은 방식) |
| 새 `js/recipe-prompt.js` | `buildRecipePrompt`, `RECIPE_SCHEMA`, `normalizeRecipeResult`(listing-prompt.js 의 `BANNED_WORDS CAPTION_MIN/MAX tidyCaption captionLength findBannedWords ASPECT_WORDS factLines officeOf` 재사용 — 뒤 둘은 export 추가) |
| 새 `css/cases.css` · `css/recipe.css` | 6-1·6-3·6-8·6-9 의 클래스(`.follow .follow-head .follow-tools .follow-filter .chipbtn .follow-grid .follow-card .fc-io .fc-photos .fc-count .fc-out .phone.sm .monitor .fc-body .fc-chips .tag.cat .fc-no .fc-desc .fc-style .fc-script` / `.recipe .recipe-head .recipe-badge .recipe-slots(li .sample) .recipe-hint .recipe-actions .recipe-ask .style-filter .ad-badge .scene-thumb.sample`) + 760/440/reduced-motion 블록. `index.html <head>`(13)에 link 2개, `scripts/artifact-page.mjs` 의 `files` 목록에도 |
| `js/shorts.js` | import `CASE_DATA`(사례 제목)·`initRecipe`; `SETTINGS_KEYS`(2-9); `dropSamples`·`addImageFiles`(6-4); `renderScenes`; `replaceInput/pickReplacement`; `changed`(`structural` 이면 `sampleConfirm=''`, 끝에 `recipeHooks.changed?.()` — 기존 `changeHooks` 로도 됨); `renderStyleStrip/renderStripThumbs`(필터·배지); `applyStyle(st, { keepScenes })`; `exportVideo/exportAllStyles`(`sampleGate`, `visibleStyles()`); `batchLabel`; `saveProject/openProject`(6-7, `resetMedia` 분리); `api` 추가(6-2); `isSampleTitle` 사례 제목; `initShorts`(1598~1740): `initListing(api)`(1617) 다음 `initRecipe(api)`, 필터 칩 연결 |
| `js/listing.js` | `listingIO.office()`·`noteBrand()`; `applyOfficeBrand` `keepText`·`setBrand`·`cta`; `addPhotos`·`renderThumbs`·`generate` 변경 없음 |
| `js/main.js` | `currentView` follow=; `boot` `consumeFollow()`·`fillCaseCount()`; `enterMotion`(34~41) 선택자에 `.follow, .recipe` |
| `js/showcase.js` | `baseProject`(18~27) → `cases.js BASE_VISUAL`; 새 `fillFollowGallery()`(카드 DOM·필터·IO A/B·`pickActive`); `drawLoop` 한 줄; `wirePause` 두 버튼; `initShowcase`(193~212): `fillShortsCase` 다음·`revealOnScroll` 앞에 `fillFollowGallery()`; `wireCaseDots` 변경 없음 |
| `index.html` | 51 lede 문장, 53~59 칩(`data-case-count`), 62 버튼, 72 뒤 `#case-follow`, 78 `.case-label` 문구, 213 첫 자식 `#recipeBar`, 427 앞 `#styleFilter`, 세부 조절 새 select·체크박스(2-9), 엔딩 `#endingCta`, 상호 `#brandName/#brandPhone` |
| `css/style.css` | 되도록 손대지 않음(새 파일 2개). `.scene-thumb`(333~337) 덧칠은 `recipe.css` 에서 |
| `docs/STYLE-SPEC.md` · `README.md` · `CLAUDE.md` | 사례 데이터·레시피 모드 한 단락(배포 단계) |

---

## 7. 테스트 계획

전제: 정적 서버 `http://127.0.0.1:5173`(떠 있음), Playwright `require('/opt/node-tools/node_modules/playwright')`, 크로미움 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. 기준선: `scratchpad/tests/pixel-hash.cjs`(스타일마다 9:16·1:1·16:9 × 시각 `0.02 0.5 1.0 1.3` + 장면마다 `start+0.12`·`+0.3`·`+min(1.2, dur/2)`·`end−0.15` → 30 스타일 2,625 프레임 SHA-256) → `scratchpad/baseline-hashes.json`(= `baseline-hashes-2.json`, 결정적), 비교 `pixel-compare.cjs base.json new.json [허용 id,csv]`(허용 목록 밖 차이 1개라도 종료 코드 1, 새 스타일은 "새로 생김").

| # | 검사 | 명령·방법 | 합격 |
|---|---|---|---|
| T-01 | **픽셀 기준선(엔진만 고친 커밋)** | `node scratchpad/tests/pixel-hash.cjs after-engine.json` → `node scratchpad/tests/pixel-compare.cjs scratchpad/baseline-hashes.json after-engine.json`(허용 목록 **없이**) | 30 스타일 × 3 비율 2,625 프레임 **전부 동일**, 종료 코드 0. 기준선 시각에 전환 중(+0.12/+0.3)·정착·끝 프레임이 들어 있어 `overlayEnv` 분리·`drawPhoto` 이동·`trMax` 체인·`fx.dy`·`drawCaption` 가드가 모두 검증됨 |
| T-01b | 픽셀 기준선(데이터 고친 커밋) | 같은 비교에 허용 목록 = 업그레이드 10개 id(4-3) | 허용 밖 차이 0; 새 4개는 "새로 생김" |
| T-02 | 세 벌 동일 | 새 필드 (a) 없음 (b) 명시적 `photoIn:'none', photoFit:'cover', deco:[], extras:[], titleAnim:'none', brand:null, ending.cta:''` (c) 옛 스타일을 `styleProject` 로 입힌 뒤 — 해시 동일 | 3벌 모두 같음 |
| T-04 | flash | raw 0/.25/.5/.75/1 프레임 5장(정점 흰빛, 컷 뒤 1.06→1, 자막은 정점 뒤) | 눈 확인 + 예외 0 |
| T-05 | push 창 clip | band·split·card·dark·full 장면→장면·장면→엔딩에서 창 밖(제목 띠·패널·자막 칸) 픽셀이 전환 전 프레임과 같은지 영역 해시 | 같음 |
| T-06 | photoIn 정착 | 4값 × 템플릿 6 × enter 0/0.15/0.3/0.5/0.6 — 0.5 이후 프레임 해시 = photoIn 없는 프레임 | 같음 |
| T-07 | photoFit 경계 | 합성 사진 4종(1:1·3:2·3:4·9:16) × 템플릿 6 × 비율 3: `cover` 해시 = 고치기 전, `smart` 는 1.35 경계 양쪽(1.30·1.40)에서 cover/smart 갈림, blur·훅 배경·vs 변화 없음 | |
| T-10 | 전환 중 등장 | fade 0.5초 전환에서 stamp 가 `enter` 기준 0.27~0.55초에 찍히는지(local 0.1/0.3/0.5/0.7), lower3 는 두 번 찍히지 않는지 | |
| T-11 | 결정성 | bokeh·vignette 포함 프레임 두 번 렌더 해시 동일 | |
| T-14 | titleAnim | 4값 × tTitle 0/0.3/0.6/1.0/1.6 — 1.0 이후 해시 = 없는 것과 동일; 훅 배경 스타일(listing-price)에서 둘째 장면 시작에 움직임 | |
| S-1 | 스타일 시트 | `node tests/style-sheet.cjs` → `tests/out/style-sheet.png`(34개 × 2프레임), `vocab-sheet.png`, `sweepAll`(새 축 포함, `fx` 제거) 예외 0, `measurePerf` `avg ≤ 15 · max ≤ 33` | 종료 0 |
| S-1b | **전환 프레임 성능** | `tests/style-sheet.html` 에 `measureWorstPerf(styles)` 추가: 각 장면 `start + 0.1/0.25/0.4` 프레임을 재서 최대값 — card 스타일(before-after·cta-consult·lecture-paper·check-blue)의 실제 최악값 기록 | `max ≤ 33ms`; 넘으면 card 의 bokeh·vignette 금지 규칙 재확인 + 기존 위험으로 기록 |
| S-2 | 비율 시트 | `node tests/aspect-sheet.cjs` → `aspect-169.png`·`aspect-11.png`·`aspect-extra.png`(16:9·1:1 에서 lower3 자리·엔딩 CTA·push 창·stamp 모서리 눈 확인), 예외 0, 1920×1080 프레임 시간 | |
| S-3 | 자막 시트 | `node tests/caption-sheet.cjs`(12ms 규칙, select 어휘 = 엔진 어휘) | |
| D-1 | 데이터 점검 | `node tests/check-cases.mjs`(VOCAB 을 최종 목록으로: photoIn none/push/plate/reveal/pop · deco sweep/vignette/bars/bokeh · titleAnim none/slide/words/scale/mask · overlay +lower3/stamp(ribbon 삭제) · fx 삭제; stamp ≤6 권고·≤8 한도) | 문제 0 |
| D-2 | **사례 시트** | `node tests/cases-sheet.cjs`(작업 트리 파일: 사례 13개 × 4시각(훅 0.3 · previewTime · 전환 중 · 엔딩 0.8) × 그 사례의 비율 → `tests/out/cases-sheet.png` + 조각, 모든 구간 시각 예외 0) — 엔진 뒤 다시 찍어 도장·로워서드·CTA 버튼·색판이 보이는지 눈 확인 | 예외 0 |
| R-1 | `tests/regress-30.cjs` | '30개' 가정 수정: 머리 주석·(1) 제목·553 `[스타일 30·…]`·564 `안내 30가지` 문구를 `STYLES.length` 기준으로(156 `S.length < 30`·158~160 는 이미 N 기준). select 어휘 검사(165~167)가 `flash`·`push`·`lower3`·`stamp` 옵션을 요구하므로 index.html 이 먼저 바뀌어야 통과. T-12(광고 스타일 → 옛 스타일 적용 뒤 `p.extras=[]`·`photoIn==='none'`)·T-13(저장→열기 왕복에서 7개 키 + 장면 `stamp slot slot2 vsLabel` 유지) 추가 | 종료 0 |
| R-2 | `LANG=C.UTF-8 node tests/listing-flow.cjs` | (B) "예시 장면 비움"은 사례 모드가 아닐 때 규칙이라 그대로 통과해야 함. (C) 사무소 정보 → `p.brand`(name·phone·sub) → 미리보기에 lower3(브랜드 스타일일 때)·엔딩 연락 줄·`ending.cta === '전화 문의'` 확인 추가. (I) 저장 .json 에 `brand`·`cta` | 종료 0 |
| R-3 | `tests/recipe-flow.cjs`(새) | 시나리오 A(갤러리: 카드 수 = `CASE_DATA.length`, 보이는 카드 `ready`, 400ms 간격 두 캡처에서 바뀐 캔버스 ≤2, 필터 "매물" → 다른 카드 `hidden`, 「대본 보기」 토글, `#caseIdx` "/ 3" 유지, `data-case-count`) · A2(reducedMotion: 바뀌는 캔버스 0, `#followPause` pressed → 누르면 ≤2) · B(「이대로 따라하기」: `location.hash === '#shorts'`, `#recipeBar` 보임·이름, 장면 수 = 사례, 사진 장면 '예시', `#title/#endingText/#endingSub/#endingCta/#aspect/#styleMusic` 값, 스타일 카드 pressed, 초점 `#h-recipe`) · C(「사진 넣기」 2장: 진행 "2/N", 장면 1·2 썸네일 blob:, 자막·tag·stamp·duration 불변, 미리보기 가운데 픽셀 색, 남은 '예시') · C2(「남은 자리 채우기」 N/N ✓, 돌려 채움) · D(사진 > 자리: 장면 +2, cta 앞, `extraScene.caption`, hint "추가한 사진") · E(매물 상자 ① 1장 + ② 상호·연락처: 같은 자리 규칙, `#channel` = 상호, `#endingSub` = "상호 전화", `#endingText` 사례 문구 유지, `brand` 반영) · F(순서 바꾼 뒤 넣기 → 바뀐 순서의 첫 빈 자리; ✕ → n/(N−1)) · G(키 없음: `#keyBody` 펼침·초점 `#key-gemini`·문구) · G2(제미나이 모의 응답: inlineData 수 = 바뀐 사진 수, 자막·읽을 문장만 바뀜, 금지어 경고, 사례 제목이면 title 교체) · G3(「멈춤」) · H(다른 스타일 → 장면 id 집합 동일, 되돌리기) · I(예시 2장 남긴 「영상 만들기」 0.5초·720p: 첫 클릭 경고·둘째 클릭 녹화; 「전부 만들기」 같은 관문; 광고용 필터 상태의 배치 목록) · I2(첫 화면 토지 예시는 관문 없이) · J(저장 .json 에 `recipe`·`slot`·`stamp`·`vsLabel`, 키 없음 → 열기 복원) · K(`#follow=<id>` 직접 접속·`#follow=nope` 토스트·`#case-follow` 스크롤) · L(16:9 사례: `#lsAspectWarn`·`#recipeHint` 문구·칩) · M(400×800: `scrollWidth ≤ 400`, 다크 캡처, 슬롯 띠 자체 스크롤) · N(「사례 그만」 → 다시 따라하기 → 묻는 상태 → 취소/불러오기) · O(접근성 스냅샷·콘솔 오류 0). 결과 `tests/out/recipe/report.json` | 종료 0 |
| X-1 | 내보내기 실측 | 1080p 15초 매물 레시피 `exportProject` → ffprobe 프레임 수(드롭 0, 예열 효과), 파일 크기 | 30fps × 길이 ± 1 |

`tests/check-cases.mjs` 는 node 에서 돌아가므로(DOM 없음) `npm test` 급 빠른 검사로, 나머지는 Playwright. 모든 Playwright 스크립트의 `EXPECTED_404`(예시 사진 404·`/api/health`) 규칙 유지.

---

## 8. 구현 순서 · 파일 소유권 · 완료 기준

```
① 엔진(js/shorts-render.js 한 파일)  ─┐
   0절 표의 "맞추기" + 2절 사양          │ 완료 기준: T-01(허용 목록 없이 2,625 프레임 동일) · S-1 sweepAll 예외 0 · S-1b max ≤ 33
                                       ▼
② 병렬 3갈래 ───────────────────────────────────────────────────────────────────────
   ②-a 데이터·사진: styles-data.js(10 업그레이드 값 치환 + 새 4개, event-dday) · styles.js(fx 삭제) · cases-data.js(5절) · cases.js(SCENE_COPY_KEYS)
        · tests/check-cases.mjs(VOCAB) · docs/STYLE-SPEC.md(3절)                 완료: D-1 문제 0 · T-01b 허용 10개 밖 차이 0 · S-1 34개 시트 눈 확인
   ②-b 사례 화면: index.html(히어로·#case-follow) · css/cases.css · showcase.js(fillFollowGallery) · main.js(fillCaseCount)
                                                                                 완료: R-3 A·A2 · 400px 가로 스크롤 0 · 다크 캡처
   ②-c 따라하기 흐름: recipe.js · recipe-prompt.js · css/recipe.css · shorts.js(6-10) · listing.js(office/noteBrand/applyOfficeBrand) · main.js(follow=)
        · index.html(#recipeBar·#styleFilter·새 select·체크박스·#endingCta) · export.js(예열)        완료: R-3 B~O · R-1 · R-2
③ 검증: 7절 전부 + 적대적 검수(새 화면 문구·접근성·오류 경로)                       완료: 모든 표 항목 종료 코드 0, 시트 3종 눈 확인 기록
④ 배포: rsa 커밋·푸시 → ko372.com 합치기·pack·테스트·빌드·푸시 → 실제 주소 확인 → 아티팩트(scripts/artifact-page.mjs, css 2개 추가) → README·CLAUDE.md·docs 숫자(34·13)
```

파일 소유권(같은 파일을 두 갈래가 고치지 않게): `shorts-render.js` ①만 · `styles-data.js`·`styles.js`·`cases-data.js`·`cases.js`·`check-cases.mjs`·`STYLE-SPEC.md` ②-a · `showcase.js`·`cases.css` ②-b · `recipe.js`·`recipe-prompt.js`·`recipe.css`·`shorts.js`·`listing.js`·`export.js`·`tests/recipe-flow.cjs` ②-c · **`index.html`·`main.js` 는 ②-b 가 사례 화면 부분(44~165)과 `fillCaseCount` 를, ②-c 가 숏폼 화면 부분(205~690)과 `consumeFollow` 를 맡고 서로의 줄은 건드리지 않는다**(충돌 시 ②-c 가 병합). `tests/style-sheet.html`·`regress-30.cjs` 는 ①이 VOCAB·measureWorstPerf 를, ②-c 가 select 검사·T-12/13 을. ②-a 는 ①의 `PHOTO_INS…` 목록이 확정된 뒤 시작해도 되지만 값은 이 문서 4절이 이미 정했으므로 바로 시작할 수 있다(데이터만 바꾸면 D-1 은 ① 없이도 통과; 렌더 시트 D-2 는 ① 뒤).

각 작업의 "끝" 판정: ① 커밋 메시지에 T-01 결과 줄("2,625 프레임 동일") · ②-a 에 D-1 로그와 T-01b 허용 목록 · ②-b/②-c 에 R-3 report.json 요약(통과/문제 수) · ③ 에 시트 PNG 경로 3개(`style-sheet.png`·`aspect-169.png`·`cases-sheet.png`)와 S-1b 최악값.

---

## 9. 열린 질문 (사용자 확인이 필요한 것)

1. **가맹 사실 수치**: 사례 06(미스터홈즈 가맹)·새 스타일 brand-lower3 샘플이 "대한민국 최초 기업형부동산 · 100여 개 체인점 · 28년 공법 강의" 세 가지를 쓴다. 이대로 광고에 쓸 수 있는 확정 문구인지(특히 "최초"), 가맹사업법상 서면 자료 없이 말하지 않을 것(매출·수익)은 모두 뺐다.
2. **도장 문구의 허용 범위**: 사례 01 의 `급매`, 11 의 `신규 매물` 처럼 사실일 때만 맞는 말을 예시 도장으로 두었다. 따라하기 때 그대로 나갈 수 있어, 기본 도장을 더 중립적인 말(`남향`·`올수리`)로 바꿀지.
3. **05 수익률 재계산**: ② 매물 정보에 매매가·보증금·월세를 적으면 연 임대료·실투자·수익률(연 임대료 ÷ (매매가 − 보증금))을 자동으로 다시 계산해 `counter.to` 와 자막 숫자를 바꾸는 기능을 이번에 넣을지(없으면 사용자가 세부 조절에서 숫자를 고친다). `%` counter 는 정수로만 올라가므로 소수점 수익률은 자막에만.
4. **사례 수**: 설계는 12개였고 작업 트리는 행사 1개를 더해 13개다. 13개로 가는 것으로 계획을 세웠다(갤러리 "따라하기 사례 13가지"). 줄이고 싶은 사례가 있는지.
5. **플래시 컷 기본값**: field-pin·breaking-news·brand-lower3·listing-cine 가 `flash` 전환을 쓴다(0.24초, 정점 알파 0.92, 장면당 1회). 광과민 안전을 위해 정점을 0.8 로 낮출지, 특정 스타일만 flash 로 둘지.
6. **`fx:'ad'`(핀 드롭·가격 태그 팝·전/후 와이프 등 기존 장식의 미세 움직임)**: 두 심사관 모두 이번 범위에서 빼고 패치로 보관하자고 했다. 다음 단계에서 pin·price 두 개만 먼저 넣는 안에 동의하는지(before-after 의 '후' 사진 와이프는 그 다음).
