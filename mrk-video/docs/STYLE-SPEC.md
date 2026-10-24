# 쇼츠 스타일 사양 (렌더 엔진 어휘 + 스타일 데이터 형식)

"잘 나가는 쇼츠 형식 30가지"를 **스타일 모델**로 넣어 두고, 사용자가 만든 장면(사진+자막)을 어떤 스타일로든 바꿔 렌더링한다.
스타일은 데이터(`js/styles-data.js`)이고, 렌더 엔진(`js/shorts-render.js`)은 아래 어휘만 이해하면 된다.

## 1. 프로젝트 시각 필드 (`p.*`) — 렌더 엔진이 읽는 값

| 필드 | 값 | 뜻 |
|---|---|---|
| `aspect` | `9:16` `1:1` `16:9` | 화면 비율 |
| `template` | `band` `blur` `full` `split` `card` `dark` | 레이아웃. band=위 제목·가운데 사진·아래 자막(기존), blur=흐린 배경+사진 contain(기존), full=사진 꽉+위아래 그라데이션(기존), **split**=위 55% 사진·아래 45% 단색 패널(`panelColor`)에 큰 자막 왼쪽 정렬, **card**=배경 `bandColor`(+옅은 도트 격자)·사진은 흰 테두리 카드(살짝 기울기 -2°)·자막은 카드 아래, **dark**=배경 `bandColor`에 자막을 아주 크게(사진이 있으면 위쪽 둥근 사각 썸네일로 작게) |
| `captionAnim` | `none` `words` `karaoke` `type` `pop` `bounce` `scale` `slide` `wave` `flash` | 자막 등장. none=장면 시작에 통째로(기존 페이드), words=단어가 순서대로 아래에서 떠오름(장면 길이 앞 60% 안에 분배), karaoke=문장은 흐리게 깔리고 읽는 단어가 `highlightColor`로 채워지며 살짝 커짐(모션 스킬 가라오케), type=한 글자씩 타자기, pop=한 번에 1~2단어만 크게 튀어나오며(scale 1.35→1) 교체되는 틱톡식, **bounce**=단어가 위에서 떨어져 바닥에서 한 번 튀며 자리 잡음(easeOutBounce, 장면 앞 55% 안에 단어 분배), **scale**=자막 전체가 0.6→1.0 으로 커지며 알파 0→1(0.35초) 뒤 정지, **slide**=줄 단위로 왼쪽 화면 밖에서 미끄러져 들어옴(줄마다 0.12초 지연, easeOut; 줄 배경·칩·패널도 함께 움직이거나 패널 안에서 나타남), **wave**=단어가 순서대로 살짝 위아래로 물결치며 계속 움직임(진폭 글자 크기의 0.06, 주기 1.6초, 등장은 0.4초 알파 페이드), **flash**=읽는 단어(karaoke 와 같은 시간 분배)가 `highlightColor`로 0.1초 간격 깜빡임(알파 1↔0.55), 나머지 단어는 평소대로(본문색, `*강조*`는 강조색). 모르는 값은 none |
| `captionStyle` | `outline` `box` `plain` `pill` `neon` `shadow3d` `marker` `glass` `tag` `underline` `gradient` `bubble` | 자막 모양. 모두 배경 밝기(`captionLook`)에 따라 글자색·테두리를 자동으로 고른다. outline=글자 테두리(밝은 글자엔 검정, 어두운 글자엔 흰색), box=줄마다 검은 반투명 띠, plain=글자만(밝은 글자엔 살짝 어긋난 그림자), pill=`highlightColor` 둥근 배경 + `inkColor` 글자. **neon**=흰 글자(밝은 배경에선 `inkColor`) 둘레에 넓은 반투명 `highlightColor` 스트로크 2겹 빛무리(shadowBlur 없음, 사진 위에서는 가는 검은 테두리 한 겹 추가), **shadow3d**=오른쪽 아래로 4단 쌓인 단색 그림자 블록(총 글자 크기의 0.1; 밝은 글자엔 `inkColor`/검정, 어두운 글자엔 `highlightColor`) + 본문색 글자, **marker**=줄마다 살짝 기울어진(±0.7°) `highlightColor` 형광펜 띠(줄 높이의 0.7) + 띠 밝기에 맞춘 `inkColor`/`textColor` 글자(강조 단어도 같은 색), **glass**=줄 블록 뒤에 반투명 흰 둥근 패널(알파 0.22, 흰 테두리 1.5px) + 흰 글자(얇은 검정 그림자); 밝은 배경에선 어두운 반투명 패널 + `inkColor` 글자, **tag**=단어마다 둥근 칩(본문 단어는 어두운 반투명, `*강조*` 단어는 `highlightColor`), 칩 안 글자색은 칩 밝기에 맞춤, 줄 간격 1.5·띄어쓰기 2.3배로 칩 사이 틈, **underline**=plain 글자 + 줄 아래 `highlightColor` 굵은 밑줄(강조 단어 구간은 두 배 두껍게), **gradient**=글자 채움을 세로 그라데이션(본문색→`highlightColor`, 줄마다 createLinearGradient 1회) + 얇은 검정 테두리, 강조 단어는 `highlightColor` 단색, **bubble**=자막 블록을 흰 말풍선(둥근 사각 + 왼쪽 아래 꼬리 + 옅은 그림자)에 담고 `inkColor` 글자(밝은 강조색은 `inkColor`로). overlay=`comment`(댓글 말풍선)일 때 bubble 은 plain 으로 내려간다. glass·bubble·tag 는 패널·칩이 상자 밖으로 나가지 않게 글자 영역을 안쪽으로 들인다(자동 축소·maxLines 는 그대로). 모르는 값은 outline |
| `overlay` | 아래 표 | 장식 레이어(스타일의 개성). 한 스타일에 하나 |
| `transition` | `fade` `slide` `zoom` `none` `wipe` | wipe=사선 `highlightColor` 띠가 화면을 쓸고 지나가며 장면이 바뀜(레퍼런스 영상) |
| `motion` | `auto` `in` `out` `none` | 사진 움직임(기존) |
| `titleMode` | `band` `hook` `none` | band=제목이 항상 위에(기존), hook=첫 장면 1.2초 동안만 큰 제목이 전체 화면을 덮고 사라짐, none=제목 없음 |
| `bandColor` | 색 | 배경색 |
| `panelColor` | 색 | split 패널·card 배경 등 2차 면 |
| `textColor` | 색 | 자막·제목 글자색(어두운 배경용) |
| `inkColor` | 색 | 밝은 배경 위 글자색(기본 `#111111`) — split/card/dark 가 밝은 색이면 이 색을 쓴다 |
| `highlightColor` | 색 | 강조색(`*별표*` 단어, 진행 막대, 와이프) |
| `font` | `'700'` `'800'` `'900'` | Pretendard 굵기(글꼴은 Pretendard Variable 하나만 쓴다) |
| `captionSize` | 40~110 | 1080px 기준 자막 크기 |
| `showProgress` | bool | 하단 진행 막대 |
| `channel`, `title`, `ending`, `logo` | 기존 | |

### overlay 종류

| 값 | 그리는 것 |
|---|---|
| `none` | 없음 |
| `news` | 위 왼쪽 빨간(`highlightColor`) "속보" 라벨 + 아래 흰 밴드 안에 자막(뉴스 하단 자막 띠), 밴드 왼쪽에 `channel` 작은 글씨 |
| `warning` | 위·아래 노랑-검정 사선 경고 테이프 + "주의" 라벨 |
| `steps` | 위 `STEP 01 / 05` + 진행 점(모션 스킬 헤더). 사진 없는 글자 장면은 큰 번호를 왼쪽에 |
| `number` | 장면 번호 원형 배지(크게, `highlightColor`), 사진 장면은 왼쪽 위, 글자 장면은 가운데 위 |
| `check` | 장면이 지날수록 ✓ 칩이 왼쪽 위에 누적(이전 장면 자막의 첫 6~10자). 레퍼런스의 "서류 칩" |
| `pin` | 사진 위 지도 핀 아이콘 + `scene.label`(없으면 자막 첫 단어) 라벨 칩 |
| `price` | 사진 오른쪽 위 가격 태그(`scene.tag`, 없으면 숨김) |
| `quote` | 큰 따옴표 장식 + 자막 아래 `— channel` |
| `quiz` | kind=`hook`/첫 장면에 `Q.` 라벨 + 3·2·1 카운트다운 원(마지막 1초), kind=`answer` 장면에 초록 `A.` 라벨 |
| `ticker` | 아래 흐르는 글줄(제목을 반복) + 위 오른쪽 오늘 날짜(렌더 시점 `new Date()` 금지 → `p.dateLabel` 사용, 없으면 숨김) |
| `date` | 위 큰 날짜/연도 라벨(`scene.tag`) |
| `comment` | 자막을 댓글 말풍선처럼: 아바타 원(`channel` 첫 글자) + 닉네임 + 문장 |
| `vs` | 사진 두 장(`scene.img`, `scene.img2`) 좌우 비교 + 가운데 `VS`(또는 `→`) 원. img2 없으면 한 장 |
| `counter` | `scene.counter = {from,to,suffix}` 숫자가 장면 동안 커지는 아주 큰 글씨(자막은 그 아래 작게) |
| `dots` | 아래 장면 수만큼 점 진행 + `3 / 6` 글자 |

### 장면 추가 필드 (`scene.*`)

`kind` (`hook` `normal` `answer` `cta`), `label`, `tag`, `img2`, `counter{from,to,suffix}`. 모두 선택 사항. `hook` 장면은 사진이 있어도 자막을 1.4배로 키우고 배경을 `highlightColor`→`bandColor` 그라데이션으로 깔아 "훅"처럼 보이게 한다.

## 2. 스타일 데이터 형식 (`js/styles-data.js`)

```js
export const STYLE_DATA = [{
  id: 'lecture-paper',                      // 영문 소문자-하이픈, 고유
  name: '강의형 — 공법의 신',                 // 12자 안팎
  tagline: '종이 배경에 초록 강조, 한 문장씩 밑줄',  // 한 줄
  ref: {
    format: '지식 강의 숏츠',                 // 참고한 바이럴 형식 이름
    why: '한 문장 핵심 + 가라오케 자막이 끝까지 보게 만든다',  // 왜 잘 되는지 한 줄
    search: '부동산 공법 쇼츠 강의',          // 유튜브에서 비슷한 영상을 찾는 검색어
  },
  platforms: ['youtube', 'instagram', 'tiktok', 'facebook', 'threads'],  // 잘 맞는 플랫폼
  hook: '손해 경고로 시작',                   // 첫 장면 훅 방식
  beats: ['훅: ~하면 손해봅니다', '원칙 1', '원칙 2', '원칙 3', '요약 + 구독'],  // 대본 뼈대(장면 순서)
  visual: { aspect: '9:16', template: 'card', captionAnim: 'karaoke', captionStyle: 'plain', overlay: 'steps',
            bandColor: '#e9e7e2', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#111111', highlightColor: '#1fcf62',
            font: '900', captionSize: 64, motion: 'in', transition: 'fade', titleMode: 'band', showProgress: true },
  sample: {                                   // 갤러리 미리보기·사례용. 이미지는 assets/samples 의 id
    title: '공법의 신이 알려주는\n*토지투자* 3원칙',
    scenes: [
      { caption: '이거 모르고 땅 사면\n*손해*봅니다', img: 's01-land-zoning', kind: 'hook', duration: 2.4 },
      { caption: '*용도지역*부터 확인', img: 's01-land-zoning', duration: 3 },
    ],
  },
  music: 'calm',                              // 배경 음악 분위기 — js/music.js 의 MOODS id 하나(upbeat news calm lofi corporate drama quiz warning epic playful)
  prompt: '강의형: 첫 장면은 손해 경고, 이어서 원칙 3개를 한 문장씩, 마지막은 한 줄 요약. 각 장면 자막 35자 이내.',  // AI 대본에 덧붙일 지시
}];
```

규칙
- 30개 스타일은 `template × captionAnim × overlay` 조합이 서로 겹치지 않아야 한다(최소 overlay 는 모두 다르거나, 같다면 template 이 달라야 함).
- `music` 은 `js/music.js` 의 `MOODS` id 하나(10가지 분위기가 모두 최소 한 번 쓰이게). `js/styles.js` 의 `makeStyle` 은 데이터를 그대로 펼치므로(`...data`) `style.music` 으로 읽히고, `VISUAL_KEYS` 에는 없어 `apply(p)` 가 프로젝트에 입히지는 않는다(소리 패널이 `style.music` 을 기본값으로 쓰면 된다).
- 색은 모두 hex. 밝은 배경(`bandColor`/`panelColor` 가 밝음)이면 `inkColor` 로 읽히게.
- 샘플 자막은 MR.K(부동산 공법·토지·매물·부동산 AI) 소재, 한 장면 35자 이내, `*강조*` 한 개씩.
- `ref.search` 는 한국어 유튜브 검색어.

## 3. 엔진이 지켜야 할 것
- `drawFrame(ctx, p, W, H, t, tl, logo)` 시그니처 유지. 모든 크기는 1080 기준 × `u`.
- 기존 프로젝트(필드 없음)도 그대로 렌더: 없는 필드는 `template:'band'`, `captionAnim:'none'`, `overlay:'none'`, `titleMode:'band'`, `inkColor:'#111'` 로 본다.
- 미리보기(540px)와 내보내기(1080/720)가 같은 함수. 성능: 1080×1920 30fps 로 그릴 수 있어야 한다(장면당 그리기 비용 큰 것은 캐시).
- **가로(16:9)·정사각(1:1) 규칙** — 30개 스타일은 9:16 기준 데이터 그대로 쓰고, 엔진이 화면 비율에 맞춰 배치만 바꾼다(스타일 데이터에 가로 전용 값을 넣지 않는다). 폭이 높이의 1.3배 이상이면 `layoutWide()` 가 영역을 따로 나눈다: 제목 띠는 높이의 16.5%(제목 없는 모드는 10%)로 얇게 하고 제목 줄바꿈은 한 줄로 이어 쓰며, **split** 은 왼쪽 54% 사진·오른쪽 `panelColor` 글 패널(자막 세로 가운데), **card** 는 카드를 왼쪽·자막을 오른쪽 칸(왼쪽 정렬, 1.3배)에 두고 사진 없는 글자 장면은 카드를 가운데 넓게(카운터·댓글 장식은 오른쪽 칸을 쓰므로 왼쪽 카드 그대로), **dark** 는 썸네일을 16:9 비율로, **band·blur** 는 아래 자막 칸을 높이의 25%(댓글 장식이면 36%)로, **full** 은 자막 좌우 여백을 넓게 잡는다. 사진 없는 글자 장면 자막은 1.2배, 엔딩 문구는 1.4배. 장식은 가로에서 news 띠를 높이의 24%로 낮추고, comment 말풍선은 폭 1300u 가운데(좁은 오른쪽 칸이면 그 칸), dots 는 split 의 오른쪽 패널 가운데, counter 는 split·dark 글자 장면에서 숫자를 글 칸 위·자막을 아래에 둔다. 가로·정사각 공통으로 글자 장면·훅 배경 장면의 pin 은 글 위로 올리고 자막을 그 아래로, card 글자 장면의 check 칩 아래로 자막을 내리며, 낮은 자막 칸의 quote 는 위아래를 덜 줄인다. **9:16 결과는 한 픽셀도 바뀌지 않아야 한다** — 고친 뒤 `node tests/style-sheet.cjs` 시트를 고치기 전 것과 픽셀 비교하고, `node tests/aspect-sheet.cjs`(→ `tests/out/aspect-169.png`·`aspect-11.png`·`aspect-extra.png`, 예외 0, 1920×1080 프레임 시간)로 가로·정사각을 눈으로 확인한다.
- 글꼴은 `"Pretendard Variable", Pretendard, sans-serif` 만. `fontCss(weight, px)`.
- `buildSrt`, `buildTimeline`, `plainText`, `parseRuns`, `dims`, `ensureFonts` 유지.
- 자막 어휘 목록은 엔진이 `CAPTION_STYLES`(모양 12종)·`CAPTION_ANIMS`(등장 10종)로 내보낸다. 화면의 `#captionStyle`·`#captionAnim` select 와 점검 시트(`tests/caption-sheet.cjs` → `tests/out/caption-sheet.png`)는 이 목록을 기준으로 한다. 자막 모양은 1080×1920 평균 12ms 안에 그려야 하므로 shadowBlur·filter 를 쓰지 않고, 그라데이션·패스는 줄 단위로만 만든다.
- `js/styles.js` 는 `STYLE_DATA` 를 읽어 `STYLES` (각 항목에 `apply(p)` → p 에 visual 을 입히고 돌려줌)와 `styleProject(base, style)` 를 내보낸다. `apply` 는 장면을 바꾸지 않는다(시각 설정만).
