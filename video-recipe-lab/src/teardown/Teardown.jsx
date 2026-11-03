// ③ 해부 리포트 — 사이트 HTML·JS 번들·약관/환불/결제 페이지를 직접 받아 분석한 결과 (2026-11-02 수집)
import './teardown.css';

const STACK = [
  ['프레임워크', 'Next.js (App Router)', '/_next/static/chunks/app/page-*.js, 페이지 이동 시 ?_rsc= 요청 (React Server Components)'],
  ['호스팅', 'Vercel', '응답 헤더 server: Vercel, x-vercel-cache: HIT (정적 캐시)'],
  ['스타일', 'CSS Modules + Pretendard', '클래스명 sales_hero__xVcdo, sales_gift__WRAEz … / 색 #07120f · #16634a · #c8ff3e'],
  ['이미지', 'next/image', '/_next/image?url=/landing/genre-gallery/*.jpg&w=640 (자동 리사이즈·WebP)'],
  ['회원·DB', 'Supabase', '번들에 supabase-js, /auth?next=/account 로그인 · 회원가입 · 비밀번호 찾기'],
  ['결제', 'PortOne 결제위젯', '번들에 PortOnePaymentWidget, /checkout?plan=bundle (상품확인 → 결제정보 → 완료 3단계)'],
  ['분석', 'Microsoft Clarity + Vercel Analytics', 'clarity.ms/tag (히트맵·세션 녹화), va.vercel-scripts.com'],
  ['영상', 'YouTube 임베드', 'youtube-nocookie.com/embed + 시작 시각으로 장면 점프'],
  ['상담', '카카오톡', '채널 1:1 채팅(pf.kakao.com) + 오픈채팅(무료 전자책)'],
  ['SEO', '동적 OG 이미지', '/opengraph-image, 네이버 사이트 인증 메타태그'],
];

const PIPE = [
  ['채널·벤치마킹 영상 분석', '유튜브 주소 → 자막 수집 → LLM 이 후킹·구조·말투 해부', 'server/pipeline/youtube.js, llm.js → claude.js / gemini.js'],
  ['제목·썸네일 기획', '같은 공식으로 새 제목 5개, 썸네일 문구 3안', 'prompts.js (AnalysisSchema.titles / thumbnails)'],
  ['대본 작성', '분석된 공식 + 새 주제 → 장면 단위 대본', 'llm.js (writeScript), prompts.js (ScriptSchema)'],
  ['TTS 음성', '장면별 mp3, 실제 길이를 재서 타임라인 기준으로', 'tts.js, eleven.js (OpenAI · ElevenLabs · 무음)'],
  ['SRT 자막', '22자 단위로 끊고 글자 수 비례로 시간 배분', 'subtitles.js'],
  ['장면 컷 설계', 'AI 그림 / 스톡 / 그래프 / 모션그래픽 유형별 그림', 'images.js'],
  ['썸네일 편집', '배경 + 흰 줄 + 노란 큰 줄, 아래쪽 어둡게', 'render.js (composeThumbnail)'],
  ['최종 MP4 렌더링', '켄번스 줌 → 장면 이어붙이기 → 자막 굽기', 'render.js (ffmpeg)'],
];

const COST = [
  ['Claude Opus 5.5 — 분석 + 대본', '입력 약 1.8만 토큰 × $4/M + 출력 약 1.4만 토큰 × $20/M', '약 $0.35', '약 500원'],
  ['장면 그림 45장 (6분 영상)', '장당 $0.01~0.04 가정 (저·중품질 이미지 모델)', '$0.45~1.80', '650~2,600원'],
  ['TTS 6분', '분당 약 $0.015 가정 (경량 TTS 모델)', '약 $0.09', '약 130원'],
  ['합계', '이미지 단가가 전체 비용을 좌우', '$0.9~2.2', '약 1,300~3,200원'],
];

const GAPS = [
  ['설치형 Windows 프로그램 + 1PC 라이선스', '웹앱(React + Node)으로 대체. Electron 으로 감싸면 같은 형태가 된다'],
  ['스톡 영상 컷', '그림으로 대체. Pexels/Pixabay API 를 붙이면 실제 영상 컷 가능'],
  ['그래프 컷', '대체 카드 + 키워드. Claude 가 데이터 JSON 을 주고 차트로 렌더하도록 확장 가능'],
  ['모션그래픽', '키워드 페이드인 수준. Remotion 등으로 고도화 가능'],
  ['채널 단위 분석', '영상 1개 기준. 채널 인기 영상 목록을 YouTube Data API 로 받아 일괄 분석하면 확장'],
  ['쇼츠(혜택 1, "추가 예정")', '미구현. 해상도를 1080×1920 으로 바꾸고 장면을 3~5개로 줄이면 된다'],
];

export default function Teardown() {
  return (
    <div className="td">
      <div className="wrap">
        <header className="tdHead">
          <span className="kicker">해부 리포트 · 2026-11-02 수집</span>
          <h1>영상레시피 AI는 무엇을, 어떻게 팔고 있나</h1>
          <p>
            랜딩페이지는 <b>웹사이트(Next.js)</b>이고, 실제 상품은 <b>Windows 설치형 영상 자동 생성 프로그램</b>입니다.
            약관 제2조에 프로그램 기능이 그대로 적혀 있어, 그 순서대로 다시 만들었습니다.
          </p>
        </header>

        <section className="tdSec">
          <h2>1. 상품 구조</h2>
          <div className="facts">
            <div><b>599,000원</b><span>정가 1,290,000원 표기 · 54% 할인 · 1회 결제</span></div>
            <div><b>1PC 영구 사용권</b><span>Windows 전용 설치형, 계정 페이지에서 설치 파일 다운로드</span></div>
            <div><b>API 비용 별도</b><span>Gemini · OpenAI · Claude · Azure · ElevenLabs 키를 사용자가 직접 연결 (약관 제5조)</span></div>
            <div><b>설치 지원 3개월</b><span>카톡·원격·영상으로 1:1 지원 + 원본 강의 6강</span></div>
          </div>
          <p className="note">
            핵심은 <b>"소프트웨어 + 설치 대행 + 강의"를 묶은 고가 일시불 상품</b>이라는 점입니다. AI 사용료는 사용자에게 넘겨서(BYOK) 판매자는 서버 비용이 거의 들지 않습니다.
            환불은 설치 파일 다운로드·라이선스 발급 이후 단순 변심 제한, 단 설치 실패 시 전액 환불.
          </p>
        </section>

        <section className="tdSec">
          <h2>2. 판매 동선</h2>
          <div className="funnel">
            {['유튜브·광고 유입', '랜딩 (가격·기한·증거)', '결제 클릭', 'Supabase 회원가입/로그인', 'PortOne 카드결제', '/account 설치파일·라이선스', '카톡 설치 지원'].map((s, i, a) => (
              <span key={s}>
                <i>{s}</i>
                {i < a.length - 1 && <em>→</em>}
              </span>
            ))}
          </div>
          <p className="note">
            지금 안 사는 방문자는 <b>무료 전자책(오픈채팅)</b>과 <b>카톡 1:1 상담</b>으로 붙잡습니다. Clarity 히트맵으로 어디서 이탈하는지 보고 문구를 고치는 구조입니다.
            랜딩 섹션별 설득 장치는 ① 랜딩페이지 클론 탭에서 "해부 주석 보기"를 켜면 섹션마다 나옵니다.
          </p>
        </section>

        <section className="tdSec">
          <h2>3. 웹사이트 기술 스택</h2>
          <table>
            <thead><tr><th>영역</th><th>쓴 것</th><th>근거</th></tr></thead>
            <tbody>{STACK.map(([a, b, c]) => <tr key={a}><td>{a}</td><td><b>{b}</b></td><td>{c}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="tdSec">
          <h2>4. 프로그램 파이프라인 → 이 클론의 파일</h2>
          <ol className="pipe">
            {PIPE.map(([a, b, c], i) => (
              <li key={a}>
                <span className="no">{i + 1}</span>
                <div>
                  <b>{a}</b>
                  <p>{b}</p>
                  <code>{c}</code>
                </div>
              </li>
            ))}
          </ol>
          <p className="note">
            사용자 화면에서는 이 8단계가 <b>"넣기 → 고르기 → 기다리기 → 완성"</b> 4단계로 접혀 보입니다. ② 스튜디오 탭이 그 4단계 화면입니다.
          </p>
        </section>

        <section className="tdSec">
          <h2>5. "영상 한 편에 3천 원대" 검증</h2>
          <table>
            <thead><tr><th>항목</th><th>계산</th><th>USD</th><th>원화(≈1,450원/$)</th></tr></thead>
            <tbody>{COST.map(([a, b, c, d]) => <tr key={a} className={a === '합계' ? 'sum' : ''}><td>{a}</td><td>{b}</td><td>{c}</td><td><b>{d}</b></td></tr>)}</tbody>
          </table>
          <p className="note">
            Claude 단가는 Anthropic 공식 요금(Opus 5.5 입력 $4 / 출력 $20 per 1M 토큰) 기준이고, 이미지·TTS 단가는 <b>가정</b>입니다. 각 공급자 요금표로 바꿔 넣으세요.
            결론: 광고 문구 "3천 원대"는 <b>그림을 장면마다 새로 뽑는 경우의 상한</b>에 가깝고, 그림 품질을 낮추거나 장면 수를 줄이면 1천 원대까지 내려갑니다.
          </p>
        </section>

        <section className="tdSec">
          <h2>6. 이 클론이 아직 안 하는 것</h2>
          <table>
            <thead><tr><th>원본 기능</th><th>여기서는</th></tr></thead>
            <tbody>{GAPS.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="tdSec warnBox">
          <h2>7. 쓰기 전에</h2>
          <ul>
            <li><b>벤치마킹은 구조만.</b> 남의 대본을 바꿔 쓴 영상은 유튜브 "재사용 콘텐츠" 정책으로 수익화가 막힐 수 있습니다. 대본 프롬프트에 원문 복사 금지를 넣어 둔 이유입니다.</li>
            <li><b>랜딩 카피·이미지는 분석용 인용입니다.</b> 그대로 내 상품 페이지에 쓰면 저작권 문제가 됩니다. src/landing/content.js 만 바꿔 내 문구로 쓰세요.</li>
            <li><b>수익 주장은 근거와 범위를 맞추세요.</b> 원본은 헤드라인(800만 원)과 "이 프로그램으로 만든 영상" 증거(37만 원)의 범위가 다릅니다. 내 페이지에서는 표시광고법상 문제가 될 수 있습니다.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
