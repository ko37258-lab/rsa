import { useState } from "react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, timeLabel, won } from "@/lib/format";
import { Button, Dialog, Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui";
import { MONEY_KEYS, type Receipt, type Suggestion } from "@/pages/billing/api";
import { usePayers } from "./hooks";

/** 플랫폼 수수료 · 홈즈 몫 아님 입력(접어 둔다) */
function FeeFields({ value, onChange }: { value: { platform_fee: number | null; pass_through: number | null; reason: string }; onChange: (v: { platform_fee: number | null; pass_through: number | null; reason: string }) => void }) {
  const [open, setOpen] = useState(!!(value.platform_fee || value.pass_through));
  if (!open)
    return (
      <button type="button" className="self-start text-xs font-medium text-brass hover:underline" onClick={() => setOpen(true)}>
        플랫폼 수수료 · 홈즈 몫 아님이 있다
      </button>
    );
  return (
    <FormGrid cols={3}>
      <Field label="플랫폼 수수료" htmlFor="fee-platform" hint="떼고 보낸 돈. 월세를 채운다">
        <MoneyInput id="fee-platform" value={value.platform_fee} onChange={(v) => onChange({ ...value, platform_fee: v })} />
      </Field>
      <Field label="홈즈 몫 아님" htmlFor="fee-pass" hint="청구를 채우지 않는다">
        <MoneyInput id="fee-pass" value={value.pass_through} onChange={(v) => onChange({ ...value, pass_through: v })} />
      </Field>
      <Field label="이유" htmlFor="fee-reason">
        <Input id="fee-reason" value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} placeholder="예: 관리단 몫" />
      </Field>
    </FormGrid>
  );
}

/** 안 맞춘 입금에 납부자 맞추기 — 이름·금액·적요로 고른 추천을 위에 보여준다 */
export function MatchDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const payers = usePayers();
  const sug = useApi<Suggestion[]>(["collections", "suggestions", receipt.id], `/api/billing/bank-deposits/suggestions?branch_id=${receipt.branch_id}&payment_id=${receipt.id}`);
  const [pick, setPick] = useState("");
  const [fees, setFees] = useState({ platform_fee: null as number | null, pass_through: null as number | null, reason: "" });
  const save = useApiMutation<{ allocated: number; left: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => `납부자를 맞췄다 · ${won(r.allocated)} 청구를 채웠다${r.left > 0 ? ` · 입금 잔액 ${won(r.left)}` : ""}`,
    onSuccess: onClose,
  });
  const candidates = sug.data?.[0]?.candidates ?? [];
  return (
    <Dialog
      open
      onClose={onClose}
      title="납부자 맞추기"
      description={`${timeLabel(receipt.received_at)} · ${receipt.depositor_name} · ${won(receipt.amount)}${receipt.memo ? ` · ${receipt.memo}` : ""}`}
      footer={
        <>
          {save.error && <p className="mr-auto self-center text-xs text-bad">{save.error.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={!pick}
            loading={save.isPending}
            onClick={() => save.mutate({ path: `/api/billing/receipts/${receipt.id}/match`, body: { payer_id: pick, platform_fee: fees.platform_fee ?? 0, pass_through: fees.pass_through ?? 0, pass_through_reason: fees.reason } })}
          >
            맞추기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {candidates.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink2">추천</span>
            {candidates.map((c) => (
              <button
                key={c.payer_id}
                type="button"
                onClick={() => setPick(c.payer_id)}
                className={cx("flex items-start justify-between gap-3 rounded border px-3 py-2 text-left text-sm", pick === c.payer_id ? "border-navy bg-navy/5" : "border-line hover:bg-sunken")}
              >
                <span className="min-w-0">
                  <span className="font-medium">{c.payer?.name}</span>
                  <span className="ml-2 text-xs text-ink3">{c.unit_codes.map((u) => `${u}호`).join(", ")}</span>
                  <span className="block text-xs text-ink2">{c.reasons.join(" · ")}</span>
                </span>
                <span className="num shrink-0 text-xs text-ink2">미납 {c.unpaid.toLocaleString("ko-KR")}</span>
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
        <FeeFields value={fees} onChange={setFees} />
      </div>
    </Dialog>
  );
}

/** 입금 기록 — 은행 거래내역에 없는 돈(현금 등)을 적는다. 호실이나 이름으로 납부자를 먼저 찾는다 */
export function PaymentDialog({ payerId, onClose }: { payerId: string | null; onClose: () => void }) {
  const { branchId, today } = useBranch();
  const payers = usePayers();
  const [payer, setPayer] = useState(payerId ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const [fees, setFees] = useState({ platform_fee: null as number | null, pass_through: null as number | null, reason: "" });
  const [err, setErr] = useState<string | null>(null);
  const picked = (payers.data ?? []).find((p) => p.payer_id === payer);
  const save = useApiMutation<{ allocated: number; left: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => (r.allocated ? `입금을 기록했다 · ${won(r.allocated)} 청구를 채웠다${r.left > 0 ? ` · 입금 잔액 ${won(r.left)}` : ""}` : "입금을 기록했다 · 채울 청구가 없어 입금 잔액으로 둔다"),
    onSuccess: onClose,
  });
  const submit = () => {
    setErr(null);
    if (!amount || amount <= 0) return setErr("입금 금액을 적는다");
    if (!payer && branchId === "all") return setErr("전 지점 보기에서는 납부자를 먼저 고른다");
    save.mutate({
      path: "/api/billing/receipts",
      body: { branch_id: branchId, payer_id: payer || undefined, depositor_name: name || picked?.payer?.name, amount, received_at: date, memo, platform_fee: fees.platform_fee ?? 0, pass_through: fees.pass_through ?? 0, pass_through_reason: fees.reason },
    });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="입금 기록"
      description="은행 거래내역에 없는 돈(현금 등)을 적는다. 호실이나 이름으로 납부자를 먼저 찾는다. 납부자를 고르면 오래된 청구부터 채운다."
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
              .sort((a, b) => (a.unit_codes[0] ?? "").localeCompare(b.unit_codes[0] ?? "", "ko", { numeric: true }))
              .map((p) => ({ value: p.payer_id, label: `${p.unit_codes.map((c) => `${c}호`).join(", ")} · ${p.payer?.name}` }))}
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
        <FeeFields value={fees} onChange={setFees} />
        <Field label="메모" htmlFor="pay-memo">
          <Textarea id="pay-memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 현장 카드 결제" />
        </Field>
      </div>
    </Dialog>
  );
}
