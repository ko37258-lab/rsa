import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, fmt } from "@/lib/format";
import { CHARGE_KIND } from "@/lib/codes";
import { Badge, Button, DataTable, EmptyState, ErrorBox, Loading, Money, PageHeader, SearchBox, Segmented, Sheet, StatTile, type Column } from "@/components/ui";
import type { ChargeKind } from "@/types";
import type { PayerRow } from "@/pages/billing/api";
import { Receipts } from "./Receipts";
import { PaymentDialog } from "./ReceiptDialogs";
import { usePayers, type Upd } from "./hooks";

interface HistoryRow {
  id: string;
  type: "charge" | "payment";
  date: string;
  label: string;
  kind: string;
  amount: number;
  left: number;
  status: string;
  unit_code: string | null;
}

type PayerFilter = "all" | "overdue" | "short" | "credit";

export default function CollectionsPage() {
  const [sp, setSp] = useSearchParams();
  const { branch } = useBranch();
  const view = sp.get("view") === "receipts" ? "receipts" : "payers";
  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
      return n;
    }, { replace: true });

  return (
    <>
      <PageHeader
        title="수납"
        subtitle={`${branch?.name ?? "전 지점"} · 납부자별 미납과 계좌 입금 맞추기`}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => update({ view: "receipts", upload: "1" })}>
              은행 엑셀 올리기
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => update({ new: "1" })}>
              입금 기록
            </Button>
          </>
        }
      >
        <Segmented
          value={view}
          onChange={(v) => update({ view: v === "payers" ? null : v, filter: null, q: null })}
          options={[
            { value: "payers", label: "납부자별" },
            { value: "receipts", label: "입금 내역" },
          ]}
        />
      </PageHeader>
      {view === "payers" ? <Payers sp={sp} update={update} /> : <Receipts sp={sp} update={update} />}
      {sp.get("new") === "1" && <PaymentDialog payerId={sp.get("payer")} onClose={() => update({ new: null, payer: null })} />}
    </>
  );
}

const IS = {
  overdue: (r: PayerRow) => r.unpaid > 0,
  short: (r: PayerRow) => r.deposit_status === "short",
  credit: (r: PayerRow) => r.credit > 0,
};



function Payers({ sp, update }: { sp: URLSearchParams; update: Upd }) {
  const q = usePayers();
  const filter = (["all", "overdue", "short", "credit"].includes(sp.get("filter") ?? "") ? sp.get("filter") : "all") as PayerFilter;
  const search = sp.get("q") ?? "";
  const peekId = sp.get("payer_peek");
  const rows = q.data ?? [];
  const is = IS;
  const visible = useMemo(() => {
    const n = search.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || IS[filter](r)) && (!n || [r.payer?.name, ...r.unit_codes].join(" ").toLowerCase().includes(n)));
  }, [rows, filter, search]);
  const peek = rows.find((r) => r.payer_id === peekId) ?? null;

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} />;
  if (!rows.length) return <EmptyState title="체결된 계약의 납부자가 없다" body="계약이 체결되면 납부자별 미납이 여기에 모인다" />;

  const unpaid = rows.reduce((s, r) => s + r.unpaid, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  const columns: Column<PayerRow>[] = [
    {
      id: "payer",
      header: "납부자",
      sort: (r) => r.payer?.name ?? "",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{r.payer?.name}</span>
          {r.payer?.kind === "corporation" && <Badge tone="navy" dot={false}>법인</Badge>}
        </div>
      ),
    },
    { id: "units", header: "호실", sort: (r) => (r.unit_codes[0] ?? "").padStart(6, "0"), cell: (r) => r.unit_codes.map((c) => `${c}호`).join(", ") },
    { id: "due", header: "납기일", hideOnMobile: true, cell: (r) => (r.due_day ? <span className="text-ink2">매월 {r.due_day}일</span> : "—") },
    { id: "charged", header: "청구", align: "right", hideOnMobile: true, sort: (r) => r.charged, cell: (r) => <Money value={r.charged} muted /> },
    { id: "received", header: "수납", align: "right", hideOnMobile: true, sort: (r) => r.received, cell: (r) => <Money value={r.received} muted /> },
    {
      id: "unpaid",
      header: "미납",
      align: "right",
      sort: (r) => r.unpaid,
      cell: (r) => (r.unpaid > 0 ? <span className="num font-semibold text-bad">{r.unpaid.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>),
    },
    { id: "credit", header: "과납", align: "right", sort: (r) => r.credit, cell: (r) => (r.credit > 0 ? <span className="num text-info">{r.credit.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>) },
    {
      id: "late",
      header: "연체",
      sort: (r) => (r.unpaid > 0 ? r.overdue_days : -1),
      cell: (r) => (r.unpaid > 0 ? <Badge tone={r.overdue_days >= 30 ? "bad" : r.overdue_days >= 7 ? "warn" : "neutral"}>{r.overdue_days}일</Badge> : <span className="text-ink3">—</span>),
    },
    {
      id: "deposit",
      header: "보증금 대비",
      sort: (r) => r.deposit_gap,
      cell: (r) =>
        r.unpaid <= 0 ? (
          <span className="text-ink3">—</span>
        ) : r.deposit_status === "short" ? (
          <Badge tone="bad">미납이 {(-r.deposit_gap).toLocaleString("ko-KR")} 더 많음</Badge>
        ) : (
          <Badge tone="neutral">보증금 안 · 차감하면 {r.deposit_gap.toLocaleString("ko-KR")}</Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="미납 합계" value={unpaid.toLocaleString("ko-KR")} unit="원" tone={unpaid > 0 ? "bad" : undefined} note="납기가 지난 돈만" />
        <StatTile label="연체 납부자" value={rows.filter(is.overdue).length} unit="명" tone={rows.some(is.overdue) ? "warn" : undefined} note={`30일 넘음 ${rows.filter((r) => r.unpaid > 0 && r.overdue_days >= 30).length}명`} />
        <StatTile label="미납이 보증금보다 많음" value={rows.filter(is.short).length} unit="명" tone={rows.some(is.short) ? "bad" : undefined} />
        <StatTile label="과납(입금 잔액)" value={credit.toLocaleString("ko-KR")} unit="원" note="다음 청구를 확인하면 자동으로 채운다" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<PayerFilter>
          size="sm"
          value={filter}
          onChange={(v) => update({ filter: v === "all" ? null : v })}
          options={[
            { value: "all", label: "전체", count: rows.length },
            { value: "overdue", label: "미납", count: rows.filter(is.overdue).length },
            { value: "short", label: "보증금 부족", count: rows.filter(is.short).length },
            { value: "credit", label: "과납", count: rows.filter(is.credit).length },
          ]}
        />
        <div className="ml-auto w-full sm:w-auto">
          <SearchBox id="payer-search" value={search} onChange={(v) => update({ q: v })} placeholder="납부자, 호실" />
        </div>
      </div>
      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.payer_id}
        onRowClick={(r) => update({ payer_peek: r.payer_id })}
        selectedKey={peekId}
        initialSort={{ id: "unpaid", dir: "desc" }}
        empty={
          <span>
            조건에 맞는 납부자가 없다 ·{" "}
            <button type="button" className="font-medium text-brass hover:underline" onClick={() => update({ filter: null, q: null })}>
              조건 초기화
            </button>
          </span>
        }
      />
      <Sheet
        open={!!peek}
        onClose={() => update({ payer_peek: null })}
        title={peek ? `${peek.payer?.name} · 청구·수납` : ""}
        subtitle={peek ? `${peek.unit_codes.map((c) => `${c}호`).join(", ")} · ${peek.payer?.phone ?? ""}` : undefined}
        actions={peek && <Button size="sm" variant="primary" onClick={() => update({ new: "1", payer: peek.payer_id })}>입금 기록</Button>}
      >
        {peek && <PayerHistory row={peek} />}
      </Sheet>
    </div>
  );
}

function PayerHistory({ row }: { row: PayerRow }) {
  const { branchId, today } = useBranch();
  const q = useApi<HistoryRow[]>(["collections", "payer-history", row.payer_id, branchId], `/api/billing/payers/${row.payer_id}/history?branch_id=${branchId}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="미납" value={row.unpaid.toLocaleString("ko-KR")} tone={row.unpaid > 0 ? "bad" : undefined} />
        <StatTile label="납기 전" value={row.upcoming.toLocaleString("ko-KR")} />
        <StatTile label="받아 둔 보증금" value={row.deposit_held.toLocaleString("ko-KR")} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {row.leases.map((l) => (
          <Link key={l.id} to={`/leases/${l.id}?tab=money`} className="rounded border border-line px-2 py-1 font-medium hover:bg-sunken">
            {l.unit_code}호 계약 · {fmt(l.end_date, "yy.M.d")} 만료
          </Link>
        ))}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-md border border-line">
          {(q.data ?? []).slice(0, 80).map((h) => (
            <li key={h.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cx("size-1.5 shrink-0 rounded-full", h.type === "payment" ? "bg-good" : h.left > 0 && h.date < today && h.status === "sent" ? "bg-bad" : "bg-ink3")} />
                  <span className="truncate">{h.label}</span>
                </div>
                <div className="num pl-3 text-xs text-ink3">
                  {fmt(h.date, "yy.M.d")}
                  {h.unit_code ? ` · ${h.unit_code}호` : ""}
                  {h.type === "charge" ? ` · ${CHARGE_KIND[h.kind as ChargeKind] ?? h.kind}` : ""}
                  {h.type === "charge" && h.status === "draft" ? " · 발송 대기" : ""}
                </div>
              </div>
              <div className="num shrink-0 text-right">
                <div className={h.type === "payment" ? "text-good" : undefined}>{h.type === "payment" ? "+" : ""}{h.amount.toLocaleString("ko-KR")}</div>
                {h.left > 0 && <div className={cx("text-xs", h.type === "charge" ? "text-bad" : "text-info")}>{h.type === "charge" ? "남음" : "안 쓴 돈"} {h.left.toLocaleString("ko-KR")}</div>}
              </div>
            </li>
          ))}
          {(q.data ?? []).length === 0 && <li className="px-3 py-6 text-center text-xs text-ink3">기록이 없다</li>}
        </ol>
      )}
    </div>
  );
}
