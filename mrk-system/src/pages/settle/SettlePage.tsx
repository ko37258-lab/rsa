import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { dDay, fmt, won } from "@/lib/format";
import type { Tone } from "@/lib/codes";
import { Badge, Button, DataTable, EmptyState, ErrorBox, Field, Input, KeyValue, LinkButton, Loading, Money, PageHeader, SearchBox, Segmented, Sheet, StatTile, type Column } from "@/components/ui";
import { MONEY_KEYS, type MoveOutRow } from "@/pages/leases/types";
import { LeaseStatusBadge, PartyName } from "@/pages/leases/parts";
import { SettlementPanel } from "@/pages/leases/SettlementPanel";
import { LeaseCreateDialog } from "@/pages/leases/LeaseCreateDialog";

const STAGE: Record<MoveOutRow["stage"], { label: string; tone: Tone }> = {
  upcoming: { label: "퇴실 예정", tone: "info" },
  settling: { label: "정산 중", tone: "brass" },
  refund_wait: { label: "반환 대기", tone: "warn" },
  refunded: { label: "반환 완료", tone: "good" },
};
type Filter = "all" | MoveOutRow["stage"];

export default function SettlePage() {
  const [sp, setSp] = useSearchParams();
  const { branchId, branch, today } = useBranch();
  const q = useApi<MoveOutRow[]>(["settle", branchId], `/api/leases/move-outs?branch_id=${branchId}`);
  const filter = (["upcoming", "settling", "refund_wait", "refunded"].includes(sp.get("view") ?? "") ? sp.get("view") : "all") as Filter;
  const search = sp.get("q") ?? "";
  const peekId = sp.get("lease");
  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
      return n;
    }, { replace: true });

  const rows = q.data ?? [];
  const visible = useMemo(() => {
    const n = search.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.stage === filter) && (!n || [r.unit_code, r.contractor?.name].join(" ").toLowerCase().includes(n)));
  }, [rows, filter, search]);
  const peek = rows.find((r) => r.id === peekId) ?? null;
  const count = (s: Filter) => (s === "all" ? rows.length : rows.filter((r) => r.stage === s).length);
  const waiting = rows.filter((r) => r.stage === "refund_wait" || r.stage === "settling");

  const columns: Column<MoveOutRow>[] = [
    { id: "unit", header: "호실", sort: (r) => r.unit_code.padStart(6, "0"), cell: (r) => <span className="font-semibold">{r.unit_code}호</span> },
    { id: "who", header: "계약자", sort: (r) => r.contractor?.name ?? "", cell: (r) => <PartyName party={r.contractor} /> },
    {
      id: "out",
      header: "퇴실일",
      sort: (r) => r.move_out_date ?? r.end_date,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <div>{fmt(r.move_out_date ?? r.end_date, "M.d (EEE)")}</div>
          <div className="text-xs text-ink3">{dDay(r.move_out_date ?? r.end_date, today)}</div>
        </div>
      ),
    },
    { id: "stage", header: "단계", sort: (r) => Object.keys(STAGE).indexOf(r.stage), cell: (r) => <Badge tone={STAGE[r.stage].tone}>{STAGE[r.stage].label}</Badge> },
    { id: "deposit", header: "받아 둔 보증금", align: "right", sort: (r) => r.deposit_total, cell: (r) => <Money value={r.deposit_total} /> },
    { id: "unpaid", header: "미납", align: "right", sort: (r) => r.unpaid, cell: (r) => (r.unpaid ? <span className="num text-bad">−{r.unpaid.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>) },
    { id: "ded", header: "차감", align: "right", hideOnMobile: true, sort: (r) => r.deduction_total, cell: (r) => (r.deduction_total ? <span className="num">−{r.deduction_total.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>) },
    {
      id: "refund",
      header: "돌려줄 돈",
      align: "right",
      sort: (r) => r.refund_amount,
      cell: (r) => (r.refund_amount < 0 ? <span className="num font-semibold text-bad">추가 청구 {(-r.refund_amount).toLocaleString("ko-KR")}</span> : <Money value={r.refund_amount} strong />),
    },
  ];

  return (
    <>
      <PageHeader title="정산" subtitle={`${branch?.name ?? "전 지점"} · 퇴실하는 계약의 보증금 정산과 반환`} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatTile label="30일 안 퇴실 예정" value={count("upcoming")} unit="건" note="연장 여부를 먼저 확인한다" />
            <StatTile label="정산 중" value={count("settling")} unit="건" tone={count("settling") ? "warn" : undefined} note="퇴실했지만 정산 확정 전" />
            <StatTile label="반환 대기" value={waiting.reduce((s, r) => s + Math.max(0, r.refund_amount), 0).toLocaleString("ko-KR")} unit="원" tone={count("refund_wait") ? "warn" : undefined} note={`정산 중 포함 ${waiting.length}건`} />
            <StatTile label="최근 45일 반환" value={rows.filter((r) => r.stage === "refunded").reduce((s, r) => s + r.refund_amount, 0).toLocaleString("ko-KR")} unit="원" note={`${count("refunded")}건`} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Filter>
              size="sm"
              value={filter}
              onChange={(v) => update({ view: v === "all" ? null : v })}
              options={[
                { value: "all", label: "전체", count: count("all") },
                { value: "upcoming", label: "퇴실 예정", count: count("upcoming") },
                { value: "settling", label: "정산 중", count: count("settling") },
                { value: "refund_wait", label: "반환 대기", count: count("refund_wait") },
                { value: "refunded", label: "반환 완료", count: count("refunded") },
              ]}
            />
            <div className="ml-auto w-full sm:w-auto">
              <SearchBox id="settle-search" value={search} onChange={(v) => update({ q: v })} placeholder="호실, 계약자" />
            </div>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="정산할 계약이 없다" body="30일 안에 만료되거나 퇴실 처리한 계약이 여기에 모인다" />
          ) : (
            <DataTable rows={visible} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => update({ lease: r.id })} selectedKey={peekId} empty="조건에 맞는 계약이 없다" />
          )}
        </div>
      )}
      <Sheet
        open={!!peek}
        onClose={() => update({ lease: null })}
        title={peek ? `${peek.unit_code}호 · ${peek.contractor?.name ?? ""} 정산` : ""}
        subtitle={peek ? `${fmt(peek.start_date)} ~ ${fmt(peek.end_date)} · ${peek.branch_name}` : undefined}
        actions={peek && <LinkButton size="sm" to={`/leases/${peek.id}?tab=settle`}>계약 열기</LinkButton>}
      >
        {peek && <SettleSheet row={peek} />}
      </Sheet>
    </>
  );
}

function SettleSheet({ row }: { row: MoveOutRow }) {
  const { today } = useBranch();
  const [outDate, setOutDate] = useState(row.end_date < today ? row.end_date : today);
  const [renewing, setRenewing] = useState(false);
  const go = useApiMutation({ invalidate: MONEY_KEYS, success: "계약 상태를 바꿨다" });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <LeaseStatusBadge status={row.status} />
        <Badge tone={STAGE[row.stage].tone}>{STAGE[row.stage].label}</Badge>
      </div>
      <KeyValue
        items={[
          ["연락처", row.contractor?.phone || "—"],
          ["만료일", `${fmt(row.end_date)} (${dDay(row.end_date, today)})`],
          ["월세", won(row.rent)],
          ["퇴실청소비", won(row.cleaning_fee)],
        ]}
      />
      {row.status === "occupied" && (
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <p className="text-sm">아직 거주 중이다. 연장하지 않으면 나가는 날 퇴실 처리하고 정산한다.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="퇴실일" htmlFor="settle-out">
              <Input id="settle-out" type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} />
            </Field>
            <Button variant="primary" loading={go.isPending} onClick={() => go.mutate({ path: `/api/leases/${row.id}/transition`, body: { to: "closing", date: outDate } })}>
              퇴실 처리
            </Button>
            {row.renewal_id ? (
              <LinkButton to={`/leases/${row.renewal_id}`}>재계약 보기</LinkButton>
            ) : (
              <Button onClick={() => setRenewing(true)}>연장 계약 작성</Button>
            )}
          </div>
          {go.error && <p className="text-xs text-bad">{go.error.message}</p>}
        </div>
      )}
      {renewing && <LeaseCreateDialog open onClose={() => setRenewing(false)} initial={{ renewOf: row.id }} />}
      <SettlementPanel leaseId={row.id} leaseStatus={row.status} />
      {row.status === "closing" && (row.settlement_status === "confirmed" || row.settlement_status === "refunded") && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-line p-3">
          <p className="text-sm text-ink2">정산을 확정했다. 계약을 닫으면 «끝남» 으로 옮겨진다.</p>
          <Button variant="primary" loading={go.isPending} onClick={() => go.mutate({ path: `/api/leases/${row.id}/transition`, body: { to: "closed" } })}>
            계약 종료
          </Button>
        </div>
      )}
    </div>
  );
}
