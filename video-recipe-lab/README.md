# Video Recipe Lab — 영상레시피 AI 해부용 클론

[videorecipeai.com](https://videorecipeai.com)(영상레시피 AI)을 **React로 다시 만들어 뜯어보는** 프로젝트입니다.

- **① 랜딩페이지 클론**: 원본 판매 페이지의 섹션 구성·색·레이아웃을 그대로 재현했습니다. "해부 주석 보기"를 켜면 섹션마다 어떤 설득 장치를 썼는지 설명이 붙습니다.
- **② 영상 생성 스튜디오**: 원본이 59.9만 원에 파는 Windows 프로그램의 기능(벤치마킹 분석 → 제목·썸네일 → 대본 → TTS → 자막 → 장면 컷 → 썸네일 → MP4)을 실제로 돌아가게 만들었습니다.
- **③ 해부 리포트**: 기술 스택, 판매 동선, 원가 구조("영상 한 편 3천 원대" 검증), 아직 못 따라 한 기능을 정리했습니다.

> 2026-11-02에 사이트 HTML, JS 번들, 이용약관, 환불정책, 결제 페이지를 직접 받아서 분석했습니다.

---

## 해부 요약

| | 내용 |
|---|---|
| 실제 상품 | **Windows 설치형 프로그램 1PC 영구 사용권** 599,000원(정가 1,290,000원 표기), 원본 강의 6강, 설치 지원 3개월 |
| AI 비용 | **사용자 부담(BYOK)**. Gemini·OpenAI·Claude·Azure·ElevenLabs 키를 직접 연결합니다(약관 제5조). |
| 프로그램 기능 | 약관 제2조: 채널·벤치마킹 영상 분석, 제목·썸네일 기획, 대본 작성, TTS 음성, SRT 자막, 장면 컷 설계, 썸네일 편집, MP4 렌더링 |
| 웹사이트 | Next.js(App Router) + Vercel, CSS Modules, Supabase 로그인, PortOne 결제위젯, Microsoft Clarity 히트맵 |
| 판매 구조 | 결과 약속 헤드라인 → 수익 캡처 → 장르 갤러리 → 4단계 사용법 → 보너스 → 후기 → FAQ → 실제 영상 → 마감 CTA, 하단 고정 카운트다운 바 |
| 눈여겨볼 점 | 헤드라인 "800만 원"은 "제 채널, 영상 한 편" 카드에서 나온 숫자입니다. "이 프로그램으로 만든 영상"이라고 적힌 카드는 37만 원(1주일)짜리뿐입니다. |

---

## 실행 방법

### 준비물
- Node.js 20 이상
- ffmpeg (영상 렌더용)
  - Windows: `winget install Gyan.FFmpeg`
  - macOS: `brew install ffmpeg`

### 설치와 실행

```bash
cd video-recipe-lab
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 화면은 Vite(5173), 영상 만드는 API는 Express(8787)에서 돕니다.

### API 키가 없어도 됩니다
키를 하나도 넣지 않으면 **데모 모드**로 돕니다. 유튜브 제목·채널·자막은 실제로 가져오고, 분석과 대본은 준비된 예시(용도지역과 땅값)를 씁니다. 그림은 대체 카드, 음성은 무음으로 넣어서 **55초짜리 MP4가 실제로 만들어집니다.**

화면 없이 렌더만 확인하려면:

```bash
npm run demo:render
```

### 키를 넣으면 (.env)

| 키 | 하는 일 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude(claude-opus-5-5)가 벤치마킹 분석, 제목·썸네일 기획, 대본·장면 설계를 합니다 |
| `OPENAI_API_KEY` | 장면 그림(gpt-image-1)과 TTS 목소리(gpt-4o-mini-tts)를 만듭니다 |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICES` | ElevenLabs 목소리를 씁니다. 목소리는 `이름:voiceId,이름:voiceId` 형식으로 넣습니다 |

Claude 호출에는 서버 측 거절 대비(`fallbacks: "default"`)를 켜 두었습니다. 안전 분류기가 요청을 거절하면 Anthropic 서버가 다른 모델로 자동 재시도합니다. 끄려면 `server/pipeline/claude.js`의 `betas`와 `fallbacks` 두 줄을 지우세요.

---

## 폴더 구조

```
video-recipe-lab/
├─ src/                      React 화면
│  ├─ landing/               ① 랜딩 클론
│  │  ├─ content.js          문구와 해부 주석 (이 파일만 바꾸면 내 상품 페이지가 됨)
│  │  ├─ SalesPage.jsx       섹션 구성 (원본 클래스명 sales_* 그대로)
│  │  └─ Thumb.jsx           썸네일을 이미지 대신 CSS로 재현
│  ├─ studio/Studio.jsx      ② 넣기 → 고르기 → 기다리기 → 완성
│  └─ teardown/Teardown.jsx  ③ 해부 리포트
└─ server/                   영상 만드는 엔진 (Express)
   ├─ index.js               /api/analyze, /api/jobs(+SSE 진행상황)
   └─ pipeline/
      ├─ youtube.js          유튜브 메타데이터·자막
      ├─ claude.js           분석·제목·썸네일·대본 (구조화 출력)
      ├─ tts.js              음성 (OpenAI / ElevenLabs / 무음)
      ├─ subtitles.js        SRT
      ├─ images.js           장면 그림 (OpenAI / 대체 카드)
      ├─ render.js           켄번스 줌 클립 → 이어붙이기 → 자막 굽기, 썸네일
      ├─ run.js              전체 순서 (약관 제2조 순서 그대로)
      └─ demo.js             키 없이 도는 데모 데이터
```

---

## 원본과 다른 점

- 설치형이 아니라 웹앱입니다. Electron으로 감싸면 원본처럼 설치형이 됩니다.
- 스톡 영상, 그래프, 모션그래픽 컷은 그림과 키워드 애니메이션으로 대신했습니다. Pexels API, 차트 렌더러, Remotion을 붙이면 됩니다.
- 쇼츠(원본 혜택 1, "추가 예정")는 아직 없습니다. 해상도를 1080×1920으로 바꾸면 됩니다.

## 주의

- **벤치마킹은 구조만 가져옵니다.** 대본 프롬프트에 "원문 복사 금지"를 넣어 두었습니다. 남의 대본을 바꿔 쓴 영상은 유튜브 재사용 콘텐츠 정책 때문에 수익화가 막힐 수 있습니다.
- `src/landing/content.js`의 카피는 **분석 목적의 인용**이고 저작권은 원저작자에게 있습니다. 원본 이미지와 사업자 정보는 넣지 않았습니다. 이 클론을 외부에 공개하거나 판매 페이지로 쓰지 마세요. 쓰려면 문구를 내 것으로 바꾸세요.
