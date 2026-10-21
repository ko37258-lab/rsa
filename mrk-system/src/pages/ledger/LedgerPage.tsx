import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { downloadXlsx } from "@/lib/excel";
import { useBranch } from "@/lib/branch";
import { cx, fmt, man, won } from "@/lib/format";

/** 큰 금액을 "6,790" 만원 처럼(타일용) */
const manWon = (n: number) => Math.round(n / 10000).toLocaleString("ko-KR");
import { thisMonth } from "@/lib/dates";
import { CHARGE_KIND, type Tone } from "@/lib/codes";
import { BarChart, Legend } from "@/components/charts";
import { Badge, Button, DataTable, EmptyState, ErrorBox, Loading, MonthNav, PageHeader, SearchBox, Section, Segmented, StatTile, useToast, type Column } from "@/components/ui";
import type { ChargeKind, CommissionTerm } from "@/types";

type Kind = "charge" | "payment" | "allocation" | "refund";
interface BookRow {
  entry: string;
  kind: Kind;
  charge_kind: ChargeKind | null;
  supply: number | null;
  vat: number | null;
  invoice_no: string | null;
  date: string;
  unit_code: string | null;
  payer: string;
  payer_id: string | null;
  lease_id: string | null;
  label: string;
  amount: number;
  cancelled: boolean;
  status: string;
}

interface Revenue {
  month: string;
  partial: boolean;
  branches: Array<{ branch_id: string; name: string; term: CommissionTerm; by_kind: ByKind; discount: number; resident_revenue: number; base: number; fee: number }>;
  total: { resident_revenue: number; base: number; fee: number; discount: number; by_kind: ByKind };
  series: Array<{ month: string; rent: number; mgmt: number; usage: number; other: number; base: number; fee: number }>;
}
type ByKind = { rent: number; mgmt: number; usage: number; other: number };

const KIND: Record<Kind, { label: string; tone: Tone }> = {
  charge: { label: "청구", tone: "navy" },
  payment: { label: "입금", tone: "good" },
  allocation: { label: "배분", tone: "info" },
  refund: { label: "반환", tone: "brass" },
};

export default function LedgerPage() {
  const [sp, setSp] = useSearchParams();
  const { branch, today } = useBranch();
  const current = thisMonth(today);
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? (sp.get("month") as string) : current;
  const view = sp.get("view") === "revenue" ? "revenue" : "book";
  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
      return n;
    }, { replace: true });

  return (
    <>
      <PageHeader title="장부" subtitle={`${branch?.name ?? "전 지점"} · 한 달 동안 오간 돈과 매출`}>
        <Segmented
          value={view}
          onChange={(v) => update({ view: v === "book" ? null : v, kind: null })}
          options={[
            { value: "book", label: "장부" },
            { value: "revenue", label: "매출" },
          ]}
        />
        <MonthNav month={month} onChange={(m) => update({ month: m === current ? null : m })} current={current} />
      </PageHeader>
      {view === "book" ? <Book month={month} sp={sp} update={update} /> : <RevenueView month={month} />}
    </>
  );
}

function Book({ month, sp, update }: { month: string; sp: URLSearchParams; update: (p: Record<string, string | null>) => void }) {
  const { branchId, branch } = useBranch();
  const toast = useToast();
  const nav = useNavigate();
  const q = useApi<BookRow[]>(["ledger", "book", branchId, month], `/api/billing/book?branch_id=${branchId}&month=${month}-01`);
  const kind = (["charge", "payment", "allocation", "refund"].includes(sp.get("kind") ?? "") ? sp.get("kind") : "all") as "all" | Kind;
  const search = sp.get("q") ?? "";
  const rows = q.data ?? [];
  const visible = useMemo(() => {
    const n = search.trim().toLowerCase();
    return rows.filter((r) => (kind === "all" || r.kind === kind) && (!n || [r.unit_code, r.payer, r.label].join(" ").toLowerCase().includes(n)));
  }, [rows, kind, search]);
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const total = (k: Kind) => rows.filter((r) => r.kind === k && !r.cancelled).reduce((s, r) => s + r.amount, 0);
  const columns: Column<BookRow>[] = [
    { id: "date", header: "일자", sort: (r) => r.date, cell: (r) => <span className="whitespace-nowrap">{fmt(r.date, "M.d (EEE)")}</span> },
    { id: "kind", header: "종류", sort: (r) => r.kind, cell: (r) => <Badge tone={KIND[r.kind].tone} dot={false}>{KIND[r.kind].label}</Badge> },
    { id: "unit", header: "호실", sort: (r) => (r.unit_code ?? "").padStart(6, "0"), cell: (r) => (r.unit_code ? `${r.unit_code}호` : <span className="text-ink3">—</span>) },
    { id: "payer", header: "납부자", sort: (r) => r.payer, cell: (r) => r.payer || <span className="text-ink3">—</span> },
    {
      id: "label",
      header: "항목",
      cell: (r) => (
        <span className="text-ink2">
          {r.label}
          {r.charge_kind === "discount" && r.kind === "charge" && (
            <Badge tone="brass" dot={false} className="ml-1.5">
              할인
            </Badge>
          )}
          {r.invoice_no && r.kind === "charge" && <span className="ml-1.5 text-[11px] text-ink3">{r.invoice_no}</span>}
        </span>
      ),
    },
    {
      id: "amount",
      header: "금액",
      align: "right",
      sort: (r) => r.amount,
      cell: (r) => (
        <span className={cx("num font-medium", r.kind === "refund" && "text-brass", r.kind === "payment" && "text-good", r.amount < 0 && "text-bad")}>
          {r.kind === "refund" ? "−" : ""}
          {r.amount.toLocaleString("ko-KR")}
        </span>
      ),
    },
    { id: "state", header: "상태", cell: (r) => (r.cancelled ? <span className="text-xs text-ink3">{r.kind === "payment" ? "수납 아님" : "취소"}</span> : <span className="text-xs text-ink3">정상</span>) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="청구" value={manWon(total("charge"))} unit="만원" note={`${rows.filter((r) => r.kind === "charge").length}줄 · 보낸 것만`} />
        <StatTile label="입금" value={manWon(total("payment"))} unit="만원" note={`${rows.filter((r) => r.kind === "payment" && !r.cancelled).length}건`} />
        <StatTile label="배분" value={manWon(total("allocation"))} unit="만원" note="입금을 청구에 채운 돈" />
        <StatTile label="보증금 반환" value={manWon(total("refund"))} unit="만원" note={`${rows.filter((r) => r.kind === "refund").length}건`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={kind}
          onChange={(v) => update({ kind: v === "all" ? null : v })}
          options={[
            { value: "all" as const, label: "전체", count: rows.length },
            ...(Object.keys(KIND) as Kind[]).map((k) => ({ value: k, label: KIND[k].label, count: rows.filter((r) => r.kind === k).length })),
          ]}
        />
        <Button
          size="sm"
          icon={<Download className="size-3.5" />}
          disabled={!visible.length}
          onClick={() =>
            downloadXlsx(
              `장부_${branch?.name ?? "전지점"}_${month}.xlsx`,
              [
                ["일자", "종류", "항목 종류", "호실", "납부자", "항목", "청구서 번호", "공급가", "부가세", "금액", "상태"],
                ...visible.map((r) => [
                  r.date,
                  KIND[r.kind].label,
                  r.charge_kind ? CHARGE_KIND[r.charge_kind] : "",
                  r.unit_code ? `${r.unit_code}호` : "",
                  r.payer,
                  r.label,
                  r.invoice_no ?? "",
                  r.supply,
                  r.vat,
                  r.kind === "refund" ? -r.amount : r.amount,
                  r.cancelled ? (r.kind === "payment" ? "수납 아님" : "취소") : "정상",
                ]),
              ],
              { sheet: `${month} 장부`, widths: [11, 6, 10, 8, 14, 30, 13, 11, 9, 12, 8] },
            ).catch((e: unknown) => toast.show(e instanceof Error ? e.message : "내려받지 못했다", "bad"))
          }
        >
          엑셀로 내려받기
        </Button>
        <div className="ml-auto w-full sm:w-auto">
          <SearchBox id="book-search" value={search} onChange={(v) => update({ q: v })} placeholder="호실, 납부자, 항목" />
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="이 달 거래가 없다" />
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(r) => `${r.kind}-${r.entry}`}
          dense
          rowClassName={(r) => (r.cancelled ? "text-ink3 line-through" : undefined)}
          onRowClick={(r) => (r.lease_id ? nav(`/leases/${r.lease_id}?tab=money`) : r.payer_id ? nav(`/collections?payer_peek=${r.payer_id}`) : nav("/collections?view=receipts"))}
          empty="조건에 맞는 거래가 없다"
        />
      )}
    </div>
  );
}

function termText(t: CommissionTerm): string {
  return t.structure === "fixed_minus" ? `기준 매출 − 고정 지급 ${won(t.fixed_amount)} · 운영비 빼기 전` : `기준 매출 × ${(t.rate_bp / 100).toFixed(1)}%`;
}

function RevenueView({ month }: { month: string }) {
  const { branchId } = useBranch();
  const q = useApi<Revenue>(["ledger", "revenue", branchId, month], `/api/billing/revenue?branch_id=${branchId}&month=${month}-01`);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} />;
  const r = q.data;
  const prev = r.series[r.series.length - 2];
  const diff = prev ? r.total.base - prev.base : null;
  return (
    <div className="flex flex-col gap-4">
      {r.partial && <p className="rounded border border-line bg-sunken/60 px-3 py-2 text-xs text-ink2">이번 달은 아직 청구일이 안 된 월세가 빠져 낮게 보일 수 있다.</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatTile label="입주자 매출" value={manWon(r.total.resident_revenue)} unit="만원" note={`부가세 뺀 공급가 · 청구 기간 중 이 달 몫${r.total.discount ? ` · 할인 ${man(Math.abs(r.total.discount))}원 뺌` : ""}`} />
        <StatTile label="수수료 기준 매출" value={manWon(r.total.base)} unit="만원" note={diff === null ? "전월 값 없음" : `전월 대비 ${diff >= 0 ? "+" : "−"}${man(Math.abs(diff))}원 · 사용료(실비) 제외`} />
        <StatTile label="MR.K 수수료" value={manWon(r.total.fee)} unit="만원" tone="good" note="지점 수수료 조건으로 계산" />
      </div>
      <Section title="지난 12개월" hint="매출은 사용 기간의 달에 나눠 넣는다(기간 없는 청구는 청구일 달). 계약금·보증금처럼 돌려줄 돈은 뺀다." actions={<Legend series={[{ name: "월세", color: "navy" }, { name: "관리비·사용료·기타", color: "brass" }]} />}>
        <BarChart
          stacked
          labels={r.series.map((s) => fmt(`${s.month}-01`, "yy.M"))}
          series={[
            { name: "월세", color: "navy", values: r.series.map((s) => s.rent) },
            { name: "관리비·사용료·기타", color: "brass", values: r.series.map((s) => s.mgmt + s.usage + s.other) },
          ]}
          format={(v) => (v === 0 ? "0" : man(v))}
        />
      </Section>
      <Section title="지점별" bodyClassName="p-3">
        <DataTable
          rows={r.branches}
          rowKey={(b) => b.branch_id}
          columns={[
            { id: "name", header: "지점", cell: (b) => <span className="font-medium">{b.name}</span> },
            { id: "rent", header: "월세(할인 뺌)", align: "right", cell: (b) => <span className="num">{b.by_kind.rent.toLocaleString("ko-KR")}</span> },
            { id: "disc", header: "할인", align: "right", hideOnMobile: true, cell: (b) => (b.discount ? <span className="num text-bad">{b.discount.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>) },
            { id: "mgmt", header: "관리비", align: "right", cell: (b) => <span className="num">{b.by_kind.mgmt.toLocaleString("ko-KR")}</span> },
            { id: "usage", header: "사용료", align: "right", hideOnMobile: true, cell: (b) => <span className="num text-ink3">{b.by_kind.usage.toLocaleString("ko-KR")}</span> },
            { id: "other", header: "기타", align: "right", hideOnMobile: true, cell: (b) => <span className="num">{b.by_kind.other.toLocaleString("ko-KR")}</span> },
            { id: "base", header: "기준 매출", align: "right", cell: (b) => <span className="num font-semibold">{b.base.toLocaleString("ko-KR")}</span> },
            { id: "term", header: "수수료 조건", cell: (b) => <span className="text-xs text-ink2">{termText(b.term)}</span> },
            { id: "fee", header: "MR.K 수수료", align: "right", cell: (b) => <span className="num font-semibold text-good">{b.fee.toLocaleString("ko-KR")}</span> },
          ]}
        />
      </Section>
    </div>
  );
}
