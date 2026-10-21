import { useState } from "react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { CHARGE_KIND, VAT_MODE } from "@/lib/codes";
import { won } from "@/lib/format";
import { Button, Dialog, Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui";
import type { Charge, ChargeKind, VatMode } from "@/types";
import { MONEY_KEYS, type LeaseRow } from "@/pages/leases/types";

const KINDS: ChargeKind[] = ["usage", "damage", "penalty", "cleaning", "rent", "mgmt", "other"];

/** 계약에 청구 한 줄을 직접 더한다(발송 대기로 들어간다) */
export function DirectChargeDialog({ open, onClose, leaseId }: { open: boolean; onClose: () => void; leaseId?: string | null }) {
  const { branchId, today } = useBranch();
  const leases = useApi<LeaseRow[]>(["leases", branchId, "open"], open && !leaseId ? `/api/leases?branch_id=${branchId}&open_only=true` : null);
  const [lease, setLease] = useState(leaseId ?? "");
  const [kind, setKind] = useState<ChargeKind>("usage");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [due, setDue] = useState(today);
  const [vat, setVat] = useState<VatMode>("none");
  const [err, setErr] = useState<string | null>(null);
  const save = useApiMutation<Charge>({ invalidate: MONEY_KEYS, success: (c) => `${c.label} ${won(c.amount)} 청구를 만들었다 · 발송 대기`, onSuccess: onClose });

  const submit = () => {
    setErr(null);
    if (!lease) return setErr("계약을 고른다");
    if (!amount || amount <= 0) return setErr("금액을 적는다");
    save.mutate({ path: "/api/billing/charges", body: { lease_id: lease, kind, label: label.trim() || CHARGE_KIND[kind], amount, due_date: due, vat } });
  };

  const total = amount ? (vat === "excluded" ? Math.round(amount * 1.1) : amount) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="직접 청구"
      description="정해진 월 청구 밖의 돈(사용료, 원상복구, 위약금 등)을 청구한다. 만든 청구는 « 발송 대기 » 에 들어간다."
      footer={
        <>
          {(err || save.error) && <p className="mr-auto self-center text-xs text-bad">{err ?? save.error?.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            청구 만들기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!leaseId && (
          <Field label="계약" htmlFor="dc-lease">
            <Select
              id="dc-lease"
              value={lease}
              onChange={(e) => setLease(e.target.value)}
              placeholder={leases.isLoading ? "불러오는 중" : "계약 고르기"}
              options={(leases.data ?? [])
                .slice()
                .sort((a, b) => a.unit_code.localeCompare(b.unit_code, "ko", { numeric: true }))
                .map((l) => ({ value: l.id, label: `${branchId === "all" ? `${l.branch_name.replace("MR.K ", "")} · ` : ""}${l.unit_code}호 · ${l.contractor?.name ?? ""}` }))}
            />
          </Field>
        )}
        <FormGrid>
          <Field label="종류" htmlFor="dc-kind">
            <Select id="dc-kind" value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)} options={KINDS.map((k) => ({ value: k, label: CHARGE_KIND[k] }))} />
          </Field>
          <Field label="항목 이름" htmlFor="dc-label">
            <Input id="dc-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={CHARGE_KIND[kind]} />
          </Field>
          <Field label="금액(공급가)" htmlFor="dc-amount">
            <MoneyInput id="dc-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="부가세" htmlFor="dc-vat">
            <Select id="dc-vat" value={vat} onChange={(e) => setVat(e.target.value as VatMode)} options={Object.entries(VAT_MODE).map(([value, l]) => ({ value, label: l }))} />
          </Field>
          <Field label="납기일" htmlFor="dc-due">
            <Input id="dc-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="청구 금액">
            <div className="num flex h-9 items-center rounded border border-dashed border-line px-3 text-sm font-semibold">{won(total)}</div>
          </Field>
        </FormGrid>
      </div>
    </Dialog>
  );
}
