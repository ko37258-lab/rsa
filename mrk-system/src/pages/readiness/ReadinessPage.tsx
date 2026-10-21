import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { PageHeader, StatTile, DataTable, Segmented, SearchBox, Badge, Button, Dialog, Field, Textarea, Loading, ErrorBox, EmptyState, type Column } from "@/components/ui";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { LEASE_STATUS } from "@/lib/codes";
import { fmt, pct, won } from "@/lib/format";
import type { ReadinessKind, ReadinessRes, ReadinessRow } from "@/pages/dashboard/ops-api";

const KIND_LABEL: Record<ReadinessKind, string> = { deposit_short: "보증금·선납 미수", unpaid: "월세·관리비 미납" };

function MoneyCheck({ amount, confirmed, onConfirm, extra }: { amount: number; confirmed: boolean; onConfirm: () => void; extra?: string }) {
  if (!amount) return <span className="text-ink3">—</span>;
  if (confirmed)
    return (
      <span className="inline-flex items-center gap-1 text-ink3" title="받지 못한 돈으로 확정했다">
        <CheckCircle2 className="size-3.5 text-good" />
        <span className="num line-through">{amount.toLocaleString("ko-KR")}</span>
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <span className="num font-semibold text-bad">{amount.toLocaleString("ko-KR")}</span>
      {extra && <span className="text-xs text-ink3">{extra}</span>}
      <button
        type="button"
        className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink2 hover:bg-sunken"
        onClick={(e) => {
          e.stopPropagation();
          onConfirm();
        }}
      >
        확정
      </button>
    </span>
  );
}

export default function ReadinessPage() {
  const { branchId } = useBranch();
  const nav = useNavigate();
  const q = useApi<ReadinessRes>(["readiness", branchId], `/api/readiness?branch_id=${branchId}`);
  const [view, setView] = useState<"open" | "all">("open");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ row: ReadinessRow; kind: ReadinessKind } | null>(null);
  const [reason, setReason] = useState("");
  const confirm = useApiMutation({
    invalidate: [["readiness"]],
    success: "확정했습니다",
    onSuccess: () => {
      setTarget(null);
      setReason("");
    },
  });

  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    const s = search.trim().toLowerCase();
    return all.filter((r) => (view === "all" || !r.ready) && (!s || r.unit_code.includes(s) || r.contractor_name.toLowerCase().includes(s)));
  }, [q.data, view, search]);

  const showBranch = branchId === "all";
  const columns: Column<ReadinessRow>[] = [
    {
      id: "room",
      header: "호실",
      cell: (r) => (
        <div>
          <div className="font-semibold">{r.unit_code}호</div>
          {showBranch && <div className="text-xs text-ink3">{r.branch_name}</div>}
        </div>
      ),
      sort: (r) => `${r.branch_name}${r.unit_code}`,
    },
    {
      id: "who",
      header: "계약자",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate">{r.contractor_name}</div>
          <div className="text-xs text-ink3">
            {LEASE_STATUS[r.lease_status].label} · {fmt(r.end_date, "yy.M.d")} 만료
          </div>
        </div>
      ),
      sort: (r) => r.contractor_name,
    },
    { id: "dep", header: "보증금·선납 미수", align: "right", cell: (r) => <MoneyCheck amount={r.deposit_short.amount} confirmed={r.deposit_short.confirmed} onConfirm={() => setTarget({ row: r, kind: "deposit_short" })} />, sort: (r) => r.deposit_short.amount },
    { id: "unpaid", header: "월세·관리비 미납", align: "right", cell: (r) => <MoneyCheck amount={r.unpaid.amount} confirmed={r.unpaid.confirmed} extra={r.unpaid.days ? `${r.unpaid.days}일` : undefined} onConfirm={() => setTarget({ row: r, kind: "unpaid" })} />, sort: (r) => r.unpaid.amount },
    { id: "qa", header: "질문", align: "center", cell: (r) => (r.qa.count ? <Badge tone={r.qa.blocks_invoice ? "bad" : "warn"}>{r.qa.blocks_invoice ? `청구 막힘 ${r.qa.count}` : `${r.qa.count}건`}</Badge> : <span className="text-ink3">—</span>), sort: (r) => r.qa.count },
    { id: "renewal", header: "연장·퇴실", align: "center", cell: (r) => (r.renewal ? <Badge tone="warn">미정 · D-{r.renewal.days_left}</Badge> : <span className="text-ink3">—</span>), sort: (r) => r.renewal?.days_left ?? null },
    {
      id: "left",
      header: "남은 일",
      cell: (r) => (r.ready ? <Badge tone="good">준비 끝</Badge> : <span className="text-xs text-ink2">{r.left.join(" · ")}</span>),
      sort: (r) => r.left.length,
    },
  ];

  const d = q.data;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="운영 준비"
        subtitle={d ? `${fmt(d.as_of, "M월 d일")} 기준 · ${fmt(d.until, "M월 d일")}까지 시작·끝나는 계약 포함. 청구서를 보내기 전에 호실마다 걸린 일을 끝낸다.` : "청구 준비를 불러오는 중"}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error || !d ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="모수 (계약 있는 호실 / 전체 호실)" value={`${d.contracted_units} / ${d.total_units}`} unit="실" />
            <StatTile label="준비 끝" value={d.ready_count} unit="실" note={pct(d.contracted_units ? d.ready_count / d.contracted_units : null, 0)} tone={d.ready_count === d.contracted_units ? "good" : undefined} />
            <StatTile label="보증금·선납 미수" value={d.counts.deposit_short} unit="실" tone={d.counts.deposit_short ? "bad" : undefined} />
            <StatTile label="월세·관리비 미납" value={d.counts.unpaid} unit="실" tone={d.counts.unpaid ? "bad" : undefined} />
            <StatTile label="질문" value={d.counts.qa} unit="실" tone={d.counts.qa ? "warn" : undefined} to="/qa" />
            <StatTile label="연장·퇴실 미정" value={d.counts.renewal} unit="실" tone={d.counts.renewal ? "warn" : undefined} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "open", label: "미통과", count: d.rows.filter((r) => !r.ready).length },
                { value: "all", label: "전체", count: d.rows.length },
              ]}
            />
            <SearchBox id="readiness-search" value={search} onChange={setSearch} placeholder="호실, 계약자" />
          </div>

          {view === "open" && d.rows.every((r) => r.ready) ? (
            <EmptyState title="모든 호실이 준비 끝입니다" body="이번 달 청구서를 보내도 된다" />
          ) : (
            <DataTable rows={rows} columns={columns} rowKey={(r) => r.lease_id} onRowClick={(r) => nav(`/leases/${r.lease_id}`)} empty="조건에 맞는 호실이 없다" />
          )}
        </>
      )}

      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `${target.row.unit_code}호 ${KIND_LABEL[target.kind]} 확정` : ""}
        description={
          target
            ? `${won(target.kind === "unpaid" ? target.row.unpaid.amount : target.row.deposit_short.amount)}을 실제로 받지 못한 돈으로 확정합니다. 금액이 바뀌면 다시 미통과가 됩니다.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setTarget(null)}>취소</Button>
            <Button
              variant="primary"
              loading={confirm.isPending}
              disabled={!reason.trim()}
              onClick={() =>
                target &&
                confirm.mutate({
                  path: "/api/readiness/confirm",
                  body: { lease_id: target.row.lease_id, kind: target.kind, amount: target.kind === "unpaid" ? target.row.unpaid.amount : target.row.deposit_short.amount, reason },
                })
              }
            >
              확정
            </Button>
          </>
        }
      >
        <Field label="근거" htmlFor="readiness-reason" hint="누가 언제 확인했는지, 이 돈을 어떻게 처리할지 적는다">
          <Textarea id="readiness-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 담당자 확인 10/14, 11월 청구에 함께 청구" />
        </Field>
      </Dialog>
    </div>
  );
}
