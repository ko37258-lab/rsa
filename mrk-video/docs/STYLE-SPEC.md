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
| `transition` | `fade` `slide` `zoom` `none` `wipe` `flash` `push` | wipe=사선 `highlightColor` 띠가 화면을 쓸고 지나가며 장면이 바뀜(레퍼런스 영상). **flash**=0.24초 흰 플래시(강조색 25% 섞음, 알파 0→0.9→0 sin 곡선)가 번쩍이며 정점(0.12초)에서 하드 컷(전환 중 장면은 한 장만 그림), 새 장면은 컷 뒤 0.35초 동안 1.06→1 로 살짝 줌(훅 배경 포함; 제목·장식·자막까지 함께 하얘짐. 깜빡임이 잦지 않게 장면 1.5초 이상 권장), **push**=앞 장면이 위로, 새 장면이 아래에서 올라오는 세로 밀기 — full·blur·엔딩은 화면 전체가, band·split 은 사진 칸, dark 는 썸네일, card 는 카드 둘레(40u 여유) 안에서만 밀려 제목 띠·패널·자막 칸을 덮지 않음(엔딩은 통째로 밀려 들어오며 글이 바로 보임). split 은 push 대신 slide 권장. 모르는 값은 fade |
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
| `photoIn` | `none` `push` `reveal` `pop` `iris` `plate` | 사진 등장(사진 있는 장면, 장면 앞 0.5초 — 0.5초 뒤 프레임은 없는 것과 같음). push=강조색 색판이 먼저 깔리고 사진이 칸 크기 판처럼 옆에서 밀고 들어옴(짝수 장면은 오른쪽, 홀수 장면은 왼쪽에서), reveal=앞선 강조색 세로선(10u)과 함께 왼→오로 열림, pop=0.85→1 로 톡 커지며 알파 0→1(card 는 카드 전체가), iris=칸 가운데에서 원형으로 열림(가장자리 강조색 고리), plate=색판이 사진을 덮고 있다가 왼→오로 빠지며 사진이 드러남(사진은 1.04→1 로 살짝 눌러 앉음). 등장은 장면이 보이기 시작한 때부터 센다: fade·zoom 전환에선 새 장면을 흐리게 겹치지 않고 앞 장면 위에 바로 그려(등장 자체가 전환) 효과가 가려지지 않고, flash 는 컷 시각(전환의 절반)부터, slide·push·wipe 전환에선 색판이 먼저 깔리는 push·plate 만 전환이 끝난 뒤 시작(reveal·pop·iris 는 늦추면 빈 판이 밀려 들어와 바로 시작). 훅 배경(full/blur 훅)은 어느 값이든 사진이 1.06→1 로 살짝 정착만(광고 첫 1초에 움직임). 사진 없는 장면·엔딩엔 없음. 같이 쓰지 않기: zoom+pop, wipe+plate, full+flash+push(화면 전체 강조색 뒤 흰빛). 기본 none |
| `photoFit` | `cover` `smart` | 사진 맞춤. smart=사진 비율(가로/세로)과 칸 비율이 **1.35배 이상** 어긋나면(예: 3:2 사진을 세로 full 칸(0.56)에 → 2.67배) 흐린 사진 배경(blurredOf, 칸 크기 캐시) + 25% 어둡게 위에 contain 으로 온전히 보이고 사진 둘레에 얇은 그림자(6u·10u 어긋남), 켄번스는 0.35배로 약하게. 1.35배 미만(예: 3:2 사진을 split 사진 칸(1.63)·1:1 band 칸(1.79)·dark 썸네일(1.46)에)은 cover 그대로. blur 템플릿(이미 contain)·훅 배경·vs 두 장은 제외. 기본 cover |
| `deco` | 배열: `sweep` `bars` `bokeh` `frame` `vignette` | 사진 위·자막 아래 장식(여러 개 가능, 순서는 엔진이 정함: 사진 → sweep → frame → vignette → bars). sweep=장면 0.4~1.0초에 흰 빛 띠(폭 220u, 가운데 알파 0.5, 아래가 왼쪽으로 칸 높이의 0.45 기울어짐)가 사진을 왼→오로 한 번 쓸고 지나감, bars=사진 칸(full 은 화면) 위아래 70u 레터박스 띠(`bandColor`)+안쪽 3u 강조선 — 훅 배경·글자 장면(패널)에도 그림, frame=사진 안쪽 28u 흰 액자 선(3u)이 0.6초 동안 위→오른쪽→아래→왼쪽 순서로 그려짐, vignette=가장자리를 검정 45% 로 어둡게(방사 그라데이션 캔버스 1장 캐시; full·훅 배경은 화면 전체, blur 는 흐린 배경 전체, 그 밖은 사진 칸만, 글자 장면 없음), bokeh=배경(bandColor 구역, 사진·카드·자막 아래)에 강조색 빛방울 18개(고정 시드, 반지름 40~140u, 알파 0.10~0.22)가 초당 14u 로 천천히 흐름 — full·blur 에선 사진에 가려 안 보이므로 그리지 않고 dark·band·split 에 맞음(화면 크기 캔버스 drawImage 2회). **card 템플릿은 프레임 예산(22~29ms)이 빠듯해 bokeh·vignette 를 데이터에 넣어도 그리지 않는다.** sweep·frame 은 사진 있는 장면에만. 한 스타일에 2개까지 권장. 기본 `[]` |
| `titleAnim` | `none` `rise` `mask` `stamp` `slide` `words` `scale` | titleMode=band 제목의 등장. 시계는 제목이 처음 보이는 장면(훅 배경이 아닌 첫 장면 — full/blur 훅 스타일은 둘째 장면) 시작부터 0.9초 동안만, 그 뒤는 지금 제목과 같음. rise=아래 40u 에서 떠오르며(0.5초) 0.5~0.9초에 글 블록 바로 아래 8u 에 강조색 밑줄(6u, 가장 긴 줄 폭)이 왼→오로 자라고 0.75~0.9초에 사라짐(사진 칸을 침범하지 않음), mask=왼→오로 열림(0.6초), stamp=1.3→1 로 쾅(0.35초)+알파, slide·words·scale=자막 등장(captionAnim)과 같은 움직임을 제목에(줄 밀려 들어옴·단어 떠오름·커지며 등장). 목록 밖 값은 none. hook·none 모드는 무시. 기본 none |
| `extras` | 배열: 장식 id | 주 장식(`overlay`) 위에 겹쳐 그리는 2차 장식. 새 장식 `lower3` `stamp` `ribbon`(아래 overlay 표)과 기존 장식 id. 주 장식과 같은 id 는 건너뜀. 2차 장식은 자막 상자를 **위·아래로 줄이는 조정만** 돌려줄 수 있고(adj `maxBottom`/`minTop`, 기존 장식을 넣으면 그 장식의 box 위·아래가 한계) 색·모양·정렬 조정은 주 장식만. 항상 보이는 장식(lower3·ribbon)은 전환 중 앞 장면 것을 그리지 않는다. 기본 `[]` |
| `fx` | `none` `ad` | ad=기존 장식의 미세 움직임 묶음(시계는 전환이 끝난 뒤 `local − trDur` 부터 — 그 전엔 장식 알파가 0): pin 핀이 80u 위에서 떨어져 한 번 튀고(0.45초) 라벨 칩은 0.15초 뒤 나타남 · price 태그 0.25초 1.4→1 팝 + 0.3~0.7초 빛 스윕 · counter 끝값에 닿은 뒤 0.2초 1.12→1 settle + 숫자 아래 강조색 밑줄이 0.3초에 그려져 남음 · vs 둘째 사진이 오른쪽 가장자리에서 가운데로 0.7초 와이프(흰 경계선)되고 `scene.labelA/labelB` 칩이 각 사진 왼쪽 아래(오른쪽 칩은 0.5초 뒤) · dots 현재 점 0.3초 1.5→1 · steps 진행 점이 왼쪽부터 0.1초 간격으로 채워짐 · quote 따옴표 0.3초 1.6→1 팝 · news 첫 장면에서 띠가 아래서 0.35초 올라오고 '속보' 칩이 0.5초 주기로 깜빡(알파 1↔0.7), 띠 오른쪽 위에 `brand.phone`. 끝난 뒤 모양은 fx 없는 것과 같다(counter 밑줄·news 연락처 제외). 기본 none |
| `brand` | `{ name, phone, sub }` | 상호·연락처(선택). lower3 와 엔딩 CTA 연락처 줄, news(fx ad)가 읽는다. 없으면 `channel` 만 쓴다 |
| `ending.cta` | 버튼 문구 | 있을 때만 엔딩 부제 아래 110u 에 강조색 알약 버튼(높이 112u, 글 48u·넘치면 줄임, 0.3초 뒤 0.4초 동안 0.6→1 로 살짝 넘치며 등장(easeOutBack), 0.9초부터 1.2초 주기 ±3% 맥동, 0.8~1.3초 빛 스윕 1회, 아래 6u 어두운 알약으로 눌림 느낌) + 그 아래 100u 에 `brand.phone` 연락처 줄(`ending.sub` 에 같은 번호가 있으면 생략, 버튼과 같은 알파). text·sub·로고는 그대로. 엔딩 2.5초 이상 권장(1초면 맥동 전에 끝남). 기본 `''` |

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
| `lower3` | 로워서드 바(광고용, 2차 장식 `extras` 로도): 강조색 세로 막대 12u + 둥근 바(r 8u). 1줄 `brand.name`(없으면 `channel`, 36u/800), 2줄 `brand.phone`(없으면 `brand.sub`, 28u/600; 없으면 72u 한 줄 바), 폭은 글 폭+64u(240u~0.6W, 넘치면 글자 0.75배까지 줄이고 뒤를 …). 자리는 **템플릿으로만** 정해져 장면(사진·글자)이 바뀌어도 움직이지 않는다 — band·blur·split·card 는 사진 칸 왼쪽 아래(글자 장면도 같은 칸: 도면 패널·패널색·카드 안 패널 위, card 는 카드처럼 −2° 기울임) · full·dark 는 화면 왼쪽 아래(진행 막대·티커·경고 테이프·dots 위로 올림). 사진·패널·어두운 면 위는 검정 72% 바 + 흰 글, 밝은 면(split 글자 장면의 밝은 `panelColor`, full·dark 의 밝은 `bandColor`)은 흰 94% 바 + `inkColor` 글. 글자 장면·훅 배경·full·dark 에선 자막 상자 아래 한계를 바 위 16u 로 올린다(1:1 full 은 자막 칸이 237u, 16:9 dark 는 1줄로 줄어드니 피하거나 자막을 짧게). 영상 시작 0.35초 동안 왼쪽에서 밀려 들어온 뒤 고정(PERSISTENT). 상호·연락처가 모두 비면 그리지 않음 |
| `stamp` | 도장 배지(`scene.stamp` 가 있을 때만, 8자까지·6자 권장): 강조색 글(900, 52u) + 둥근 사각 이중 테두리(바깥 6u·안 2u, r 12u), −10° 기울임. 시계는 전환이 끝난 뒤(`local − trDur`) 0.05초 뒤부터 0.22초 동안 1.6→1 로 "찍힘"(ease-in, 알파 0.08초) — 전환 앞 절반은 장식 알파가 0 이라 그 전엔 그리지 않음. 자리: 사진 칸(훅 배경은 화면) 오른쪽 위(`price`·`ticker` 장식이나 `ribbon` 이 오른쪽을 쓰면 왼쪽 위), 사진 없는 장면은 글자 상자 오른쪽 위, 폭이 칸의 45% 를 넘으면 글자를 0.9배씩 줄임 — 비율 공통. 뒷판: 사진·훅 배경 위는 검정 35%, 그 밖은 강조색이 어두울 때만 흰 88% |
| `ribbon` | 대각선 리본(`scene.tag` 가 있을 때만): 사진 칸 오른쪽 위 모서리를 45° 로 가로지르는 강조색 띠(폭 60u, 모서리에서 110u, 칸 밖은 잘라냄)에 글(26u/800, 안 들어가면 18u 까지 줄이고 …). 장면이 바뀌어도 자리는 그대로(PERSISTENT), 글만 바뀜. card 는 카드처럼 −2° 기울임. 사진 없는 장면은 글자 패널 모서리(dark 는 화면 모서리), 훅 배경은 화면 모서리 |

### 장면 추가 필드 (`scene.*`)

`kind` (`hook` `normal` `answer` `cta`), `label`, `tag`, `img2`, `counter{from,to,suffix}`, `stamp`(도장 글, 6자 권장·10자까지 — `stamp` 장식), `labelA`/`labelB`(vs 좌우 라벨 칩, `fx:'ad'` 일 때). 모두 선택 사항. `hook` 장면은 사진이 있어도 자막을 1.4배로 키우고 배경을 `highlightColor`→`bandColor` 그라데이션으로 깔아 "훅"처럼 보이게 한다.

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

### 광고용 추천 표시와 광고 업그레이드 어휘 (2026-11)

광고(매물·브랜드·강의·상담·후기·행사)에 맞는 스타일은 `ad: true` 와 용도 목록 `adFor` 를 가진다. 스타일 패널의 "광고용 추천" 필터와 따라하기 사례(`js/cases-data.js`)가 읽고,
`styles.js` 의 `makeStyle` 이 `...data` 로 펼치므로 `style.ad` 로 바로 읽힌다. `VISUAL_KEYS` 밖이라 프로젝트에 입혀지지는 않는다.

```js
{
  id: 'listing-price',
  // … name·tagline·ref·platforms·hook·beats 는 위와 같음
  visual: {
    aspect: '9:16', template: 'full', captionAnim: 'none', captionStyle: 'pill', overlay: 'price', transition: 'fade', motion: 'auto', titleMode: 'band',
    bandColor: '#1c1a17', panelColor: '#ffffff', textColor: '#ffffff', inkColor: '#1d1d1d', highlightColor: '#c9a227', font: '700', captionSize: 64, showProgress: false,
    // ── 광고 업그레이드 어휘(모두 선택, 없으면 '없음' = 기존 모양 그대로) ──
    photoIn: 'push',             // 사진 등장: none | push(강조색 색판이 깔리고 사진이 밀고 들어옴) | reveal(왼→오 리빌) | pop(톡 튀어나옴) | iris(원형 열림)
    photoFit: 'smart',           // cover(기본) | smart = 가로 사진이 세로 칸에 들어갈 때 흐린 배경 위 contain(blur 템플릿은 이미 contain 이라 쓰지 않음)
    deco: ['sweep'],             // 사진 위 장식 레이어(배열): sweep 빛 스윕 · bars 레터박스 바 · bokeh 보케(배경층) · frame 액자 선
    titleAnim: 'rise',           // 제목 등장(titleMode band 일 때만): none | rise | mask | stamp
    extras: ['stamp', 'lower3'], // 주 장식(overlay) 위에 겹쳐 그리는 2차 장식: lower3 로워서드 바(brand.name/phone) · stamp 도장(scene.stamp) · ribbon 리본(scene.tag) · 기존 장식 id
    fx: 'ad',                    // none | ad = 기존 장식의 미세 움직임(핀 드롭·가격 태그 팝·숫자 settle·vs 와이프·점 커짐·속보 띠 등장)
    // transition 에는 기존 5 종 외에 'flash'(흰 플래시 컷)·'push'(밀기)도 쓸 수 있다
  },
  sample: { title: '*역세권* 신축 상가\n매물 소개', scenes: [
    { caption: '이 가격에 이 *위치*?', img: 's04-city-commercial', kind: 'hook', duration: 2.6, tag: '3.2억', stamp: '신축' },   // stamp(≤6자) = 도장 글
    // 비포애프터(vs)는 labelA/labelB 로 좌우 라벨: { caption: '…', img: 'v01-villa-before', img2: 'v02-villa-after', labelA: '전', labelB: '후' }
  ] },
  music: 'lofi', prompt: '…',
  ad: true, adFor: ['listing'],  // 용도 id: listing 매물 · brand 브랜드/가맹 · course 강의 · consult 상담 · proof 후기/성과 · event 행사
}
```

새 장식 세 가지는 `overlay` 에 주 장식으로도 쓸 수 있다(새 광고 스타일 `brand-lower3`=lower3, `listing-cine`·`review-stamp`=stamp, `event-ribbon`=ribbon).
엔딩 CTA 버튼 문구(`p.ending.cta`)와 상호·연락처(`p.brand = { name, phone, sub }`)는 **스타일(visual)이 아니라** 따라하기 사례(`js/cases.js` 의 `caseToProject`)나 매물 상자가 프로젝트에 싣는 값이다.

규칙
- 모든 스타일은 `template × captionAnim × overlay` 조합이 서로 겹치지 않아야 한다(최소 overlay 는 모두 다르거나, 같다면 template 이 달라야 함). 새 장식(lower3·stamp·ribbon)을 쓰는 스타일은 자동으로 만족한다.
- `music` 은 `js/music.js` 의 `MOODS` id 하나(10가지 분위기가 모두 최소 한 번 쓰이게). `js/styles.js` 의 `makeStyle` 은 데이터를 그대로 펼치므로(`...data`) `style.music` 으로 읽히고, `VISUAL_KEYS` 에는 없어 `apply(p)` 가 프로젝트에 입히지는 않는다(소리 패널이 `style.music` 을 기본값으로 쓰면 된다).
- 색은 모두 hex. 밝은 배경(`bandColor`/`panelColor` 가 밝음)이면 `inkColor` 로 읽히게.
- 샘플 자막은 MR.K(부동산 공법·토지·매물·부동산 AI) 소재, 한 장면 35자 이내, `*강조*` 한 개씩. 그 스타일의 장식이 읽는 장면 필드(price·date·ribbon → `tag`, pin → `label`, counter → `counter`, vs → `img2`(+`labelA/labelB`), stamp → `stamp`)를 샘플에 채운다. `tag` 는 7자, `stamp` 는 6자 이내.
- 광고 업그레이드 어휘 값은 위 목록 안에서만(`photoIn` none/push/reveal/pop/iris · `photoFit` cover/smart · `deco` sweep/bars/bokeh/frame · `titleAnim` none/rise/mask/stamp · `fx` none/ad · `extras` 장식 id). 과장·단정 표현(`js/listing-prompt.js` `BANNED_WORDS`)은 샘플에 쓰지 않는다.
- `ref.search` 는 한국어 유튜브 검색어.
- 스타일 수는 화면에 적지 않는다(`index.html` 의 `data-style-count` 자리표시가 `STYLES.length` 로 채움). 데이터·사례 점검은 `node tests/check-cases.mjs`, 사례 렌더 시트는 `node tests/cases-sheet.cjs`.

## 3. 엔진이 지켜야 할 것
- `drawFrame(ctx, p, W, H, t, tl, logo)` 시그니처 유지. 모든 크기는 1080 기준 × `u`.
- 기존 프로젝트(필드 없음)도 그대로 렌더: 없는 필드는 `template:'band'`, `captionAnim:'none'`, `overlay:'none'`, `titleMode:'band'`, `inkColor:'#111'` 로 본다.
- 미리보기(540px)와 내보내기(1080/720)가 같은 함수. 성능: 1080×1920 30fps 로 그릴 수 있어야 한다(장면당 그리기 비용 큰 것은 캐시).
- **가로(16:9)·정사각(1:1) 규칙** — 30개 스타일은 9:16 기준 데이터 그대로 쓰고, 엔진이 화면 비율에 맞춰 배치만 바꾼다(스타일 데이터에 가로 전용 값을 넣지 않는다). 폭이 높이의 1.3배 이상이면 `layoutWide()` 가 영역을 따로 나눈다: 제목 띠는 높이의 16.5%(제목 없는 모드는 10%)로 얇게 하고 제목 줄바꿈은 한 줄로 이어 쓰며, **split** 은 왼쪽 54% 사진·오른쪽 `panelColor` 글 패널(자막 세로 가운데), **card** 는 카드를 왼쪽·자막을 오른쪽 칸(왼쪽 정렬, 1.3배)에 두고 사진 없는 글자 장면은 카드를 가운데 넓게(카운터·댓글 장식은 오른쪽 칸을 쓰므로 왼쪽 카드 그대로), **dark** 는 썸네일을 16:9 비율로, **band·blur** 는 아래 자막 칸을 높이의 25%(댓글 장식이면 36%)로, **full** 은 자막 좌우 여백을 넓게 잡는다. 사진 없는 글자 장면 자막은 1.2배, 엔딩 문구는 1.4배. 장식은 가로에서 news 띠를 높이의 24%로 낮추고, comment 말풍선은 폭 1300u 가운데(좁은 오른쪽 칸이면 그 칸), dots 는 split 의 오른쪽 패널 가운데, counter 는 split·dark 글자 장면에서 숫자를 글 칸 위·자막을 아래에 둔다. 가로·정사각 공통으로 글자 장면·훅 배경 장면의 pin 은 글 위로 올리고 자막을 그 아래로, card 글자 장면의 check 칩 아래로 자막을 내리며, 낮은 자막 칸의 quote 는 위아래를 덜 줄인다. **9:16 결과는 한 픽셀도 바뀌지 않아야 한다** — 고친 뒤 `node tests/style-sheet.cjs` 시트를 고치기 전 것과 픽셀 비교하고, `node tests/aspect-sheet.cjs`(→ `tests/out/aspect-169.png`·`aspect-11.png`·`aspect-extra.png`, 예외 0, 1920×1080 프레임 시간)로 가로·정사각을 눈으로 확인한다.
- 글꼴은 `"Pretendard Variable", Pretendard, sans-serif` 만. `fontCss(weight, px)`.
- `buildSrt`, `buildTimeline`, `plainText`, `parseRuns`, `dims`, `ensureFonts` 유지.
- 자막 어휘 목록은 엔진이 `CAPTION_STYLES`(모양 12종)·`CAPTION_ANIMS`(등장 10종)로 내보낸다. 화면의 `#captionStyle`·`#captionAnim` select 와 점검 시트(`tests/caption-sheet.cjs` → `tests/out/caption-sheet.png`)는 이 목록을 기준으로 한다. 자막 모양은 1080×1920 평균 12ms 안에 그려야 하므로 shadowBlur·filter 를 쓰지 않고, 그라데이션·패스는 줄 단위로만 만든다.
- `js/styles.js` 는 `STYLE_DATA` 를 읽어 `STYLES` (각 항목에 `apply(p)` → p 에 visual 을 입히고 돌려줌)와 `styleProject(base, style)` 를 내보낸다. `apply` 는 장면을 바꾸지 않는다(시각 설정만). `VISUAL_KEYS` 의 광고용 어휘(`photoIn photoFit deco titleAnim extras fx`)는 스타일에 없으면 '없음' 값(`none`/`cover`/`[]`)으로 채워 입히므로, 광고 스타일 뒤에 다른 스타일을 입혀도 로워서드·사진 등장이 남지 않는다. 배열 값(deco·extras)은 복사해서 입힌다.
- **광고용 모션 어휘의 원칙** — 새 필드(`photoIn photoFit deco titleAnim extras fx brand ending.cta`, 장면 `stamp labelA labelB`)는 없거나 `'none'`/`[]`/`''` 이면 **기존 코드 경로를 바꾸지 않는다**: `RENDER_DEFAULTS` 에 넣지 않고 사용처에서 `on(v)`(없음·'none' 이면 꺼짐) 게이트로만 읽는다. 고친 뒤에는 픽셀 기준선(`scratchpad/tests/pixel-hash.cjs` → `pixel-compare.cjs`: 스타일마다 자기 예시 장면을 9:16·1:1·16:9 로 여러 시각에 그린 SHA-256)과 비교해 광고용 어휘를 쓰지 않는 스타일·옛 프로젝트의 해시가 모두 같아야 한다.
- 모든 등장 효과는 장면이 보이기 시작한 뒤 1.2초 안에 끝난다(`previewTime` 의 +1.4초 썸네일·사례 벽이 정착된 모양이 되게): 사진 등장 0.5초, 도장 0.27초, 로워서드 0.35초(영상 시작), 제목 0.9초(제목이 처음 보이는 장면 기준), fx 는 최대 0.7초(vs 와이프). 장면 소속 장식의 움직임(fx·도장)은 `e.fxLocal`(전환이 끝난 뒤 `local − trDur` 부터 센 시각 — 전환 앞 절반은 장식 알파가 0 이라 그 전에 움직이면 보이지 않음)로, 사진 등장은 `photoInOf`(fade·zoom 은 바로, flash 는 컷 뒤, slide·push·wipe 의 색판은 전환 뒤)로 시계를 맞춘다. 난수·현재 시각 금지(bokeh 점 자리는 고정 시드).
- 2차 장식(`extras`)은 자막 조정값으로 상자 축소(`maxBottom`·`minTop`)만 돌려주고, `drawCaption` 이 주 장식의 `box` 를 적용한 뒤 상자가 그 한계와 **겹칠 때만** 자른다(최소 높이 60u — 상자가 통째로 바 아래·위에 있으면 건드리지 않음). 색·모양·정렬 조정은 주 장식만. 새 장식 셋은 `OVERLAYS` 에도 있어 주 장식으로도 쓰고, 점검 시트의 overlay 축에 자동으로 들어간다.
- 성능: 새 어휘는 shadowBlur·filter 없이 그라데이션·패스를 줄 단위로만 쓰고, 무거운 그림(보케·비네트)은 `patternCache` 와 분리한 `fxCache`(32장, 키에 시간·알파 금지)에, 흐린 배경은 `blurredOf()`(반올림한 칸 크기)에 한 장씩 두고 drawImage 한다. 글 폭(로워서드·도장·CTA)은 캐시하지 않는다(글꼴을 받기 전 폭이 남지 않게). 상시 비용 1ms 이상은 `photoFit:'smart'`(≈1.5ms)·`vignette`(≈1ms)·`bokeh`(≈2~3ms) — card 템플릿(지금 22~29ms)에는 smart 만 권장. 새 어휘를 모두 켠 조합도 1080×1920 프레임당 20ms 안(`node tests/motion-sheet.cjs` 가 템플릿별 전부 켠 조합의 전체 평균·장면 앞 0.6초 평균을 잰다). 내보내기 전에 장면마다 한 프레임씩 미리 그려 두면(예열) 흐림 캔버스 첫 생성(15~25ms)으로 첫 프레임이 빠지지 않는다.
- 어휘 목록은 엔진이 `PHOTO_INS`·`PHOTO_FITS`·`DECOS`·`TITLE_ANIMS`·`TRANSITIONS`·`FX_MODES`·`EXTRA_OVERLAYS` 로 내보낸다. 화면 select 와 점검 시트(`tests/style-sheet.html` 의 `VOCAB`, 조합 예외 점검 `sweepAll` 이 광고용 어휘를 돌아가며 켬)는 이 목록을 쓴다. 광고용 어휘 눈 검수 시트는 `node tests/motion-sheet.cjs` → `tests/out/motion-sheet.png`(사진 등장·장식·2차 장식 × 템플릿 × 비율·제목 등장·전환·엔딩 CTA·사진 맞춤·fx 를 매물 광고 장면으로).
