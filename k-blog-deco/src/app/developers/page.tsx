import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { DevelopersClient } from "./developers-client";
import { ENDPOINT_LIST } from "@/lib/api/openapi";

export default function DevelopersPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-10">
        <h1 className="text-[28px] font-extrabold tracking-tight">API 연동</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
          웹 화면의 모든 기능(프로젝트 생성, AI 생성·수정, 디자인 저장, 버전, 이미지 업로드, 레퍼런스 분석, 위젯 코드)은 아래 REST API 로 똑같이
          쓸 수 있습니다. 자동화 도구·사내 시스템에서는 개인 API 토큰으로 호출하세요.
        </p>

        <Suspense>
          <DevelopersClient />
        </Suspense>

        <section className="mt-12">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-extrabold">엔드포인트</h2>
            <a href="/api/openapi.json" target="_blank" className="text-[13px] font-semibold text-accent-ink underline">OpenAPI 명세 (JSON)</a>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-paper-2 text-[12px] text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">메서드</th>
                  <th className="px-4 py-2.5 font-semibold">경로</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ENDPOINT_LIST.map((e) => (
                  <tr key={e.method + e.path}>
                    <td className="px-4 py-2.5 font-mono text-[12px] font-bold">{e.method}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{e.path}</td>
                    <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-extrabold">예시: 레퍼런스 없이 바로 생성</h2>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-ink p-5 text-[12px] leading-relaxed text-white scroll-thin"><code>{`# 1) 프로젝트 만들기
curl -X POST $HOST/api/v1/projects \\
  -H "Authorization: Bearer $KBD_TOKEN" -H "Content-Type: application/json" \\
  -d '{"brief":{"blogName":"새봄 토지연구소","industry":"부동산 컨설팅",
       "styleRequest":"신뢰감 있는 네이비, 버튼은 흰색 알약 모양",
       "menu":[{"label":"상담 문의","link":"https://blog.naver.com/..."}]}}'

# 2) AI 디자인 생성 (응답에 design JSON 포함)
curl -X POST $HOST/api/v1/projects/{id}/generate -H "Authorization: Bearer $KBD_TOKEN"

# 3) 말로 수정
curl -X POST $HOST/api/v1/projects/{id}/revise \\
  -H "Authorization: Bearer $KBD_TOKEN" -H "Content-Type: application/json" \\
  -d '{"instruction":"제목을 더 크게, 배경은 조금 더 밝게"}'`}</code></pre>
        </section>
      </main>
    </>
  );
}
