# MR.K 영상만들기 — 작업 규칙

사용자: 고상철 대표(MR.K, 미스터홈즈 FC). 부동산공법 강사·유튜버. 비개발자로 바이브 코딩으로 기능을 늘려 가는 중.
설명과 화면 문구는 한국어, 쉬운 말로. 코드 주석도 한국어.

## 구조
- 빌드 단계 없는 정적 사이트(ES 모듈). `index.html` + `css/style.css` + `js/*.js`.
- 서버 기능은 Vercel 함수(`api/*.js`, Node 20, ESM, 의존성 없음 — Anthropic 은 fetch 로 직접 호출). ko372.com 저장소에서는 같은 코드가 `lib/mrk-video/*.mjs` 에 있고 `api/mrk-video/*.js` 가 감싼다.
- 영상 모양은 `js/shorts-render.js`의 `drawFrame()` 하나가 결정한다. 미리보기·스타일 썸네일·내보내기가 같은 함수를 쓰므로 둘이 어긋나지 않게 여기만 고친다. 크기는 1080 기준 값 × `u`. 어휘(레이아웃·자막 등장·장식·전환)는 `docs/STYLE-SPEC.md`.
- 쇼츠 스타일 30가지는 `js/styles-data.js` 데이터다. 스타일을 추가하면 갤러리·"전부 만들기" 버튼·사례 화면에 자동으로 들어가고, 화면 문구의 숫자(`index.html`의 `<span data-style-count>` 자리표시 — `main.js`의 `fillStyleCount()`가 `STYLES.length`로 채움)도 따라 바뀐다. 숫자를 HTML·JS 에 직접 적지 말고 자리표시를 쓴다. README·CLAUDE.md·docs 같은 정적 문서의 숫자는 직접 고친다. 추가 후 `node tests/style-sheet.cjs`로 시트를 만들어 눈으로 확인한다.
- 내보내기는 `js/export.js`(exportProject / exportStyles). 화면 움직임은 `js/motion.js`.
- AI 대본 프롬프트·JSON 스키마는 `js/script-prompt.js` 한 곳. 브라우저(아티팩트)와 `api/ai.js`가 함께 import한다.
- 사용자 AI 키(제미나이·클로드·GPT·일레븐랩스·Fish Audio)는 `js/keys.js` 한 곳. 화면은 숏폼 제목 바로 아래 'AI 키' 칸(`#aiKeys`, `listing.js` 의 `initKeyBar`/`openKeyBar`). 기본은 탭 안(sessionStorage), "이 브라우저에 기억"을 켜면 localStorage `mrkv.keys`. 키는 서버·프로젝트 .json·로그·오류 문구에 넣지 않는다. 다른 곳에서 키가 필요하면 `getKey(id)` 를 쓰고, 없으면 `openKeyBar({ focus: id })` 로 안내한다. 키 칸으로 가는 링크는 `data-open-keys="서비스 id"`(main.js 가 처리).
- 내레이션 만들기(제미나이·일레븐랩스·Fish Audio)는 `js/tts.js`(PROVIDERS·synthesize). 제미나이·일레븐랩스는 브라우저가 직접 부르고, Fish Audio 만 `api/tts.js`가 중계한다(CORS). 키는 keys.js 에서 꺼낸다. 설정(목소리·엔진·속도)은 `store 'tts'`(프로젝트 .json 에는 넣지 않음). 화면 쪽 공통 함수는 `shorts.js` 의 `makeNarration`(소리 패널·매물 상자가 같이 씀).
- 매물 사진으로 쇼츠 만들기(단계 1~6)는 `js/listing.js`. 숏폼 화면과 같은 project 를 쓰며 `shorts.js` 가 `initListing(api)` 로 손잡이(api)를 넘긴다 — 장면·소리·내보내기는 shorts.js 함수를 그대로 부른다. 대본 프롬프트·스키마·필수 표시 줄은 `js/listing-prompt.js`, AI 호출(사진+JSON)은 `js/llm.js`(모델 이름은 `LLM_PROVIDERS` 한 곳), 녹음은 `js/recorder.js`. 장면의 '읽을 문장'은 `scene.narration`(없으면 자막을 읽음, `fitToNarration` 도 이 글자 수 비율). 매물·중개사무소 정보는 프로젝트 .json 의 `listing`, 중개사무소는 `store 'office'` 에도 기억.
- 업무 대시보드로 보내기는 `js/outbox.js`. ko372.com `assets/js/social-make.js` 의 `sendToDashboard` 와 메시지 이름·필드·순서·글자 수가 같아야 한다(바꾸면 양쪽을 같이). 보내기 버튼은 `serverInfo().gate`(ko372.com)일 때만 켜진다. 팝업이 막히지 않게 클릭에서 await 없이 바로 부른다.
- 맨 위 "회원 전용" 표시(`index.html` `#memberBar`, `main.js` `renderMember`)는 `serverInfo().gate` 가 true 일 때만 켜진다(단독 배포 `api/health.js` 는 `gate:false`). 회원 코드·입장 쿠키 게이트는 ko372.com 저장소 `lib/mrk-video/app.mjs` 에 있다.
- 환경 차이(Claude 아티팩트 vs 일반 웹)는 `js/platform.js`에서만 처리한다. 아티팩트에서는 `<a download>`와 외부 fetch가 막혀 있으므로 저장은 `saveBlob()`/`openSink()`만 쓴다.
- 설정값은 `store`(localStorage, try/catch 처리)에 저장. 사진·소리는 저장하지 않는다(프로젝트 .json으로만).

## 지켜야 할 것
- 원본 앱(메이커 셀링 도우미)의 코드·로고·이름·이미지는 쓰지 않는다. 기능은 독자적으로 설계한다.
- 글꼴은 Pretendard Variable 하나(`assets/fonts/`), 다른 글꼴을 넣지 않는다. 색은 `css/style.css`의 `:root` 변수로만. 다크 모드 블록 두 곳(`prefers-color-scheme`, `[data-theme="dark"]`)도 같이 고친다.
- 모바일(폭 400px)에서 가로 스크롤이 생기지 않게.
- `api/proxy.js`의 내부망 차단·크기 제한·이미지 형식 검사를 없애지 않는다. `api/ai.js`는 `ACCESS_CODE` 없이는 동작하지 않게 유지.
- 모델은 `claude-opus-5-5` (사용자가 바꾸라고 할 때만 변경).

## 확인 방법
- `npm start`(= `python3 -m http.server 5173`) 후 브라우저로 열어 확인. 서버 함수까지는 `npx vercel dev`.
- `npm run check`로 서버 함수 문법 검사.
- 매물 쇼츠 흐름 전체는 `LANG=C.UTF-8 node tests/listing-flow.cjs`(외부 AI·대시보드는 모의 응답), 내레이션 상자는 `tests/tts-ui.cjs`, AI 키·AI 호출은 `tests/llm-check.cjs`.
- Claude 아티팩트로 다시 올릴 때: `node scripts/artifact-page.mjs` → `dist-artifact/index.html`을 페이지로, `css/`·`js/` 파일을 `files`로 함께 publish (capabilities: `downloads`, `sample`).
