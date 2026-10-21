import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Upload } from "lucide-react";
import { api } from "@/api/client";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { timeLabel, won } from "@/lib/format";
import { Badge, Button, DataTable, ErrorBox, Loading, Money, SearchBox, Segmented, useToast, type Column } from "@/components/ui";
import { MONEY_KEYS, type Receipt, type ReceiptPage, type Suggestion } from "@/pages/billing/api";
import { BankUploadDialog } from "./BankUploadDialog";
import { MatchDialog } from "./ReceiptDialogs";
import { ReceiptSheet } from "./ReceiptSheet";
import type { Upd } from "./hooks";

type ReceiptFilter = "all" | "unmatched" | "matched" | "skipped";
const PAGE = 50;

/** 입금 내역: 은행 엑셀 올리기 → 추천 맞추기 → 재배분 · 잔액 채우기 */
export function Receipts({ sp, update }: { sp: URLSearchParams; update: Upd }) {
  const { branchId } = useBranch();
  const qc = useQueryClient();
  const toast = useToast();
  const filter = (["all", "unmatched", "matched", "skipped"].includes(sp.get("filter") ?? "") ? sp.get("filter") : "all") as ReceiptFilter;
  const search = sp.get("q") ?? "";
  const [limit, setLimit] = useState(PAGE);
  const q = useApi<ReceiptPage>(
    ["collections", "receipts", branchId, filter, search, limit],
    `/api/billing/receipts/page?branch_id=${branchId}&status=${filter}&offset=0&limit=${limit}&q=${encodeURIComponent(search)}`,
  );
  const hasUnmatched = (q.data?.counts.unmatched ?? 0) > 0;
  const sug = useApi<Suggestion[]>(["collections", "suggestions", branchId], `/api/billing/bank-deposits/suggestions?branch_id=${branchId}`, { enabled: hasUnmatched });
  const byPayment = useMemo(() => new Map((sug.data ?? []).map((s) => [s.payment_id, s])), [sug.data]);
  const [match, setMatch] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const openId = sp.get("receipt");
  const quick = useApiMutation<{ allocated: number; left: number }>({ invalidate: MONEY_KEYS, success: (r) => `맞췄다 · ${won(r.allocated)} 청구를 채웠다` });

  const rows = q.data?.rows ?? [];
  const sure = (sug.data ?? []).filter((s) => s.sure);

  const matchAllSure = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const s of sure) {
        await api(`/api/billing/receipts/${s.payment_id}/match`, { method: "POST", body: { payer_id: s.candidates[0].payer_id } });
        n++;
      }
      toast.show(`확실한 추천 ${n}건을 맞췄다`, "good");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "맞추지 못했다", "bad");
    } finally {
      await Promise.all([...MONEY_KEYS, ["dashboard"], ["alerts"]].map((k) => qc.invalidateQueries({ queryKey: k })));
      setBusy(false);
    }
  };

  const columns: Column<Receipt>[] = [
    { id: "at", header: "입금일", sort: (r) => r.received_at, cell: (r) => <span className="whitespace-nowrap">{timeLabel(r.received_at)}</span> },
    {
      id: "name",
      header: "입금자명",
      sort: (r) => r.depositor_name,
      cell: (r) => (
        <div>
          <span className="font-medium">{r.depositor_name}</span>
          {r.memo && <span className="block max-w-[18ch] truncate text-[11px] text-ink3">{r.memo}</span>}
        </div>
      ),
    },
    {
      id: "amount",
      header: "입금",
      align: "right",
      sort: (r) => r.amount,
      cell: (r) => (
        <div>
          <Money value={r.amount} strong />
          {(r.platform_fee > 0 || r.pass_through > 0) && (
            <span className="block text-[11px] text-ink3">
              {r.platform_fee > 0 ? `수수료 +${r.platform_fee.toLocaleString("ko-KR")}` : ""}
              {r.pass_through > 0 ? ` 몫 아님 −${r.pass_through.toLocaleString("ko-KR")}` : ""}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "payer",
      header: "납부자 · 추천",
      cell: (r) => {
        if (r.status === "skipped") return <Badge tone="neutral">수납 아님</Badge>;
        if (r.status === "matched")
          return (
            <span>
              {r.payer?.name}
              {r.unit_codes.length > 0 && <span className="ml-1.5 text-xs text-ink3">{r.unit_codes.map((c) => `${c}호`).join(", ")}</span>}
            </span>
          );
        const top = byPayment.get(r.id)?.candidates[0];
        if (!top) return <Badge tone="warn">안 맞춘 입금 · 추천 없음</Badge>;
        return (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <span className="font-medium">{top.payer?.name}</span>
              <span className="ml-1 text-xs text-ink3">{top.unit_codes.map((c) => `${c}호`).join(", ")}</span>
              <span className="block max-w-[26ch] truncate text-[11px] text-ink2">{top.reasons.join(" · ")}</span>
            </div>
            <Button size="sm" variant="primary" loading={quick.isPending && quick.variables?.path.includes(r.id)} onClick={() => quick.mutate({ path: `/api/billing/receipts/${r.id}/match`, body: { payer_id: top.payer_id } })}>
              맞추기
            </Button>
          </div>
        );
      },
    },
    {
      id: "left",
      header: "입금 잔액",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (r.status === "matched" && r.left > 0 ? <span className="num text-info">{r.left.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>),
    },
    { id: "how", header: "방식", hideOnMobile: true, cell: (r) => <span className="text-xs text-ink2">{r.memo === "보증금 차감" ? "보증금 차감" : r.method === "bank" ? r.account : "직접 기록"}</span> },
    {
      id: "act",
      header: "",
      align: "right",
      cell: (r) =>
        r.status === "unmatched" ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => setMatch(r)}>
              다른 납부자
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {q.data && q.data.counts.unmatched > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <span className="font-semibold text-warn">
            안 맞춘 입금 {q.data.counts.unmatched}건 · {won(q.data.unmatched_total)}
          </span>
          <span className="text-ink2">이름·금액·적요로 납부자를 추천한다. 맞추면 오래된 청구부터 채운다.</span>
          <div className="flex-1" />
          {sure.length > 0 && (
            <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} loading={busy} onClick={matchAllSure}>
              확실한 추천 {sure.length}건 모두 맞추기
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<ReceiptFilter>
          size="sm"
          value={filter}
          onChange={(v) => {
            setLimit(PAGE);
            update({ filter: v === "all" ? null : v });
          }}
          options={[
            { value: "all", label: "전체", count: q.data?.counts.all },
            { value: "unmatched", label: "안 맞춤", count: q.data?.counts.unmatched },
            { value: "matched", label: "맞춤", count: q.data?.counts.matched },
            { value: "skipped", label: "수납 아님", count: q.data?.counts.skipped },
          ]}
        />
        <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => update({ upload: "1" })}>
          은행 엑셀 올리기
        </Button>
        <div className="ml-auto w-full sm:w-auto">
          <SearchBox
            id="receipt-search"
            value={search}
            onChange={(v) => {
              setLimit(PAGE);
              update({ q: v });
            }}
            placeholder="입금자명, 납부자, 금액, 호실"
          />
        </div>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => update({ receipt: r.id })}
            selectedKey={openId}
            rowClassName={(r) => (r.status === "unmatched" ? "bg-warn/5" : r.status === "skipped" ? "text-ink3" : undefined)}
            empty={q.data?.counts.all ? "조건에 맞는 입금이 없다" : "입금 기록이 없다. 은행 엑셀을 올리면 여기에 모인다"}
          />
          {q.data?.next_offset !== null && q.data?.next_offset !== undefined && (
            <div className="flex justify-center">
              <Button onClick={() => setLimit((l) => l + PAGE)} loading={q.isFetching}>
                더 보기 ({rows.length} / {q.data.total})
              </Button>
            </div>
          )}
        </>
      )}
      {match && <MatchDialog receipt={match} onClose={() => setMatch(null)} />}
      {openId && (
        <ReceiptSheet
          id={openId}
          onClose={() => update({ receipt: null })}
          onMatch={() => {
            const r = rows.find((x) => x.id === openId);
            if (r) setMatch(r);
          }}
        />
      )}
      {sp.get("upload") === "1" && <BankUploadDialog onClose={() => update({ upload: null })} onDone={() => update({ filter: "unmatched", q: null })} />}
    </div>
  );
}
