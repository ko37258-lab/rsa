import type { BranchTerms } from "@/types";
import { Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui";

/**
 * 지점 계약 조건 기본값 입력칸 — 시작하기 마법사와 지점 설정이 같이 쓴다.
 * 설명 문구는 원본 PMS 의 청구 규칙 문장을 그대로 옮겼다.
 */
export function TermsForm({ value, onChange, idPrefix }: { value: BranchTerms; onChange: (t: BranchTerms) => void; idPrefix: string }) {
  const set = <K extends keyof BranchTerms>(k: K, v: BranchTerms[K]) => onChange({ ...value, [k]: v });
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="label-caps mb-1">청구 방식</legend>
        <FormGrid>
          <Field label="청구 주기" htmlFor={id("cycle")} hint={value.cycle === "calendar" ? "달력 월로 끊고, 매월 청구일에 청구한다" : "입주일부터 한 달씩 끊어 입주일과 같은 날 청구한다"}>
            <Select
              id={id("cycle")}
              value={value.cycle}
              onChange={(e) => set("cycle", e.target.value as BranchTerms["cycle"])}
              options={[
                { value: "anniversary", label: "입주일 기준 매월" },
                { value: "calendar", label: "달력 월 · 청구일 지정" },
              ]}
            />
          </Field>
          {value.cycle === "calendar" && (
            <Field label="청구일(매월)" htmlFor={id("bill_day")} hint="청구일이 그 달에 없으면 말일">
              <Input id={id("bill_day")} type="number" min={1} max={31} value={value.bill_day} onChange={(e) => set("bill_day", Number(e.target.value) || 1)} />
            </Field>
          )}
          <Field label="선불 · 후불" htmlFor={id("billing_mode")} hint="선불은 그 달치를 직전 청구일에, 후불은 지난 달치를 다음 청구일에 청구한다">
            <Select
              id={id("billing_mode")}
              value={value.billing_mode}
              onChange={(e) => set("billing_mode", e.target.value as BranchTerms["billing_mode"])}
              options={[
                { value: "prepaid", label: "선불" },
                { value: "postpaid", label: "후불" },
              ]}
            />
          </Field>
          <Field label="납기" htmlFor={id("due_days")} hint={value.due_days === 0 ? "청구일이 곧 납기" : `청구일부터 ${value.due_days}일 뒤가 납기`}>
            <div className="relative">
              <Input id={id("due_days")} type="number" min={0} max={60} value={value.due_days} onChange={(e) => set("due_days", Math.max(0, Number(e.target.value) || 0))} className="pr-14" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink3">일 뒤</span>
            </div>
          </Field>
          <Field label="관리비" htmlFor={id("mgmt_mode")} hint={value.mgmt_mode === "bill" ? "고지서 청구는 늘 후불이다. 고지서가 오면 금액을 넣는다" : "계약서의 관리비를 월세와 같이 청구한다"}>
            <Select
              id={id("mgmt_mode")}
              value={value.mgmt_mode}
              onChange={(e) => set("mgmt_mode", e.target.value as BranchTerms["mgmt_mode"])}
              options={[
                { value: "fixed", label: "계약 금액 고정" },
                { value: "bill", label: "고지서 금액(매달 입력)" },
              ]}
            />
          </Field>
          <Field label="부가세" htmlFor={id("vat")} hint="법인 계약은 계약마다 따로 고를 수 있다">
            <Select
              id={id("vat")}
              value={value.vat}
              onChange={(e) => set("vat", e.target.value as BranchTerms["vat"])}
              options={[
                { value: "none", label: "부가세 없음" },
                { value: "excluded", label: "부가세 별도" },
                { value: "included", label: "부가세 포함" },
              ]}
            />
          </Field>
          <Field label="청구서 메일 시각" htmlFor={id("send_hour")} hint={`청구일 ${value.send_hour}시에 계약자에게 메일로 나간다`}>
            <Select id={id("send_hour")} value={String(value.send_hour)} onChange={(e) => set("send_hour", Number(e.target.value))} options={Array.from({ length: 15 }, (_, i) => ({ value: String(i + 7), label: `${i + 7}시` }))} />
          </Field>
        </FormGrid>
        <label className="flex items-start gap-2 text-sm text-ink2" htmlFor={id("prorate")}>
          <input id={id("prorate")} type="checkbox" checked={value.prorate} onChange={(e) => set("prorate", e.target.checked)} className="mt-0.5 size-4 accent-[rgb(var(--navy))]" />
          <span>
            일할 계산
            <span className="block text-xs text-ink3">첫 달·마지막 달은 그 달 실제 일수로 일할한다</span>
          </span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="label-caps mb-1">기본 금액</legend>
        <FormGrid cols={3}>
          <Field label="보증금" htmlFor={id("deposit")}>
            <MoneyInput id={id("deposit")} value={value.deposit} onChange={(v) => set("deposit", v ?? 0)} />
          </Field>
          <Field label="관리비 보증금" htmlFor={id("mgmt_deposit")}>
            <MoneyInput id={id("mgmt_deposit")} value={value.mgmt_deposit} onChange={(v) => set("mgmt_deposit", v ?? 0)} />
          </Field>
          <Field label="계약금" htmlFor={id("contract_fee")} hint="서명 직후 받는다">
            <MoneyInput id={id("contract_fee")} value={value.contract_fee} onChange={(v) => set("contract_fee", v ?? 0)} />
          </Field>
          <Field label="퇴실청소비 · 25㎡ 이하" htmlFor={id("cleaning_small")}>
            <MoneyInput id={id("cleaning_small")} value={value.cleaning_fee_small} onChange={(v) => set("cleaning_fee_small", v ?? 0)} />
          </Field>
          <Field label="퇴실청소비 · 25㎡ 초과" htmlFor={id("cleaning_large")}>
            <MoneyInput id={id("cleaning_large")} value={value.cleaning_fee_large} onChange={(v) => set("cleaning_fee_large", v ?? 0)} />
          </Field>
        </FormGrid>
      </fieldset>
    </div>
  );
}

export const DEFAULT_TERMS: BranchTerms = {
  deposit: 1000000,
  mgmt_deposit: 100000,
  contract_fee: 300000,
  cleaning_fee_small: 80000,
  cleaning_fee_large: 120000,
  cycle: "anniversary",
  billing_mode: "prepaid",
  bill_day: 25,
  prorate: true,
  due_days: 0,
  mgmt_mode: "fixed",
  vat: "none",
  send_hour: 9,
};
