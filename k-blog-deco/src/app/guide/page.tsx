import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "MR.K-홈형 블로그 만들기 — 따라하기 가이드",
  description: "실제 예시 하나를 처음부터 끝까지 따라 하며 네이버 홈페이지형 블로그를 만드는 방법.",
};

/** 가이드에 쓰인 예시 입력값 — 운영 서버에서 실제로 만든 'MR.K 고상철의 부동산 연구소' 사례 */
const EX = {
  blogName: "MR.K 고상철의 부동산 연구소",
  tagline: "부동산 공법·토지개발·부동산 AI — 28년 강의를 블로그로 잇습니다",
  industry: "부동산 교육·컨설팅",
  audience: "공인중개사 수험생, 토지 투자자, 현업 중개사",
  styleRequest: `공식 홈페이지 ko372.com 첫 화면처럼 만들어 주세요.
- 흰색·밝은 회색 바탕에 선명한 파랑 포인트, 글자는 진한 남색·검정
- 왼쪽에 'MR.K' 브랜드와 큰 제목, 그 아래 한 줄 소개 / 오른쪽에 대표 프로필 사진
- 장식은 최소로, 여백이 넉넉한 정돈된 느낌
- 버튼 5개는 한 줄로, 파란색 또는 흰색 바탕의 단정한 버튼에 영어 보조 문구(CLASS 등)`,
  menu: [
    ["강의실", "https://ko372.com/classroom.html"],
    ["토지강의", "https://toji-gosangchul.vercel.app/index.html"],
    ["도구함", "https://ko372.com/tools.html"],
    ["미스터홈즈", "https://homespartners.imweb.me/HOME"],
    ["상담·문의", "https://ko372.com/#contact"],
  ],
  revise: "첫 번째 버튼 강의실만 파란색 채움에 흰 글자로 강조하고, 나머지 버튼은 지금처럼 흰 바탕으로 둬. 메인 제목은 조금 더 크게 해줘.",
};

const AI_NOTE = [
  ["색", "밝은 회백색 바탕에 진한 남색·검정 글자, 선명한 파랑은 핵심 단어와 주요 버튼에만 쓰는 절제된 배색"],
  ["레이아웃", "왼쪽에 '짧은 선 + 소속 문구' → 2줄 큰 제목 → 회색 소개문, 오른쪽에 인물 사진을 크게 두는 좌우 분할"],
  ["타이포", "굵은 고딕에 자간을 좁힌 큰 제목, 둘째 줄 핵심어만 파랑으로 강조"],
  ["버튼", "모서리가 살짝 둥근 단정한 사각 버튼, 흰 바탕 + 얇은 회색 테두리"],
];

const STEPS = [
  { id: "login", title: "로그인과 첫 확인" },
  { id: "basic", title: "기본 정보 입력" },
  { id: "reference", title: "레퍼런스 넣기" },
  { id: "style", title: "스타일과 버튼 정하기" },
  { id: "photo", title: "사진 올리기" },
  { id: "generate", title: "AI 디자인 만들기" },
  { id: "refine", title: "다듬기" },
  { id: "export", title: "내보내기" },
  { id: "apply", title: "네이버 블로그에 적용" },
];

function Shot({ src, alt, w, h, caption }: { src: string; alt: string; w: number; h: number; caption?: string }) {
  return (
    <figure className="my-5">
      <a href={src} target="_blank" className="block overflow-hidden rounded-xl border border-line bg-card shadow-[0_18px_40px_-28px_rgba(26,26,25,0.45)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={w} height={h} loading="lazy" className="block h-auto w-full" />
      </a>
      {caption && <figcaption className="mt-2 text-[13px] text-ink-3">{caption}</figcaption>}
    </figure>
  );
}

function Step({ n, id, title, time, children }: { n: number; id: string; title: string; time?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-12">
      <div className="flex items-baseline gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-white">{n}</span>
        <h2 className="text-[24px] font-extrabold tracking-tight">{title}</h2>
        {time && <span className="ml-auto shrink-0 text-xs font-semibold text-ink-3">{time}</span>}
      </div>
      <div className="mt-4 space-y-3 text-[15.5px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card">
      <p className="border-b border-line px-4 py-2 text-[12px] font-bold text-ink-3">{label}</p>
      <div className="px-4 py-3 text-[14px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border-l-[3px] border-accent bg-accent-soft px-4 py-2.5 text-[14px] text-ink-2">{children}</p>;
}

export default function GuidePage() {
  return (
    <main className="flex-1">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-5">
          <Link href="/" aria-label="첫 화면"><Logo className="text-[15px]" /></Link>
          <Link href="/dashboard" className="ml-auto rounded-lg bg-ink px-3.5 py-2 text-[13px] font-bold text-white hover:bg-black">
            만들러 가기 →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5">
        <section className="pb-10 pt-12">
          <p className="text-[13px] font-bold tracking-wide text-accent-ink">따라하기 가이드 · 약 20분</p>
          <h1 className="mt-2 text-[34px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[44px]">MR.K-홈형 블로그 만들기</h1>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
            실제로 만든 예시 하나(<b className="text-ink">MR.K 고상철의 부동산 연구소</b>)를 처음부터 끝까지 그대로 따라갑니다. 입력값을 내 블로그 것으로 바꾸기만 하면 같은 순서로 나만의 홈형 블로그가 완성됩니다.
          </p>

          <div className="mt-8 rounded-2xl border border-line bg-card p-4 sm:p-6">
            <p className="text-[13px] font-bold text-ink-3">완성 결과 — 이 가이드로 만든 실제 결과물</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/guide/result-skin.jpg" alt="완성된 PC 스킨 배경: 왼쪽 MR.K 고상철의 부동산 연구소 제목, 오른쪽 프로필 사진" width={1600} height={357} className="mt-3 h-auto w-full rounded-lg border border-line" />
            <div className="mt-3 flex flex-wrap gap-2.5">
              {[1, 2, 3, 4, 5].map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={`/guide/result-widget-${i}.png`} alt={`버튼 위젯 ${i}: ${EX.menu[i - 1][0]}`} width={170} height={64} className="h-auto w-[132px] sm:w-[150px]" />
              ))}
            </div>
            <div className="mt-5 grid items-start gap-5 sm:grid-cols-[220px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/guide/result-mobile.jpg" alt="완성된 모바일 커버" width={720} height={720} className="h-auto w-full max-w-[220px] rounded-lg border border-line" />
              <ul className="space-y-1.5 text-[14px] text-ink-2">
                <li><b className="text-ink">스킨 배경</b> 2000×446px — 넓은 화면 좌우까지 채우는 상단 이미지</li>
                <li><b className="text-ink">버튼 위젯 5개</b> 각 170×64px — 누르면 강의실·토지강의·도구함·미스터홈즈·상담으로 이동</li>
                <li><b className="text-ink">모바일 커버</b> 1080×1080px — 블로그 앱 첫 화면</li>
                <li className="pt-1 text-ink-3">AI 생성 72초 + 입력·적용 약 20분</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-5">
              <p className="font-bold">준비물</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
                <li>네이버 아이디 (내 블로그가 있는 계정)</li>
                <li>회원 코드 (강의·회원 안내에서 받은 코드)</li>
                <li>참고하고 싶은 홈페이지나 블로그 1곳 — 주소와 첫 화면 캡처</li>
                <li>디자인에 넣을 사진 1장 이상 (대표 프로필 등)</li>
                <li>버튼으로 연결할 주소 (카테고리·글·외부 링크)</li>
              </ul>
            </div>
            <nav aria-label="순서" className="rounded-xl border border-line bg-card p-5">
              <p className="font-bold">순서</p>
              <ol className="mt-2 grid gap-1 text-[14px]">
                {STEPS.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="flex gap-2.5 rounded-md px-1.5 py-0.5 text-ink-2 hover:bg-paper-2 hover:text-ink">
                      <span className="w-5 font-mono text-ink-3">{i + 1}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        <div className="mx-auto max-w-3xl pb-20">
          <Step n={1} id="login" title="로그인과 첫 확인" time="1분">
            <p>첫 화면에서 <b>네이버로 시작하기</b>를 눌러 로그인합니다. 처음 한 번만 약관 동의와 회원 코드 확인 화면이 나옵니다.</p>
            <Shot src="/guide/01-landing.jpg" alt="첫 화면과 네이버로 시작하기 버튼" w={1200} h={750} />
            <p><b>모두 동의합니다</b>를 체크하고, 받은 <b>회원 코드</b>를 넣은 뒤 <b>시작하기</b>를 누릅니다. 다음부터는 바로 &apos;내 디자인&apos;으로 들어갑니다.</p>
            <Shot src="/guide/02-welcome.jpg" alt="약관 동의와 회원 코드 입력 화면" w={640} h={830} caption="수집 항목·이용 목적·국외 이전(AI 처리)·보유 기간을 확인할 수 있습니다." />
            <Tip>&apos;입력하신 아이디로 로그인할 수 없습니다&apos;가 나오면 서비스가 아직 네이버 검수 전이라 등록된 아이디만 들어올 수 있는 상태입니다. 관리자에게 네이버 아이디를 알려 주세요.</Tip>
          </Step>

          <Step n={2} id="basic" title="기본 정보 입력" time="2분">
            <p>&apos;내 디자인&apos;에서 <b>+ 새 디자인 만들기</b>를 누르고 블로그 정보를 넣습니다. 블로그 이름은 디자인에 그대로 들어갑니다.</p>
            <Example label="예시 입력값">
              <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1">
                <dt className="text-ink-3">블로그 이름</dt><dd>{EX.blogName}</dd>
                <dt className="text-ink-3">한 줄 소개</dt><dd>{EX.tagline}</dd>
                <dt className="text-ink-3">업종</dt><dd>{EX.industry}</dd>
                <dt className="text-ink-3">주요 방문자</dt><dd>{EX.audience}</dd>
              </dl>
            </Example>
            <Shot src="/guide/03-basic.jpg" alt="기본 정보 입력 화면" w={1200} h={750} />
          </Step>

          <Step n={3} id="reference" title="레퍼런스 넣기" time="3분">
            <p>닮고 싶은 사이트를 알려 주는 단계입니다. 두 가지를 함께 넣으면 가장 정확합니다.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li><b>주소 분석</b>: 주소를 넣고 <b>분석</b>을 누르면 제목·색·메뉴·대표 이미지를 자동으로 읽어 옵니다. (예: <code className="rounded bg-paper-2 px-1">https://ko372.com</code>)</li>
              <li><b>화면 캡처</b>: 그 사이트 첫 화면을 캡처해 올립니다. AI 가 배치와 분위기를 가장 정확하게 읽는 자료입니다.</li>
              <li>각 레퍼런스 아래 메모에 <b>무엇을 가져올지</b> 적습니다.</li>
            </ol>
            <Shot src="/guide/04-references.jpg" alt="레퍼런스 주소 분석 결과와 캡처 이미지" w={1120} h={1006} caption="예시: 레퍼런스 2 메모 — '첫 화면 구성: 왼쪽 큰 제목·한 줄 소개, 오른쪽 인물 사진, 파란 포인트 버튼'" />
            <Tip>마음에 드는 영상이 있으면 &apos;참고 영상 올리기&apos;로 넣어도 됩니다. 영상에서 장면 6개를 뽑아 참고하고, 영상 파일 자체는 올라가지 않습니다.</Tip>
          </Step>

          <Step n={4} id="style" title="스타일과 버튼 정하기" time="4분">
            <p>원하는 느낌을 <b>분위기 태그</b>와 <b>자유 문장</b>으로 적습니다. 구체적으로 적을수록 결과가 원하는 쪽으로 나옵니다. 위치(왼쪽/오른쪽), 색, 버튼 모양을 적는 것이 요령입니다.</p>
            <Example label="예시: 스타일 요청 문장 (그대로 복사해 써도 됩니다)">
              <pre className="whitespace-pre-wrap font-sans">{EX.styleRequest}</pre>
            </Example>
            <p>그 아래 <b>버튼(메뉴) 구성</b>에 버튼 이름과 연결할 주소를 넣습니다. 네이버 위젯 규격상 한 줄에 5개가 가장 보기 좋습니다.</p>
            <Example label="예시: 버튼 5개">
              <ul className="space-y-0.5">
                {EX.menu.map(([label, link]) => (
                  <li key={label} className="flex gap-3"><span className="w-20 shrink-0 font-semibold">{label}</span><span className="break-all text-ink-3">{link}</span></li>
                ))}
              </ul>
            </Example>
            <Shot src="/guide/05-style.jpg" alt="분위기, 색상 취향, 스타일 요청, 버튼 구성 입력 화면" w={1120} h={814} />
          </Step>

          <Step n={5} id="photo" title="사진 올리기" time="1분">
            <p>디자인에 넣을 사진을 올리고, 사진마다 <b>용도</b>를 적습니다. AI 가 용도를 보고 사진을 알맞은 자리에 놓습니다.</p>
            <Shot src="/guide/06-photo.jpg" alt="사진 업로드와 용도 입력" w={1200} h={750} caption="예시: '대표 프로필 사진 (정면 상반신)'" />
            <Tip>내가 권리를 가진 사진만 올려 주세요. 큰 사진은 올릴 때 자동으로 줄어듭니다.</Tip>
          </Step>

          <Step n={6} id="generate" title="AI 디자인 만들기" time="1~2분">
            <p>확인 화면에서 입력 내용을 훑어보고 <b>디자인 만들기</b>를 누릅니다. 예시는 <b>72초</b> 걸렸습니다. 창을 닫지 말고 기다려 주세요.</p>
            <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr]">
              <Shot src="/guide/07-confirm.jpg" alt="입력 내용 확인 화면" w={1120} h={700} />
              <Shot src="/guide/07-generating.jpg" alt="디자인을 만드는 중 화면" w={720} h={600} />
            </div>
            <p>완성되면 편집기가 열리고 <b>PC 미리보기</b>에 네이버 블로그에 올렸을 때의 모습이 나옵니다.</p>
            <Shot src="/guide/08-result.jpg" alt="AI 가 만든 결과: PC 미리보기" w={1200} h={750} />
            <Example label="AI 가 레퍼런스에서 읽어 낸 것 (실제 결과의 분석 메모)">
              <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5">
                {AI_NOTE.map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="font-semibold text-ink-3">{k}</dt>
                    <dd>{v}</dd>
                  </Fragment>
                ))}
              </dl>
            </Example>
          </Step>

          <Step n={7} id="refine" title="다듬기" time="5분">
            <p>세 가지 방법으로 고칠 수 있고, 저장할 때마다 버전이 남아 언제든 되돌릴 수 있습니다.</p>
            <h3 className="pt-2 text-[17px] font-bold text-ink">말로 수정 — AI 수정 탭</h3>
            <p>바꾸고 싶은 점을 문장으로 적고 <b>AI 로 수정</b>을 누릅니다. 나머지는 그대로 두고 요청한 부분만 바뀝니다.</p>
            <Example label="예시 요청">{EX.revise}</Example>
            <Shot src="/guide/11-ai-revise.jpg" alt="AI 수정 탭에 수정 요청을 적은 모습" w={1200} h={750} />
            <h3 className="pt-2 text-[17px] font-bold text-ink">직접 편집 — 상단 편집 · 요소 · 버튼 탭</h3>
            <p><b>상단 편집</b>에서 글자나 사진을 클릭해 끌어 옮기고, 오른쪽 아래 점을 끌어 크기를 바꿉니다. 분홍 점선은 네이버 타이틀 영역, 하늘색 칸은 버튼이 놓일 자리입니다.</p>
            <Shot src="/guide/09-edit-hero.jpg" alt="상단 편집에서 제목 요소를 선택한 모습" w={1200} h={750} />
            <p><b>버튼</b> 탭에서 버튼 이름·보조 문구·링크·모양을 바꿉니다. 링크가 비어 있으면 노란 경고가 나옵니다.</p>
            <Shot src="/guide/12-buttons.jpg" alt="버튼 탭" w={1200} h={750} />
            <h3 className="pt-2 text-[17px] font-bold text-ink">모바일 커버 확인</h3>
            <Shot src="/guide/10-mobile.jpg" alt="모바일 커버 화면" w={1200} h={750} />
            <Tip>단축키: 저장 Ctrl+S · 실행 취소 Ctrl+Z · 선택한 요소 이동 방향키(Shift 를 누르면 10px씩)</Tip>
          </Step>

          <Step n={8} id="export" title="내보내기" time="2분">
            <p>오른쪽 위 <b>내보내기 →</b>를 누릅니다. 마지막으로 저장한 디자인이 실제 크기 PNG 로 만들어집니다. <b>전체 ZIP 받기</b>로 한 번에 내려받으세요.</p>
            <Shot src="/guide/14-export.jpg" alt="내보내기 화면: 스킨 배경과 버튼 위젯 이미지" w={1200} h={750} />
            <p>이어서 <b>위젯 이미지 주소 만들기</b>를 누르면 버튼마다 네이버에 붙여넣을 코드가 생깁니다. <b>코드 복사</b>로 하나씩 복사합니다.</p>
            <Shot src="/guide/15-widget-code.jpg" alt="버튼 위젯 붙여넣기 코드" w={1200} h={750} />
          </Step>

          <Step n={9} id="apply" title="네이버 블로그에 적용" time="5분">
            <p>네이버 블로그 → <b>관리</b> → <b>꾸미기 설정</b>에서 진행합니다. 예시 디자인에 맞춘 값입니다.</p>
            <ol className="list-decimal space-y-2.5 pl-5">
              <li><b>레이아웃</b>: 디자인 설정 → 레이아웃·위젯 설정에서 <b>1단(가운데 본문)</b>을 고르고, 필요 없는 기본 위젯은 끕니다.</li>
              <li><b>스킨 배경</b>: 세부 디자인 설정(리모콘) → 스킨배경 → 직접등록 → 상단 영역에 <code className="rounded bg-paper-2 px-1">skin-background.png</code>, 가운데 정렬·반복 없음. 배경색은 <code className="rounded bg-paper-2 px-1">#F4F6FA</code>.</li>
              <li><b>타이틀</b>: 리모콘 → 타이틀에서 블로그 제목 표시를 끄고 디자인은 &apos;사용 안 함(투명)&apos;, 영역 높이 <b>300px</b>.</li>
              <li><b>메뉴 바</b>: 예시는 메뉴 바를 숨기는 디자인입니다. 리모콘 → 블로그 메뉴에서 상단 메뉴를 숨깁니다.</li>
              <li><b>버튼 위젯</b>: 레이아웃·위젯 설정 → 위젯 직접등록에서 버튼마다 위젯을 하나씩 만들어 복사한 코드를 붙여넣고(5개), 본문 위쪽에 왼쪽부터 순서대로 놓은 뒤 적용합니다.</li>
              <li><b>모바일</b>: 블로그 앱 → 내 블로그 → 홈편집 → 커버 이미지에 <code className="rounded bg-paper-2 px-1">mobile-cover.png</code>.</li>
            </ol>
            <Tip>네이버 관리 화면은 가끔 메뉴 이름이 바뀝니다. 같은 이름이 없으면 &apos;리모콘&apos;, &apos;위젯 직접등록&apos;을 찾아 같은 순서로 진행하세요.</Tip>
          </Step>

          <section className="mt-14 rounded-2xl border border-line bg-card p-6">
            <h2 className="text-[20px] font-extrabold tracking-tight">자주 묻는 질문</h2>
            <dl className="mt-4 space-y-4 text-[14.5px] leading-relaxed">
              <div><dt className="font-bold">생성이 오래 걸려요.</dt><dd className="text-ink-2">레퍼런스 이미지가 많으면 1~3분 걸립니다. 시간당 생성 횟수에 한도가 있어 여러 번 연달아 누르지 않는 것이 좋습니다.</dd></div>
              <div><dt className="font-bold">결과가 레퍼런스와 많이 달라요.</dt><dd className="text-ink-2">화면 캡처를 꼭 넣고, 메모에 &apos;무엇을&apos; 가져올지(배치, 버튼 모양, 색) 적어 주세요. 그 뒤 AI 수정 탭에서 한 가지씩 요청하면 원하는 쪽으로 다가갑니다.</dd></div>
              <div><dt className="font-bold">네이버에서 버튼 이미지가 안 보여요.</dt><dd className="text-ink-2">내보내기에서 &apos;위젯 이미지 주소 만들기&apos;를 누른 뒤 생긴 코드를 써야 합니다. 디자인을 바꾸면 내보내기를 다시 해서 새 코드를 붙여넣으세요.</dd></div>
              <div><dt className="font-bold">만든 디자인을 지우고 싶어요.</dt><dd className="text-ink-2">&apos;내 디자인&apos;에서 삭제할 수 있고, &apos;계정&apos;에서 탈퇴하면 모든 데이터가 바로 지워집니다.</dd></div>
            </dl>
          </section>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="rounded-lg bg-accent px-5 py-3 text-[15px] font-bold text-white hover:bg-accent-ink">내 홈형 블로그 만들기 →</Link>
            <a href="#login" className="text-[14px] font-semibold text-ink-3 hover:text-ink">처음부터 다시 보기</a>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
