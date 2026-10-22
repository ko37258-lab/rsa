# MR.K - Typeless

**말하면, 정리된 글이 됩니다.**

AI 받아쓰기 앱 [Typeless](https://www.typeless.com/)의 기능을 분석해, MR.K(미스터홈즈 고상철 대표)의 업무에 맞게 React로 다시 만든 받아쓰기 도구입니다.
말을 하면 "음, 어" 같은 군더더기와 말 바꿈을 걷어내고, 이메일·보고서·강의 원고·부동산 상담 노트처럼 바로 쓸 수 있는 글로 정리한 뒤 클립보드에 복사합니다.

---

> **어느 창에서든 바로 입력되는 Windows 프로그램**은 [`desktop/`](../desktop/)에 있습니다. Win+H를 누르고 말하면 정리된 글이 쓰던 창에 바로 들어갑니다.
> 웹앱 사용법(녹음 켜고 끄기, AI 정리 순서, 버튼·메뉴·단축키)은 화면 위쪽 **사용법** 버튼으로 열고, 주소 끝에 `#guide`를 붙이면 바로 열립니다 ([mrk-typeless.vercel.app/#guide](https://mrk-typeless.vercel.app/#guide)).
> 학생에게는 내려받기·설치 안내 페이지 **[mrk-typeless.vercel.app/download](https://mrk-typeless.vercel.app/download)** 를 보내면 됩니다 (`download.html`, `src/components/DownloadPage.tsx`).

---

## 1. Typeless 분석

Typeless는 "Speak, don't type"을 내건 음성 키보드입니다. 말하기(약 220단어/분)가 타자(약 45단어/분)보다 4배 빠르다는 점을 앞세우고, 받아쓴 말을 AI가 글로 다듬는 것이 핵심입니다.

| Typeless 기능 | 하는 일 | MR.K - Typeless에서 |
| --- | --- | --- |
| 받아쓰기 | 말하는 대로 실시간 받아쓰기 | 마이크 버튼 길게 누르기(누르는 동안만) / 짧게 누르기(켜고 끄기), `Space` 길게 누르기 |
| 군더더기 말 제거 | um, uh, you know 삭제 | 음·어·그·뭐·막·약간 등 삭제 (AI 없이도 기본 삭제) |
| 말 바꿈 반영 | 말하다 고친 부분은 마지막 뜻만 | "목요일, 아 아니다 금요일" → "금요일" |
| 반복 제거 | 반복·더듬은 말 정리 | 같음 |
| 자동 서식 | 나열한 항목·단계를 목록으로 | "일단 … 그리고 … 마지막으로" → 목록 |
| 앱별 어조 | 업무 메일 ↔ 채팅 어조 자동 조절 | **글의 형식 7가지**: 자동 정리 · 메시지 · 이메일 · 보고서(개조식) · 강의 원고 · 상담 노트 · 번역 |
| 개인 사전 | 이름·전문용어를 학습 | **용어 + 바꿔쓰기 규칙**. 부동산공법 용어(건폐율, 용적률, 지구단위계획 …)를 기본으로 넣어 둠 |
| 100개+ 언어, 번역 | 언어 자동 감지, 말하면서 번역 | 받아쓰기 언어 4종(한·영·일·중) + 번역 형식 |
| Speak to edit / Ask | 글을 골라 말로 고치기·묻기 | **음성 편집** 탭: 글을 붙여넣고 "세 줄로 요약해줘"라고 말하면 적용 |
| 기기 안에만 기록 | 기록은 기기에만 저장 | 기록·사전·설정은 이 브라우저에만 저장 |
| 절약한 시간 | 아낀 시간 표시 | 기록 탭 통계(받아쓰기 횟수, 정리한 글자 수, 절약 시간 추정) |

### Typeless와 다른 점

- **어디서나 바로 입력되지는 않습니다.** Typeless는 운영체제 전체에 설치되는 키보드·데스크톱 앱이라 아무 앱에서나 단축키로 바로 입력됩니다. MR.K - Typeless는 웹앱이라, 정리된 글을 클립보드에 자동 복사하고 쓰던 곳에 붙여넣는 방식입니다.
- **음성인식은 두 가지입니다.** 기본은 브라우저 음성인식(무료, Chrome·Edge·Safari)입니다. Chrome은 음성을 Google 서버로 보내 인식하므로, 네이버 웨일·브레이브 같은 일부 브라우저나 막힌 네트워크에서는 "음성인식 서버에 연결하지 못했습니다"가 뜹니다. 이때는 **설정 → 음성 인식**에 녹음 받아쓰기 API 키(ElevenLabs Scribe, OpenAI 또는 Gemini)를 넣으면 어느 브라우저에서나 받아씁니다. "자동"이면 브라우저 음성인식이 실패하는 순간 녹음 받아쓰기로 이어서 듣습니다.
- **claude.ai 아티팩트 안에서는 마이크를 직접 쓸 수 없습니다.** 대신 원문 칸을 누르고 키보드의 음성 입력(휴대폰 키보드 마이크, Windows `Win`+`H`, Mac `Fn` 두 번)으로 말하면 정리는 똑같이 됩니다.

---

## 2. 쓰는 방법 (세 가지)

### ① claude.ai 아티팩트로 열기 — 가장 쉬움

링크를 열면 바로 씁니다. 로그인한 **내 Claude 계정**으로 정리하므로 API 키가 필요 없습니다. 처음 정리할 때 Claude 사용 허용을 한 번 묻습니다.

아티팩트용 파일은 이렇게 만듭니다.

```bash
cd mrk-typeless
npm install
npm run build:artifact   # → dist-artifact/mrk-typeless.html
```

### ② 내 컴퓨터에서 실행 — 마이크 받아쓰기까지 전부

[Node.js](https://nodejs.org/) 20.19 이상 또는 22.12 이상(LTS 권장)이 필요합니다.

```bash
cd mrk-typeless
npm install
npm run dev
```

브라우저(크롬 권장)에서 `http://localhost:5173`을 열고, **설정 → Anthropic API 키**에 키를 넣습니다. 키는 [console.anthropic.com](https://console.anthropic.com/)에서 발급합니다.

### ③ 웹에 올리기

```bash
npm run build   # → dist/ 폴더
```

`dist/` 폴더를 Vercel·Netlify 같은 정적 호스팅에 올리면 됩니다. 마이크는 **HTTPS 주소**(또는 localhost)에서만 동작합니다.

현재 배포: **https://mrk-typeless.vercel.app** (Vercel 프로젝트 `mrk-typeless`, 루트 디렉터리 `mrk-typeless`). 이 주소는 누구나 열 수 있고, 학생 안내 링크도 이 주소를 씁니다. Vercel 로그인은 미리보기·자동 생성 주소에만 걸려 있습니다. 배포는 git 연동 없이 이 세션에서 Vercel API로 하므로, 커밋한 뒤 따로 배포해야 사이트가 바뀝니다.

---

## 3. 사용법

| 하고 싶은 일 | 방법 |
| --- | --- |
| 말한 동안만 받아쓰기 | 마이크 버튼을 **길게 누르고** 말한 뒤 떼기 → 바로 정리·복사 |
| 길게 말하기 | 마이크 버튼을 **짧게 누르고** 말하기 → 다 말하면 한 번 더 누르기 |
| 키보드로 | `Space` 길게 누르기 = 말하기 · `Ctrl`(Mac `⌘`)+`Enter` = 정리 · `Esc` = 멈춤 |
| 글 형식 바꾸기 | 받아쓰기 위의 **글의 형식**에서 고르기 (이메일, 보고서, 상담 노트 …) |
| 이미 쓴 글 고치기 | **음성 편집** 탭 → 글 붙여넣기 → "더 공손하게"처럼 말하거나 빠른 지시 버튼 |
| 자주 틀리는 말 고치기 | **사전** 탭 → 용어 추가, 바꿔쓰기 규칙(들린 말 → 바른 표기) |
| 예전 글 다시 쓰기 | **기록** 탭 → 검색, 복사, 원문 보기 |
| 문체 맞추기 | **설정 → 나만의 문체** ("'~습니다'체로, 문장은 짧게") |

### AI 정리 방식

| 방식 | 언제 쓰나 | 비용 |
| --- | --- | --- |
| 내 Claude 계정 | claude.ai 아티팩트로 열었을 때 (자동 선택) | 내 Claude 구독 사용량 |
| Claude API 키 | 독립 웹앱(②, ③) | Anthropic API 요금. 기본 모델 Claude Opus 5.5, 설정에서 Sonnet 5.5·Haiku 5.5로 바꿀 수 있음 |
| Gemini API 키 | 독립 웹앱(②, ③) | Google Gemini API 요금. 기본 모델 Gemini 3.8 Flash, 설정에서 Gemini 4 Argon·3.5 Flash-Lite로 바꿀 수 있음 |
| AI 없이 | 언제나 | 무료. 군더더기 말과 반복만 지움 (말 바꿈·목록·형식 변환은 안 됨) |

"자동"은 내 Claude 계정 → Claude API 키 → Gemini API 키 → AI 없이 순서로 고릅니다. '생각하는 정도'는 두 AI에 함께 적용됩니다(Gemini는 `thinkingLevel`로 바꿔 보냄).

Claude API 키 방식은 Opus·Sonnet에서 서버 측 거절 대체(`fallbacks: "default"`)를 켜 두었습니다. 안전 분류기가 요청을 거절하면 Claude가 알맞은 모델로 다시 실행합니다.

### Claude · Gemini 비교

정리된 글 아래 **Claude·Gemini 비교**를 누르면 같은 원문과 같은 지시를 두 AI에 동시에 보내 나란히 보여 줍니다. 걸린 시간과 글자 수가 함께 나오고, 먼저 끝난 쪽에 "더 빠름"이 붙습니다. 마음에 드는 쪽의 **이 글 쓰기**를 누르면 그 글이 정리 결과가 되고, 기록과 클립보드도 그 글로 바뀝니다. 키가 하나만 있으면 다른 쪽에는 키를 넣는 곳으로 가는 버튼이 나옵니다.

### Gemini로 녹음 받아쓰기

설정 → 음성 인식에서 녹음 받아쓰기 서비스를 **Gemini**로 고르면 정리용 Gemini 키 하나로 받아쓰기까지 됩니다(Gemini 3.8 Flash가 녹음을 직접 듣고 적음). 개인 사전의 용어를 미리 알려 주므로 '지구단위계획' 같은 말을 더 잘 알아듣습니다.

---

## 4. 개인정보

- 기록·사전·설정·API 키는 **이 브라우저의 저장소(localStorage)에만** 저장됩니다. 서버로 보내지 않습니다.
- 정리할 때는 원문이 고른 AI(Claude는 Anthropic, Gemini는 Google)로 전송됩니다. 비교를 누르면 두 곳 모두로 갑니다.
- Gemini 무료 등급에서는 보낸 내용(녹음 받아쓰기의 녹음·사전 용어 포함)이 Google 서비스 개선에 쓰일 수 있습니다. 민감한 내용은 유료 등급이나 Claude 키를 쓰세요.
- 브라우저 저장 공간(보통 5MB)이 가득 차면 오래된 기록부터 자동으로 지우고 화면에 알립니다. 기록 탭에서 .txt로 내보내 둘 수 있습니다.
- API 키는 브라우저에 저장되므로 여러 사람이 쓰는 컴퓨터에서는 쓰지 마세요.

---

## 5. 개발

```bash
npm test             # 정리 규칙·사전·프롬프트·통계 단위 테스트
npm run typecheck    # 타입 검사
npm run build        # 독립 웹앱 → dist/
npm run build:artifact  # claude.ai 아티팩트 → dist-artifact/mrk-typeless.html
```

```
mrk-typeless/
  index.html                 페이지 뼈대 (글꼴, 제목)
  vite.config.ts             두 가지 빌드 설정 (독립 웹앱 / 아티팩트)
  scripts/to-artifact-page.mjs  아티팩트용 한 장짜리 페이지로 합치기
  src/
    App.tsx                  탭 구성, 설정·사전·기록 상태
    components/
      DictateView.tsx        받아쓰기 (마이크, 원문, 정리 결과)
      EditView.tsx           음성 편집 (말로 고치기)
      DictionaryView.tsx     개인 사전
      HistoryView.tsx        기록과 통계
      SettingsView.tsx       AI 정리 방식, 언어, 문체
      ComparePanel.tsx       Claude · Gemini 나란히 비교
    hooks/
      useSpeech.ts           브라우저 음성인식 (Web Speech API)
      useAiRun.ts            AI 정리 진행 상태와 멈춤
    ai/
      engine.ts              엔진 선택, 내 Claude 계정(sample) 연결
      apiKeyEngine.ts        Claude API (공식 SDK, 스트리밍)
      gemini.ts              Gemini API 공통 (SSE 읽기, 오류 문구, 생각 단계)
      geminiEngine.ts        Gemini API 정리 (스트리밍)
      transcribe.ts          녹음 받아쓰기 (ElevenLabs · OpenAI · Gemini)
    lib/
      prompts.ts             정리·편집 지시문
      modes.ts               글의 형식 7가지
      dictionary.ts          기본 사전(부동산공법)과 바꿔쓰기
      localCleanup.ts        AI 없이 하는 기본 정리
      stats.ts               절약 시간 추정
```

절약 시간은 한글 타자 약 120자/분(300타), 말하기 약 350자/분을 기준으로 한 **추정치**입니다.
