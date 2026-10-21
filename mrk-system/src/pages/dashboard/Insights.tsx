import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge, Loading, ErrorBox } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import type { Tone } from "@/lib/codes";
import type { Insight } from "./ops-api";

const TONE: Record<Insight["tone"], { label: string; tone: Tone }> = {
  bad: { label: "위험", tone: "bad" },
  warn: { label: "주의", tone: "warn" },
  info: { label: "참고", tone: "info" },
  good: { label: "좋음", tone: "good" },
};

/**
 * MR.K 인사이트 — 원본 PMS 에 없던 기능.
 * 대시보드와 같은 데이터에서 규칙으로 "오늘 먼저 볼 것" 을 뽑는다(외부 AI 호출 없음).
 */
export function Insights({ branchId }: { branchId: string }) {
  const q = useApi<Insight[]>(["dashboard", "insights", branchId], `/api/insights?branch_id=${branchId}`);
  return (
    <section className="min-w-0 rounded-md border border-brass/35 bg-brass/[0.04]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-brass/25 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
            <Sparkles className="size-4 text-brass" />
            MR.K 인사이트
          </h2>
          <p className="mt-0.5 max-w-[68ch] text-xs leading-relaxed text-ink3">
            이 화면과 같은 데이터에서 규칙으로 뽑은 오늘 먼저 볼 것. 위험 → 주의 → 참고 → 좋음 순서다.
          </p>
        </div>
      </header>
      <div className="p-4">
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} />
        ) : !q.data?.length ? (
          <p className="text-sm text-ink3">지금 따로 짚을 것이 없다</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {q.data.map((it) => (
              <li key={it.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={TONE[it.tone].tone}>{TONE[it.tone].label}</Badge>
                  {it.metric && <span className="num truncate text-sm font-semibold text-ink">{it.metric}</span>}
                </div>
                <h3 className="text-sm font-semibold leading-snug text-ink">{it.title}</h3>
                <p className="flex-1 text-xs leading-relaxed text-ink2">{it.body}</p>
                {it.to && (
                  <Link to={it.to} className="inline-flex items-center gap-1 self-start text-xs font-medium text-brass hover:underline">
                    바로 가기 <ArrowRight className="size-3" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
