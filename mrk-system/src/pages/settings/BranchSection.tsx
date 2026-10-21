import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Dialog, Field, FormGrid, Input, MoneyInput, Section, Select } from "@/components/ui";
import { useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import type { BankAccount, Branch, BranchTerms, CommissionTerm } from "@/types";
import { TermsForm, DEFAULT_TERMS } from "./TermsForm";

type Draft = {
  name: string;
  name_en: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  terms: BranchTerms;
  commission: CommissionTerm;
  accounts: BankAccount[];
};

const toDraft = (b: Branch): Draft => ({
  name: b.name,
  name_en: b.name_en,
  code: b.code,
  address: b.address,
  phone: b.phone,
  email: b.email,
  terms: { ...DEFAULT_TERMS, ...(b.terms ?? {}) },
  commission: { ...b.commission },
  accounts: (b.accounts ?? []).map((a) => ({ ...a })),
});

let acSeq = 0;

export function BranchSection() {
  const { branches, branchId } = useBranch();
  const [editId, setEditId] = useState<string>("");
  const current = branches.find((b) => b.id === editId) ?? branches.find((b) => b.id === branchId) ?? branches[0];
  const [draft, setDraft] = useState<Draft | null>(current ? toDraft(current) : null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (current) setDraft(toDraft(current));
    // 지점을 바꾸거나 저장 뒤 새 값이 오면 다시 채운다
  }, [current]);

  const save = useApiMutation<Branch>({ invalidate: [["branches"], ["setup"], ["leases"], ["billing"]], success: "지점 설정을 저장했다" });
  const add = useApiMutation<Branch>({
    invalidate: [["branches"], ["setup"]],
    success: (b) => `${b.name}을(를) 더했다`,
    onSuccess: (b) => {
      setAdding(false);
      setNewName("");
      setEditId(b.id);
    },
  });

  if (!current || !draft) return <Section title="지점">지점이 없다</Section>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setAcc = (i: number, patch: Partial<BankAccount>) => set("accounts", draft.accounts.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const setFmt = (i: number, k: "date" | "name" | "amount" | "memo", v: string) =>
    setAcc(i, { format: { date: "", name: "", amount: "", memo: null, ...(draft.accounts[i].format ?? {}), [k]: k === "memo" ? v || null : v } });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="고칠 지점" htmlFor="br-pick" className="w-full sm:w-64">
          <Select id="br-pick" value={current.id} onChange={(e) => setEditId(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </Field>
        <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
          지점 추가
        </Button>
      </div>

      <Section title="지점 정보">
        <FormGrid>
          <Field label="지점 이름" htmlFor="br-name">
            <Input id="br-name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="지점 영문 이름" htmlFor="br-en" hint="English 답장 서명에 쓴다">
            <Input id="br-en" value={draft.name_en} onChange={(e) => set("name_en", e.target.value)} />
          </Field>
          <Field label="지점 코드" htmlFor="br-code" hint="지점 운영정책 번호 앞에 붙는다(예: SC-001)">
            <Input id="br-code" value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={6} />
          </Field>
          <Field label="대표 전화" htmlFor="br-phone">
            <Input id="br-phone" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="주소" htmlFor="br-addr" className="sm:col-span-2">
            <Input id="br-addr" value={draft.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="받는 메일" htmlFor="br-mail">
            <Input id="br-mail" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </FormGrid>
      </Section>

      <Section title="계약 조건 기본값" hint="새 계약을 쓸 때 먼저 채워지는 값. 이미 있는 계약은 바뀌지 않는다.">
        <TermsForm idPrefix="br-terms" value={draft.terms} onChange={(t) => set("terms", t)} />
      </Section>

      <Section
        title="입금 계좌"
        hint="은행 거래내역 엑셀을 올릴 때 이 계좌의 머리글 이름으로 날짜·입금자·금액 칸을 찾는다. 비워 두면 올릴 때 자동으로 찾는다."
        actions={
          <Button
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => set("accounts", [...draft.accounts, { id: `ac_new${++acSeq}`, branch_id: current.id, bank: "", number: "", holder: "", format: null }])}
          >
            계좌 더하기
          </Button>
        }
      >
        {draft.accounts.length === 0 ? (
          <p className="text-sm text-ink3">등록한 계좌가 없다</p>
        ) : (
          <div className="flex flex-col gap-3">
            {draft.accounts.map((a, i) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-md border border-line p-3">
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                  <Field label="은행" htmlFor={`ac-bank-${i}`}>
                    <Input id={`ac-bank-${i}`} value={a.bank} onChange={(e) => setAcc(i, { bank: e.target.value })} />
                  </Field>
                  <Field label="계좌번호" htmlFor={`ac-num-${i}`}>
                    <Input id={`ac-num-${i}`} value={a.number} onChange={(e) => setAcc(i, { number: e.target.value })} />
                  </Field>
                  <Field label="예금주" htmlFor={`ac-holder-${i}`}>
                    <Input id={`ac-holder-${i}`} value={a.holder} onChange={(e) => setAcc(i, { holder: e.target.value })} />
                  </Field>
                  <button
                    type="button"
                    aria-label="이 계좌 지우기"
                    onClick={() => set("accounts", draft.accounts.filter((_, j) => j !== i))}
                    className="mb-1 inline-flex size-8 items-center justify-center rounded text-ink3 hover:bg-sunken hover:text-bad"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(
                    [
                      ["date", "날짜 칸 머리글", "거래일시"],
                      ["name", "입금자 칸 머리글", "기재내용"],
                      ["amount", "금액 칸 머리글", "입금액"],
                      ["memo", "메모 칸 머리글", "적요"],
                    ] as const
                  ).map(([k, label, ph]) => (
                    <Field key={k} label={label} htmlFor={`ac-${k}-${i}`}>
                      <Input id={`ac-${k}-${i}`} value={(a.format?.[k] as string | null) ?? ""} onChange={(e) => setFmt(i, k, e.target.value)} placeholder={ph} />
                    </Field>
                  ))}
                </div>
                {i === 0 && <p className="text-xs text-ink3">첫 계좌가 청구서에 적히는 대표 계좌다</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="지점 수수료" hint="장부의 «홈즈 매출»을 계산하는 기준">
        <FormGrid cols={3}>
          <Field label="방식" htmlFor="br-cm-structure">
            <Select
              id="br-cm-structure"
              value={draft.commission.structure}
              onChange={(e) => set("commission", { ...draft.commission, structure: e.target.value as CommissionTerm["structure"] })}
              options={[
                { value: "rate", label: "기준 매출 × 비율" },
                { value: "fixed_minus", label: "기준 매출 − 고정 지급" },
              ]}
            />
          </Field>
          {draft.commission.structure === "rate" ? (
            <Field label="비율(%)" htmlFor="br-cm-rate">
              <Input id="br-cm-rate" type="number" step="0.1" min={0} max={100} value={draft.commission.rate_bp / 100} onChange={(e) => set("commission", { ...draft.commission, rate_bp: Math.round((Number(e.target.value) || 0) * 100) })} />
            </Field>
          ) : (
            <Field label="고정 지급액(월)" htmlFor="br-cm-fixed">
              <MoneyInput id="br-cm-fixed" value={draft.commission.fixed_amount} onChange={(v) => set("commission", { ...draft.commission, fixed_amount: v ?? 0 })} />
            </Field>
          )}
        </FormGrid>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 rounded-md border border-line bg-surface/95 px-3 py-2.5 backdrop-blur" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))" }}>
        <Button onClick={() => setDraft(toDraft(current))}>되돌리기</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ path: `/api/branches/${current.id}`, method: "PATCH", body: draft })}>
          {current.name} 저장
        </Button>
      </div>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="지점 추가"
        description="계약 조건은 첫 지점 값을 가져온다. 추가한 뒤 이 화면에서 고친다."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>취소</Button>
            <Button variant="primary" disabled={!newName.trim()} loading={add.isPending} onClick={() => add.mutate({ path: "/api/branches", body: { name: newName } })}>
              추가
            </Button>
          </>
        }
      >
        <Field label="지점 이름" htmlFor="br-new-name">
          <Input id="br-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: MR.K 주안점" autoFocus />
        </Field>
      </Dialog>
    </div>
  );
}
