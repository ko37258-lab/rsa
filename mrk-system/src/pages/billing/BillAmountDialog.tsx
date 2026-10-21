import { useState } from "react";
import { useApiMutation } from "@/lib/hooks";
import { VAT_MODE } from "@/lib/codes";
import { won } from "@/lib/format";
import { Button, Dialog, Field, FormGrid, MoneyInput, Select } from "@/components/ui";
import type { Charge, VatMode } from "@/types";
import { MONEY_KEYS, lineMeta, type Line } from "./api";

/** 발송 대기 청구 금액 넣기 — 관리비 고지서 금액, 또는 확인 전 금액 고치기 */
export function BillAmountDialog({ line, onClose }: { line: Line; onClose: () => void }) {
  // 부가세가 붙은 줄이면 "별도"(공급가 입력)로 본다 — 별도·포함은 금액만으로는 구분되지 않는다
  const guessVat: VatMode = line.vat_amount !== 0 ? "excluded" : "none";
  const [amount, setAmount] = useState<number | null>(line.needs_amount ? null : Math.abs(line.supply));
  const [vat, setVat] = useState<VatMode>(guessVat);
  const save = useApiMutation<Charge>({
    invalidate: MONEY_KEYS,
    success: (c) => `${c.label} ${won(c.amount)}${line.needs_amount ? " · 고지서 금액을 넣었다" : "으로 고쳤다"}`,
    onSuccess: onClose,
  });
  const total = amount === null ? 0 : vat === "excluded" ? Math.round(amount * 1.1) : amount;
  return (
    <Dialog
      open
      onClose={onClose}
      title={line.needs_amount ? "고지서 금액 넣기" : "청구 금액 고치기"}
      description={`${line.unit_code ? `${line.unit_code}호 · ` : ""}${line.label} · ${lineMeta(line)}. 확인 전(발송 대기) 청구만 고칠 수 있다.`}
      footer={
        <>
          {save.error && <p className="mr-auto self-center text-xs text-bad">{save.error.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={amount === null} loading={save.isPending} onClick={() => save.mutate({ path: `/api/billing/charges/${line.id}`, method: "PATCH", body: { amount, vat } })}>
            저장
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field
          label={line.kind === "discount" ? "할인액" : vat === "included" ? "금액(부가세 포함)" : "공급가"}
          htmlFor="ba-amount"
          hint={line.needs_amount ? "관리사무소 고지서에 적힌 이 호실 금액" : vat === "excluded" ? "부가세 10%를 더해 청구한다" : undefined}
        >
          <MoneyInput id="ba-amount" value={amount} onChange={setAmount} />
        </Field>
        <Field label="부가세" htmlFor="ba-vat">
          <Select id="ba-vat" value={vat} onChange={(e) => setVat(e.target.value as VatMode)} options={Object.entries(VAT_MODE).map(([value, label]) => ({ value, label }))} />
        </Field>
      </FormGrid>
      <p className="num mt-3 text-sm">
        청구 금액 <b>{won(line.kind === "discount" ? -total : total)}</b>
      </p>
    </Dialog>
  );
}
