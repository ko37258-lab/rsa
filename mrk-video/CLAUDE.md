# MR.K 영상만들기 — 작업 규칙

사용자: 고상철 대표(MR.K, 미스터홈즈 FC). 부동산공법 강사·유튜버. 비개발자로 바이브 코딩으로 기능을 늘려 가는 중.
설명과 화면 문구는 한국어, 쉬운 말로. 코드 주석도 한국어.

## 구조
- 빌드 단계 없는 정적 사이트(ES 모듈). `index.html` + `css/style.css` + `js/*.js`.
- 서버 기능은 Vercel 함수(`api/*.js`, Node 20, ESM). 의존성은 `@anthropic-ai/sdk` 하나.
- 영상 모양은 `js/shorts-render.js`의 `drawFrame()` 하나가 결정한다. 미리보기와 내보내기가 같은 함수를 쓰므로 둘이 어긋나지 않게 여기만 고친다. 크기는 1080 기준 값 × `u`.
- AI 대본 프롬프트·JSON 스키마는 `js/script-prompt.js` 한 곳. 브라우저(아티팩트)와 `api/ai.js`가 함께 import한다.
- 환경 차이(Claude 아티팩트 vs 일반 웹)는 `js/platform.js`에서만 처리한다. 아티팩트에서는 `<a download>`와 외부 fetch가 막혀 있으므로 저장은 `saveBlob()`/`openSink()`만 쓴다.
- 설정값은 `store`(localStorage, try/catch 처리)에 저장. 사진·소리는 저장하지 않는다(프로젝트 .json으로만).

## 지켜야 할 것
- 원본 앱(메이커 셀링 도우미)의 코드·로고·이름·이미지는 쓰지 않는다. 기능은 독자적으로 설계한다.
- 색은 `css/style.css`의 `:root` 변수로만. 다크 모드 블록 두 곳(`prefers-color-scheme`, `[data-theme="dark"]`)도 같이 고친다.
- 모바일(폭 400px)에서 가로 스크롤이 생기지 않게.
- `api/proxy.js`의 내부망 차단·크기 제한·이미지 형식 검사를 없애지 않는다. `api/ai.js`는 `ACCESS_CODE` 없이는 동작하지 않게 유지.
- 모델은 `claude-opus-5-5` (사용자가 바꾸라고 할 때만 변경).

## 확인 방법
- `npm start`(= `python3 -m http.server 5173`) 후 브라우저로 열어 확인. 서버 함수까지는 `npx vercel dev`.
- `npm run check`로 서버 함수 문법 검사.
- Claude 아티팩트로 다시 올릴 때: `node scripts/artifact-page.mjs` → `dist-artifact/index.html`을 페이지로, `css/`·`js/` 파일을 `files`로 함께 publish (capabilities: `downloads`, `sample`).
