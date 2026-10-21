import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { cx, timeLabel, won } from "@/lib/format";
import { Badge, Button, ErrorBox, Field, Input, Loading, MoneyInput } from "@/components/ui";
import type { Deduction, LeaseStatus } from "@/types";
import { MONEY_KEYS, type SettlementView } from "./types";

const STATUS: Record<SettlementView["status"], { label: string; tone: "neutral" | "warn" | "good" }> = {
  draft: { label: "정산 중", tone: "neutral" },
  confirmed: { label: "반환 대기", tone: "warn" },
  refunded: { label: "반환 완료", tone: "good" },
};

/**
 * 퇴실 정산: 받아 둔 보증금 − 미납 − 차감 = 반환.
 * 반환 완료로 바꾸면 보증금으로 미납·차감 청구를 채우는 입금(보증금 차감)이 장부에 남는다.
 */
export function SettlementPanel({ leaseId, leaseStatus }: { leaseId: string; leaseStatus: LeaseStatus }) {
  const q = useApi<SettlementView>(["settle", "lease", leaseId], `/api/leases/${leaseId}/settlement`);
  const [rows, setRows] = useState<Deduction[]>([]);
  const [account, setAccount] = useState("");
  const [askRefund, setAskRefund] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setRows(q.data.deductions);
    setAccount(q.data.refund_account ?? "");
  }, [q.data]);

  const save = useApiMutation({
    invalidate: MONEY_KEYS,
    success: (r: unknown) => {
      const s = r as SettlementView;
      return s.status === "refunded" ? "보증금 반환을 기록했다" : s.status === "confirmed" ? "정산을 확정했다 · 반환 대기" : "정산을 임시 저장했다";
    },
    onSuccess: () => setAskRefund(false),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const done = s.status === "refunded";
  const ded = rows.reduce((a, d) => a + (d.amount || 0), 0);
  const refund = s.deposit_total - s.unpaid - ded;
  const canConfirm = leaseStatus === "closing" || leaseStatus === "closed";
  const submit = (status: SettlementView["status"]) =>
    save.mutate({ path: `/api/leases/${leaseId}/settlement`, method: "PUT", body: { deductions: rows.filter((r) => r.amount), refund_account: account, status } });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS[s.status].tone}>{s.saved ? STATUS[s.status].label : "아직 정산 전"}</Badge>
        {s.confirmed_at && <span className="text-xs text-ink3">확정 {timeLabel(s.confirmed_at)}</span>}
        {s.refunded_at && <span className="text-xs text-ink3">반환 {timeLabel(s.refunded_at)}</span>}
      </div>

      <div className="rounded-md border border-line">
        <Line label="받아 둔 보증금" hint="계약금 + 보증금 잔금으로 실제로 받은 돈(재계약이면 앞 계약에서 이어받음)" value={s.deposit_total} />
        <Line label="미납 청구" hint="이 계약의 보낸 청구 중 아직 안 받은 월세·관리비·사용료" value={-s.unpaid} />
        <div className="border-t border-line px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">차감</span>
            {!done && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brass hover:underline" onClick={() => setRows((r) => [...r, { label: "", amount: 0 }])}>
                <Plus className="size-3.5" />줄 더하기
              </button>
            )}
          </div>
          {rows.length === 0 && <p className="text-xs text-ink3">차감할 것이 없다</p>}
          <div className="flex flex-col gap-2">
            {rows.map((d, i) =>
              done ? (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-ink2">{d.label}</span>
                  <span className="num">−{d.amount.toLocaleString("ko-KR")}</span>
                </div>
              ) : (
                <div key={i} className="grid grid-cols-[1fr_140px_32px] items-center gap-2">
                  <Input id={`ded-label-${i}`} aria-label="차감 항목" placeholder="예: 원상복구(벽지)" value={d.label} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <MoneyInput id={`ded-amt-${i}`} value={d.amount} onChange={(v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
                  <button type="button" aria-label="차감 줄 지우기" className="rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ),
            )}
          </div>
        </div>
        <div className={cx("flex items-baseline justify-between border-t-2 border-ink/80 px-4 py-3", refund < 0 ? "bg-bad/5" : "bg-sunken/60")}>
          <span className="text-sm font-semibold">{refund < 0 ? "더 받을 돈" : "돌려줄 돈"}</span>
          <span className={cx("num text-xl font-semibold", refund < 0 && "text-bad")}>{won(Math.abs(done ? s.refund_amount : refund))}</span>
        </div>
      </div>
      {refund < 0 && !done && <p className="text-xs text-bad">보증금보다 받을 돈이 {won(-refund)} 많다. 반환 대신 남은 금액을 직접 청구한다.</p>}

      <Field label="반환 계좌" htmlFor={`refund-acc-${leaseId}`} hint={s.refund_account && !done ? "계약자가 남긴 계좌. 다르면 고친다" : undefined}>
        <Input id={`refund-acc-${leaseId}`} value={account} disabled={done} onChange={(e) => setAccount(e.target.value)} placeholder="은행 계좌번호 예금주" />
      </Field>

      {!done && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!canConfirm && <p className="mr-auto text-xs text-ink3">퇴실 처리 뒤에 확정할 수 있다. 지금은 임시 저장만 된다</p>}
          {save.error && <p className="mr-auto text-xs text-bad">{save.error.message}</p>}
          <Button onClick={() => submit("draft")} loading={save.isPending && !askRefund}>
            임시 저장
          </Button>
          {s.status !== "confirmed" && (
            <Button variant="primary" disabled={!canConfirm} onClick={() => submit("confirmed")}>
              정산 확정
            </Button>
          )}
          {askRefund ? (
            <>
              <span className="text-xs text-ink2">{won(Math.max(0, refund))}을 보냈나?</span>
              <Button variant="brass" loading={save.isPending} onClick={() => submit("refunded")}>
                보냈다 · 반환 완료
              </Button>
            </>
          ) : (
            <Button variant="brass" disabled={!canConfirm || refund < 0} onClick={() => setAskRefund(true)}>
              반환 완료로
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-ink3">{hint}</div>
      </div>
      <span className={cx("num whitespace-nowrap text-sm font-semibold", value < 0 && "text-bad")}>{value < 0 ? `−${(-value).toLocaleString("ko-KR")}` : Math.abs(value).toLocaleString("ko-KR")}</span>
    </div>
  );
}
