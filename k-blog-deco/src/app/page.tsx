import { Suspense } from "react";
import { LoginActions } from "@/components/login-actions";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/site-footer";

const STEPS = [
  {
    n: "01",
    title: "레퍼런스를 넣으세요",
    body: "마음에 드는 홈페이지·블로그 주소, 화면 캡처, 참고 영상을 올리고 '이런 느낌으로'를 말로 적습니다.",
  },
  {
    n: "02",
    title: "AI 가 디자인합니다",
    body: "레퍼런스의 색·여백·글자 크기·버튼 모양을 분석해 내 블로그 이름과 사진으로 다시 짓습니다.",
  },
  {
    n: "03",
    title: "말로 고치고, 붙여넣기",
    body: "“버튼 더 둥글게” 처럼 말하거나 직접 끌어서 고친 뒤, 스킨 이미지와 위젯 코드를 네이버에 붙여넣습니다.",
  },
];

const OUTPUTS = [
  ["스킨 배경 이미지", "와이드 화면까지 채우는 2000px 상단 디자인"],
  ["버튼 위젯 세트", "카테고리·상담·오시는 길 버튼 이미지 + 붙여넣기 코드"],
  ["모바일 커버", "블로그 앱 첫 화면용 정사각 커버"],
  ["적용 가이드", "리모콘·위젯 직접등록 순서를 단계별로"],
];

function MockBlog() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line-2 bg-card shadow-[0_30px_60px_-30px_rgba(26,26,25,0.35)]">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <span className="size-2.5 rounded-full bg-line-2" />
        <span className="size-2.5 rounded-full bg-line-2" />
        <span className="size-2.5 rounded-full bg-line-2" />
        <span className="ml-3 rounded bg-paper-2 px-2 py-0.5 text-[10px] text-ink-3">blog.naver.com/myblog</span>
      </div>
      <div className="relative overflow-hidden bg-[linear-gradient(180deg,#14284B,#24467F)] px-6 pb-5 pt-7 text-white">
        <div className="absolute -left-10 -top-10 size-40 rounded-full bg-[#C9A646]/20" />
        <p className="text-[10px] font-bold tracking-[0.25em] text-[#C9A646]">REAL ESTATE CONSULTING</p>
        <p className="mt-2 text-2xl font-extrabold tracking-tight">새봄 토지연구소</p>
        <p className="mt-1 text-xs text-white/70">땅의 가치를 읽는 부동산 공법 이야기</p>
        <div className="mt-5 grid grid-cols-5 gap-1.5">
          {["대표 소개", "추천 매물", "투자 칼럼", "상담 문의", "오시는 길"].map((t) => (
            <span key={t} className="rounded-md bg-white/95 py-2 text-center text-[10px] font-bold text-[#14284B]">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2 bg-[#F4F6FA] px-6 py-4">
        <div className="h-2 w-2/3 rounded bg-line-2" />
        <div className="h-2 w-1/2 rounded bg-line" />
        <div className="h-2 w-3/5 rounded bg-line" />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-5">
        <Logo className="text-base" />
        <a href="/guide" className="ml-auto text-[13px] font-semibold text-ink-3 hover:text-ink">
          따라하기 가이드
        </a>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line-2 bg-card px-3 py-1 text-xs font-semibold text-ink-2">
            <span className="size-1.5 rounded-full bg-accent" />
            MR.K 회원 전용 · 네이버 홈페이지형 블로그
          </p>
          <h1 className="text-[40px] font-extrabold leading-[1.15] tracking-[-0.03em] sm:text-[52px]">
            레퍼런스만 보여주세요.
            <br />
            <span className="text-accent">홈페이지형 블로그</span>는
            <br />
            AI 가 만듭니다.
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-ink-2">
            마음에 드는 사이트 주소나 캡처, 참고 영상을 넣고 원하는 스타일을 적으면 네이버 블로그에 바로 붙여넣을
            스킨 이미지·버튼 위젯·모바일 커버를 만들어 드립니다. 만든 뒤에도 말로, 손으로 계속 고칠 수 있습니다.
          </p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-13" />}>
              <LoginActions />
            </Suspense>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              처음 로그인하면 <a href="/terms" className="underline">이용약관</a>·<a href="/privacy" className="underline">개인정보처리방침</a> 동의와 회원 코드 확인을 한 번 거칩니다.
              처음이라면 <a href="/guide" className="font-semibold text-accent-ink underline">따라하기 가이드</a>를 먼저 보세요.
            </p>
          </div>
        </div>
        <MockBlog />
      </section>

      <section id="how" className="border-y border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <p className="font-mono text-sm font-bold text-accent">{s.n}</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight">{s.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-extrabold tracking-tight">한 번에 받는 결과물</h2>
        <dl className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {OUTPUTS.map(([t, d]) => (
            <div key={t} className="bg-card p-6">
              <dt className="font-bold">{t}</dt>
              <dd className="mt-1 text-sm text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          네이버는 블로그 스킨을 바꾸는 공개 API 를 제공하지 않습니다. 그래서 결과물은 이미지와 코드로 드리고, 적용은 안내에 따라 몇
          번의 붙여넣기로 끝납니다. 모든 기능은 REST API 로도 연동할 수 있습니다.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
