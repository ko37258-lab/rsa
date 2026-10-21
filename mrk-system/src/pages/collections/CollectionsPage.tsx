import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, fmt, timeLabel, won } from "@/lib/format";
import { CHARGE_KIND } from "@/lib/codes";
import {
  Badge, Button, DataTable, Dialog, EmptyState, ErrorBox, Field, FormGrid, Input, Loading, Money, MoneyInput, PageHeader, SearchBox, Segmented, Select, Sheet, StatTile, Textarea, type Column,
} from "@/components/ui";
import type { ChargeKind, Payment, PartyCard } from "@/types";
import { MONEY_KEYS } from "@/pages/leases/types";

interface PayerRow {
  payer_id: string;
  payer: PartyCard | null;
  unit_codes: string[];
  lease_ids: string[];
  charged: number;
  received: number;
  unpaid: number;
  upcoming: number;
  overdue_days: number;
  credit: number;
  deposit_held: number;
  leases: Array<{ id: string; unit_code: string; status: string; end_date: string }>;
  due_day: number | null;
  deposit_status: "ok" | "short";
  deposit_gap: number;
}

type Receipt = Payment & { payer: PartyCard | null; allocated: number; left: number; unit_codes: string[] };

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
type ReceiptFilter = "all" | "unmatched" | "matched" | "skipped";

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
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => update({ new: "1" })}>
            입금 기록
          </Button>
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

function usePayers() {
  const { branchId } = useBranch();
  return useApi<PayerRow[]>(["collections", "payers", branchId], `/api/billing/payers?branch_id=${branchId}`);
}

type Upd = (patch: Record<string, string | null>) => void;

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
        <StatTile label="과납(남은 돈)" value={credit.toLocaleString("ko-KR")} unit="원" note="다음 청구를 보내면 자동으로 채운다" />
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

function Receipts({ sp, update }: { sp: URLSearchParams; update: Upd }) {
  const { branchId } = useBranch();
  const q = useApi<Receipt[]>(["collections", "receipts", branchId], `/api/billing/receipts?branch_id=${branchId}`);
  const filter = (["all", "unmatched", "matched", "skipped"].includes(sp.get("filter") ?? "") ? sp.get("filter") : "all") as ReceiptFilter;
  const search = sp.get("q") ?? "";
  const [match, setMatch] = useState<Receipt | null>(null);
  const act = useApiMutation({ invalidate: MONEY_KEYS, success: "입금 상태를 바꿨다" });
  const rows = q.data ?? [];
  const visible = useMemo(() => {
    const n = search.trim().toLowerCase().replace(/,/g, "");
    return rows.filter(
      (r) => (filter === "all" || r.status === filter) && (!n || [r.depositor_name, r.payer?.name, String(r.amount), ...r.unit_codes].join(" ").toLowerCase().includes(n)),
    );
  }, [rows, filter, search]);
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const count = (s: ReceiptFilter) => (s === "all" ? rows.length : rows.filter((r) => r.status === s).length);
  const unmatched = rows.filter((r) => r.status === "unmatched");

  const columns: Column<Receipt>[] = [
    { id: "at", header: "입금일", sort: (r) => r.received_at, cell: (r) => <span className="whitespace-nowrap">{timeLabel(r.received_at)}</span> },
    { id: "name", header: "입금자명", sort: (r) => r.depositor_name, cell: (r) => <span className="font-medium">{r.depositor_name}</span> },
    { id: "amount", header: "입금", align: "right", sort: (r) => r.amount, cell: (r) => <Money value={r.amount} strong /> },
    {
      id: "payer",
      header: "납부자",
      cell: (r) =>
        r.status === "unmatched" ? (
          <Badge tone="warn">안 맞춘 입금</Badge>
        ) : r.status === "skipped" ? (
          <Badge tone="neutral">수납 아님</Badge>
        ) : (
          <span>
            {r.payer?.name}
            {r.unit_codes.length > 0 && <span className="ml-1.5 text-xs text-ink3">{r.unit_codes.map((c) => `${c}호`).join(", ")}</span>}
          </span>
        ),
    },
    { id: "left", header: "안 쓴 돈", align: "right", hideOnMobile: true, cell: (r) => (r.status === "matched" && r.left > 0 ? <span className="num text-info">{r.left.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>) },
    { id: "how", header: "방식", hideOnMobile: true, cell: (r) => <span className="text-xs text-ink2">{r.memo === "보증금 차감" ? "보증금 차감" : r.method === "bank" ? r.account : "직접 기록"}</span> },
    {
      id: "act",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status === "unmatched" && (
            <>
              <Button size="sm" variant="primary" onClick={() => setMatch(r)}>
                납부자 맞추기
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/skip` })}>
                수납 아님
              </Button>
            </>
          )}
          {r.status === "skipped" && (
            <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/unskip` })}>
              되돌리기
            </Button>
          )}
          {r.status === "matched" && r.method === "direct" && r.memo !== "보증금 차감" && (
            <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/cancel` })}>
              입금 취소
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {unmatched.length > 0 && (
        <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <span className="font-semibold text-warn">안 맞춘 입금 {unmatched.length}건 · {won(unmatched.reduce((s, r) => s + r.amount, 0))}</span>
          <span className="ml-2 text-ink2">입금자명이 계약자·납부자와 달라 자동으로 못 맞췄다. 납부자를 고르면 오래된 청구부터 채운다.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<ReceiptFilter>
          size="sm"
          value={filter}
          onChange={(v) => update({ filter: v === "all" ? null : v })}
          options={[
            { value: "all", label: "전체", count: count("all") },
            { value: "unmatched", label: "안 맞춤", count: count("unmatched") },
            { value: "matched", label: "맞춤", count: count("matched") },
            { value: "skipped", label: "수납 아님", count: count("skipped") },
          ]}
        />
        <div className="ml-auto w-full sm:w-auto">
          <SearchBox id="receipt-search" value={search} onChange={(v) => update({ q: v })} placeholder="입금자명, 납부자, 금액, 호실" />
        </div>
      </div>
      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.status === "unmatched" ? "bg-warn/5" : r.status === "skipped" ? "text-ink3" : undefined)}
        empty={rows.length ? "조건에 맞는 입금이 없다" : "입금 기록이 없다. 은행 엑셀을 올리거나 직접 기록하면 여기에 모인다"}
      />
      {match && <MatchDialog receipt={match} onClose={() => setMatch(null)} />}
    </div>
  );
}

function MatchDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const payers = usePayers();
  const [pick, setPick] = useState("");
  const save = useApiMutation<{ allocated: number; left: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => `납부자를 맞췄다 · ${won(r.allocated)} 청구를 채웠다${r.left > 0 ? ` · 남은 돈 ${won(r.left)}` : ""}`,
    onSuccess: onClose,
  });
  const clean = receipt.depositor_name.replace(/[()*\s]|엄마|아빠|인사|주식회사|\(주\)/g, "").toLowerCase();
  const suggestions = (payers.data ?? [])
    .map((p) => {
      const name = (p.payer?.name ?? "").replace(/[()\s]|주식회사|\(주\)/g, "").toLowerCase();
      let score = 0;
      if (clean && name && (name.includes(clean) || clean.includes(name))) score += 3;
      else if (clean.length >= 2 && name.startsWith(clean[0]) && name.endsWith(clean[clean.length - 1])) score += 1;
      if (p.unpaid === receipt.amount) score += 3;
      else if (p.unpaid > 0 && Math.abs(p.unpaid - receipt.amount) < 50000) score += 1;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  return (
    <Dialog
      open
      onClose={onClose}
      title="납부자 맞추기"
      description={`${timeLabel(receipt.received_at)} · ${receipt.depositor_name} · ${won(receipt.amount)}`}
      footer={
        <>
          {save.error && <p className="mr-auto self-center text-xs text-bad">{save.error.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!pick} loading={save.isPending} onClick={() => save.mutate({ path: `/api/billing/receipts/${receipt.id}/match`, body: { payer_id: pick } })}>
            맞추기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink2">추천</span>
            {suggestions.map(({ p }) => (
              <button
                key={p.payer_id}
                type="button"
                onClick={() => setPick(p.payer_id)}
                className={cx("flex items-center justify-between rounded border px-3 py-2 text-left text-sm", pick === p.payer_id ? "border-navy bg-navy/5" : "border-line hover:bg-sunken")}
              >
                <span>
                  <span className="font-medium">{p.payer?.name}</span>
                  <span className="ml-2 text-xs text-ink3">{p.unit_codes.map((c) => `${c}호`).join(", ")}</span>
                </span>
                <span className="num text-xs text-ink2">미납 {p.unpaid.toLocaleString("ko-KR")}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="납부자" htmlFor="match-payer">
          <Select
            id="match-payer"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            placeholder={payers.isLoading ? "불러오는 중" : "납부자 고르기"}
            options={(payers.data ?? [])
              .slice()
              .sort((a, b) => (a.payer?.name ?? "").localeCompare(b.payer?.name ?? "", "ko"))
              .map((p) => ({ value: p.payer_id, label: `${p.payer?.name} · ${p.unit_codes.map((c) => `${c}호`).join(", ")}${p.unpaid > 0 ? ` · 미납 ${p.unpaid.toLocaleString("ko-KR")}` : ""}` }))}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function PaymentDialog({ payerId, onClose }: { payerId: string | null; onClose: () => void }) {
  const { branchId, today } = useBranch();
  const payers = usePayers();
  const [payer, setPayer] = useState(payerId ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const picked = (payers.data ?? []).find((p) => p.payer_id === payer);
  const save = useApiMutation<{ allocated: number; left: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => (r.allocated ? `입금을 기록했다 · ${won(r.allocated)} 청구를 채웠다` : "입금을 기록했다 · 채울 청구가 없어 남은 돈으로 둔다"),
    onSuccess: onClose,
  });
  const submit = () => {
    setErr(null);
    if (!amount || amount <= 0) return setErr("입금 금액을 적는다");
    if (!payer && branchId === "all") return setErr("전 지점 보기에서는 납부자를 먼저 고른다");
    save.mutate({ path: "/api/billing/receipts", body: { branch_id: branchId, payer_id: payer || undefined, depositor_name: name || picked?.payer?.name, amount, received_at: date, memo } });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="입금 기록"
      description="현금·카드 등 계좌 밖으로 받은 돈을 직접 남긴다. 납부자를 고르면 오래된 청구부터 채운다."
      footer={
        <>
          {(err || save.error) && <p className="mr-auto self-center text-xs text-bad">{err ?? save.error?.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            기록
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="납부자" htmlFor="pay-payer" hint={picked ? `미납 ${won(picked.unpaid)} · 납기 전 ${won(picked.upcoming)}` : "비워 두면 안 맞춘 입금으로 남는다"}>
          <Select
            id="pay-payer"
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            placeholder={payers.isLoading ? "불러오는 중" : "정하지 않음"}
            options={(payers.data ?? [])
              .slice()
              .sort((a, b) => (a.payer?.name ?? "").localeCompare(b.payer?.name ?? "", "ko"))
              .map((p) => ({ value: p.payer_id, label: `${p.payer?.name} · ${p.unit_codes.map((c) => `${c}호`).join(", ")}` }))}
          />
        </Field>
        <FormGrid>
          <Field label="입금자명" htmlFor="pay-name">
            <Input id="pay-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={picked?.payer?.name ?? "입금한 사람"} />
          </Field>
          <Field label="받은 날" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="금액" htmlFor="pay-amount">
            <MoneyInput id="pay-amount" value={amount} onChange={setAmount} />
          </Field>
          {picked && picked.unpaid > 0 && (
            <Field label="빨리 넣기">
              <button type="button" className="h-9 rounded border border-line px-3 text-left text-[13px] hover:bg-sunken" onClick={() => setAmount(picked.unpaid)}>
                미납 전액 {won(picked.unpaid)}
              </button>
            </Field>
          )}
        </FormGrid>
        <Field label="메모" htmlFor="pay-memo">
          <Textarea id="pay-memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 현장 카드 결제" />
        </Field>
      </div>
    </Dialog>
  );
}
