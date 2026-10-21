import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader, Section, DataTable, Loading, ErrorBox, type Column } from "@/components/ui";
import { Meter } from "@/components/charts";
import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { fmt, man, pct } from "@/lib/format";
import { TodayTiles, TodayMoves } from "./TodayTiles";
import { Insights } from "./Insights";
import { Analytics } from "./Analytics";
import { NoUnits, StartChecklist } from "./Onboarding";
import type { BranchCompare, DashboardRes } from "./ops-api";

const branchCols: Column<BranchCompare>[] = [
  { id: "name", header: "지점", cell: (r) => <span className="font-medium">{r.name}</span>, sort: (r) => r.name },
  { id: "units", header: "운영 호실", align: "right", cell: (r) => `${r.units}실`, sort: (r) => r.units },
  {
    id: "occ",
    header: "오늘 점유율",
    align: "right",
    cell: (r) => (
      <div className="ml-auto flex w-28 items-center gap-2">
        <Meter value={r.occupancy_today} />
        <span className="num w-12 text-right">{pct(r.occupancy_today, 0)}</span>
      </div>
    ),
    sort: (r) => r.occupancy_today,
  },
  { id: "cr", header: "이번 달 계약율", align: "right", cell: (r) => pct(r.contract_rate_month), sort: (r) => r.contract_rate_month },
  { id: "vacant", header: "판매 가능", align: "right", cell: (r) => `${r.vacant}실`, sort: (r) => r.vacant },
  { id: "od", header: "연체", align: "right", cell: (r) => (r.overdue ? <span className="text-bad">{r.overdue}명 · {man(r.overdue_amount)}</span> : <span className="text-ink3">없음</span>), sort: (r) => r.overdue_amount },
  { id: "aw", header: "답장 대기", align: "right", cell: (r) => (r.awaiting ? <span className="text-warn">{r.awaiting}건</span> : <span className="text-ink3">없음</span>), sort: (r) => r.awaiting },
];

export default function DashboardPage() {
  const { branchId, branch, setBranchId } = useBranch();
  const q = useApi<DashboardRes>(["dashboard", branchId], `/api/dashboard?branch_id=${branchId}`);
  const { hash } = useLocation();

  // /dashboard#occupancy 로 들어오면 분석 영역으로 내린다(원본 /analytics 경로 호환)
  useEffect(() => {
    if (hash !== "#occupancy") return;
    const t = setTimeout(() => document.getElementById("occupancy")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="대시보드"
        subtitle={
          q.data ? (
            <>
              {branch ? branch.name : "전 지점"} · {fmt(q.data.as_of, "M월 d일 (EEE)")} 기준 · 운영 {q.data.operated_units}실
            </>
          ) : (
            "오늘 현황을 불러오는 중"
          )
        }
        actions={
          <Link to="/dashboard#occupancy" className="text-sm font-medium text-brass hover:underline">
            분석으로 내려가기
          </Link>
        }
      />

      {q.isLoading ? (
        <Loading label="오늘 현황을 불러오는 중" />
      ) : q.error || !q.data ? (
        <ErrorBox error={q.error} />
      ) : q.data.operated_units === 0 && !q.data.branches?.some((b) => b.units > 0) ? (
        <>
          <StartChecklist />
          <NoUnits />
        </>
      ) : (
        <>
          <StartChecklist />
          <section aria-label="오늘 현황" className="flex flex-col gap-3">
            <h2 className="label-caps">오늘 현황</h2>
            <TodayTiles data={q.data} />
          </section>

          <Insights branchId={branchId} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Section title="입주·퇴실" hint="재계약은 입주·퇴실로 세지 않는다">
              <TodayMoves data={q.data} />
            </Section>
            {q.data.branches ? (
              <Section title="지점 비교" hint="연체는 납기 3일 지난 미납이 있는 납부자. 행을 누르면 그 지점으로 바꾼다." bodyClassName="p-3">
                <DataTable rows={q.data.branches} columns={branchCols} rowKey={(r) => r.id} onRowClick={(r) => setBranchId(r.id)} />
              </Section>
            ) : (
              <Section title="이 지점" hint="전 지점과 견주려면 위에서 «전 지점»을 고른다">
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-ink3">주소</dt>
                    <dd>{branch?.address}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink3">대표 전화</dt>
                    <dd className="num">{branch?.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink3">받는 메일</dt>
                    <dd className="break-all">{branch?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink3">입금 계좌</dt>
                    <dd className="num">{branch?.bank_account}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink3">문을 연 날</dt>
                    <dd className="num">{fmt(branch?.opened_on)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink3">수수료 조건</dt>
                    <dd>
                      {branch?.commission.structure === "rate"
                        ? `매출 × ${(branch.commission.rate_bp / 100).toFixed(1)}%`
                        : `매출 − 고정 지급 ${man(branch?.commission.fixed_amount)}`}
                    </dd>
                  </div>
                </dl>
              </Section>
            )}
          </div>
        </>
      )}

      {(!q.data || q.data.operated_units > 0) && (
      <section id="occupancy" aria-label="운영 분석" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-line pt-6">
          <div>
            <h2 className="text-lg font-semibold">운영 분석</h2>
            <p className="mt-0.5 max-w-[80ch] text-xs leading-relaxed text-ink3">
              RevPAR = 월세 매출 ÷ 운영 호실. AMR은 정가 기준. 공실 손실 = 운영 중인데 계약 없는 호실-일 × 룸타입 정가 중앙값 ÷ 그 달 일수. 위 카드는 마감된 지난달 값이다.
            </p>
          </div>
        </div>
        <Analytics branchId={branchId} />
      </section>
      )}
    </div>
  );
}
