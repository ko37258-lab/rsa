import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button, Field, FormGrid, Input, MoneyInput, Select, useToast } from "@/components/ui";
import { api } from "@/api/client";
import { useBranch } from "@/lib/branch";
import { cx, won } from "@/lib/format";
import { expandUnitSpec, floorOf, type SetupInput, type SetupRange, type SetupRoomType } from "@/mock/empty";
import type { BranchTerms } from "@/types";
import { TermsForm, DEFAULT_TERMS } from "./TermsForm";

const STEPS = ["회사 · 지점", "계약 조건", "룸타입", "호실", "확인"] as const;

let keySeq = 0;
const newKey = () => `t${++keySeq}`;

interface Preview {
  codes: Array<{ code: string; type: string; floor: number | null }>;
  error: string | null;
}

function preview(ranges: SetupRange[], types: SetupRoomType[]): Preview {
  const codes: Preview["codes"] = [];
  const seen = new Set<string>();
  for (const r of ranges) {
    if (!r.spec.trim()) continue;
    let list: string[];
    try {
      list = expandUnitSpec(r.spec);
    } catch (e) {
      return { codes, error: e instanceof Error ? e.message : "범위를 다시 확인한다" };
    }
    for (const c of list) {
      if (seen.has(c)) return { codes, error: `호실 번호가 겹친다: ${c}` };
      seen.add(c);
      codes.push({ code: c, type: types.find((t) => t.key === r.type_key)?.name || "룸타입 미정", floor: floorOf(c) });
    }
  }
  return { codes, error: null };
}

/** 「빈 상태로 시작」 — 시연 데이터를 내 지점·룸타입·호실로 바꾼다 */
export function SetupWizard({ onCancel, realMode }: { onCancel: () => void; realMode: boolean }) {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState("");
  const [branch, setBranch] = useState({ name: "", name_en: "", address: "", phone: "", email: "", bank: "", account_number: "", holder: "" });
  const [terms, setTerms] = useState<BranchTerms>(DEFAULT_TERMS);
  const [types, setTypes] = useState<SetupRoomType[]>(() => {
    const k = newKey();
    return [{ key: k, name: "스탠다드", area_m2: 14, list_rent: 600000, list_mgmt: 80000 }];
  });
  const [ranges, setRanges] = useState<SetupRange[]>([{ spec: "", type_key: "" }]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const { setBranchId } = useBranch();

  const pv = useMemo(() => preview(ranges.map((r) => ({ ...r, type_key: r.type_key || types[0]?.key || "" })), types), [ranges, types]);
  const byFloor = useMemo(() => {
    const m = new Map<string, Preview["codes"]>();
    for (const c of pv.codes) {
      const k = c.floor === null ? "층 미정" : `${c.floor}층`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.entries()];
  }, [pv]);

  const stepError = (s: number): string | null => {
    if (s === 0) {
      if (!company.trim()) return "회사 이름을 적는다";
      if (!branch.name.trim()) return "지점 이름을 적는다";
    }
    if (s === 2) {
      if (!types.length) return "룸타입을 하나 이상 만든다";
      const bad = types.find((t) => !t.name.trim() || !(t.list_rent > 0));
      if (bad) return `${bad.name || "이름 없는 룸타입"}의 이름과 정가 월세를 적는다`;
    }
    if (s === 3) {
      if (pv.error) return pv.error;
      if (!pv.codes.length) return "호실 번호를 적는다. 예: 101-105, 201-205";
      if (pv.codes.length > 500) return "호실은 한 번에 500개까지 만든다";
    }
    if (s === 4 && realMode && !agree) return "지금 쓰는 데이터를 바꾼다는 데 동의한다";
    return null;
  };
  const err = stepError(step);

  const start = async () => {
    const setup: SetupInput = {
      company_name: company,
      branch,
      terms,
      room_types: types,
      ranges: ranges.filter((r) => r.spec.trim()).map((r) => ({ spec: r.spec, type_key: r.type_key || types[0].key })),
    };
    setBusy(true);
    try {
      await api("/api/setup/start", { method: "POST", body: setup });
      setBranchId("all");
      await qc.resetQueries();
      toast.show(`${branch.name}을(를) 호실 ${pv.codes.length}개로 시작했다`, "good");
      nav("/dashboard");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "시작하지 못했다", "bad");
    } finally {
      setBusy(false);
    }
  };

  const setB = (k: keyof typeof branch, v: string) => setBranch((b) => ({ ...b, [k]: v }));

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-x-1 gap-y-2" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <button
              type="button"
              disabled={i > step && !!stepError(step)}
              onClick={() => (i <= step || !stepError(step) ? setStep(Math.min(i, step + 1)) : undefined)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                i === step ? "bg-navy text-navy-fg" : i < step ? "bg-good/12 text-good" : "bg-sunken text-ink3",
              )}
            >
              {i < step ? <Check className="size-3" /> : <span className="num">{i + 1}</span>}
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-3 bg-line" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <Field label="회사 이름" htmlFor="sw-company" hint="화면 아래와 청구서에 쓴다">
            <Input id="sw-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예: (주)미스터홈즈" />
          </Field>
          <FormGrid>
            <Field label="지점 이름" htmlFor="sw-bname">
              <Input id="sw-bname" value={branch.name} onChange={(e) => setB("name", e.target.value)} placeholder="예: MR.K 인하대점" />
            </Field>
            <Field label="지점 영문 이름" htmlFor="sw-ben" hint="English 답장 서명에 쓴다">
              <Input id="sw-ben" value={branch.name_en} onChange={(e) => setB("name_en", e.target.value)} placeholder="MR.K Inha" />
            </Field>
            <Field label="주소" htmlFor="sw-addr" className="sm:col-span-2">
              <Input id="sw-addr" value={branch.address} onChange={(e) => setB("address", e.target.value)} placeholder="인천 미추홀구 …" />
            </Field>
            <Field label="대표 전화" htmlFor="sw-phone">
              <Input id="sw-phone" value={branch.phone} onChange={(e) => setB("phone", e.target.value)} placeholder="032-…" />
            </Field>
            <Field label="받는 메일" htmlFor="sw-mail">
              <Input id="sw-mail" type="email" value={branch.email} onChange={(e) => setB("email", e.target.value)} placeholder="branch@…" />
            </Field>
          </FormGrid>
          <fieldset className="flex flex-col gap-3">
            <legend className="label-caps mb-1">월세 받는 계좌</legend>
            <FormGrid cols={3}>
              <Field label="은행" htmlFor="sw-bank">
                <Input id="sw-bank" value={branch.bank} onChange={(e) => setB("bank", e.target.value)} placeholder="국민" />
              </Field>
              <Field label="계좌번호" htmlFor="sw-acc">
                <Input id="sw-acc" inputMode="numeric" value={branch.account_number} onChange={(e) => setB("account_number", e.target.value)} placeholder="000-00-0000-000" />
              </Field>
              <Field label="예금주" htmlFor="sw-holder">
                <Input id="sw-holder" value={branch.holder} onChange={(e) => setB("holder", e.target.value)} />
              </Field>
            </FormGrid>
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink2">새 계약을 쓸 때 이 값이 먼저 채워진다. 계약마다 바꿀 수 있다.</p>
          <TermsForm idPrefix="sw-terms" value={terms} onChange={setTerms} />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink2">정가 월세·관리비는 호실 모집가와 공실 손실 계산의 기준이 된다.</p>
          {types.map((t, i) => (
            <div key={t.key} className="grid grid-cols-2 items-end gap-3 rounded-md border border-line p-3 sm:grid-cols-[1.4fr_0.8fr_1fr_1fr_auto]">
              <Field label="이름" htmlFor={`sw-t-name-${t.key}`} className="col-span-2 sm:col-span-1">
                <Input id={`sw-t-name-${t.key}`} value={t.name} onChange={(e) => setTypes((xs) => xs.map((x) => (x.key === t.key ? { ...x, name: e.target.value } : x)))} placeholder={`룸타입 ${i + 1}`} />
              </Field>
              <Field label="전용면적(㎡)" htmlFor={`sw-t-area-${t.key}`}>
                <Input id={`sw-t-area-${t.key}`} type="number" step="0.1" min={0} value={t.area_m2} onChange={(e) => setTypes((xs) => xs.map((x) => (x.key === t.key ? { ...x, area_m2: Number(e.target.value) || 0 } : x)))} />
              </Field>
              <Field label="정가 월세" htmlFor={`sw-t-rent-${t.key}`}>
                <MoneyInput id={`sw-t-rent-${t.key}`} value={t.list_rent} onChange={(v) => setTypes((xs) => xs.map((x) => (x.key === t.key ? { ...x, list_rent: v ?? 0 } : x)))} />
              </Field>
              <Field label="관리비" htmlFor={`sw-t-mgmt-${t.key}`}>
                <MoneyInput id={`sw-t-mgmt-${t.key}`} value={t.list_mgmt} onChange={(v) => setTypes((xs) => xs.map((x) => (x.key === t.key ? { ...x, list_mgmt: v ?? 0 } : x)))} />
              </Field>
              <button
                type="button"
                aria-label={`${t.name || "룸타입"} 지우기`}
                disabled={types.length <= 1}
                onClick={() => setTypes((xs) => xs.filter((x) => x.key !== t.key))}
                className="mb-1 inline-flex size-8 items-center justify-center rounded text-ink3 hover:bg-sunken hover:text-bad disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {types.length < 4 && (
            <div>
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setTypes((xs) => [...xs, { key: newKey(), name: "", area_m2: 18, list_rent: 0, list_mgmt: 80000 }])}>
                룸타입 더하기
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink2">
            범위는 <span className="num font-medium">101-105</span>처럼, 여러 개는 쉼표로 적는다. 층은 앞자리로 정한다(305 → 3층).
          </p>
          {ranges.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] items-end gap-3 sm:grid-cols-[1.6fr_1fr_auto]">
              <Field label={`호실 번호 ${i + 1}`} htmlFor={`sw-r-${i}`} className="col-span-2 sm:col-span-1">
                <Input id={`sw-r-${i}`} value={r.spec} onChange={(e) => setRanges((xs) => xs.map((x, j) => (j === i ? { ...x, spec: e.target.value } : x)))} placeholder="101-105, 201-205" />
              </Field>
              <Field label="룸타입" htmlFor={`sw-rt-${i}`}>
                <Select id={`sw-rt-${i}`} value={r.type_key || types[0]?.key} onChange={(e) => setRanges((xs) => xs.map((x, j) => (j === i ? { ...x, type_key: e.target.value } : x)))} options={types.map((t) => ({ value: t.key, label: t.name || "이름 없음" }))} />
              </Field>
              <button
                type="button"
                aria-label="이 줄 지우기"
                disabled={ranges.length <= 1}
                onClick={() => setRanges((xs) => xs.filter((_, j) => j !== i))}
                className="mb-1 inline-flex size-8 items-center justify-center rounded text-ink3 hover:bg-sunken hover:text-bad disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRanges((xs) => [...xs, { spec: "", type_key: types[types.length - 1]?.key ?? "" }])}>
              줄 더하기
            </Button>
          </div>
          <div className="rounded-md border border-line bg-sunken/50 p-3">
            <div className="mb-2 text-xs font-medium text-ink2">
              미리보기 · <span className="num">호실 {pv.codes.length}개</span>
            </div>
            {byFloor.length === 0 ? (
              <p className="text-xs text-ink3">호실 번호를 적으면 여기에 층별로 보인다</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {byFloor.map(([f, list]) => (
                  <div key={f} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-12 shrink-0 text-xs text-ink3">{f}</span>
                    {list.map((c) => (
                      <span key={c.code} title={c.type} className="num rounded border border-line bg-surface px-1.5 py-0.5 text-xs">
                        {c.code}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-3 rounded-md border border-line p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink3">회사 · 지점</dt>
              <dd className="font-medium">
                {company} · {branch.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">규모</dt>
              <dd className="num font-medium">
                호실 {pv.codes.length}개 · 룸타입 {types.length}개
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">청구</dt>
              <dd>
                {terms.cycle === "calendar" ? `달력 월 · 매월 ${terms.bill_day}일` : "입주일 기준 매월"} · {terms.billing_mode === "prepaid" ? "선불" : "후불"}
                {terms.prorate ? " · 일할" : ""} · {terms.due_days ? `납기 ${terms.due_days}일 뒤` : "청구일이 납기"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">기본 금액</dt>
              <dd className="num">
                보증금 {won(terms.deposit)} · 계약금 {won(terms.contract_fee)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink3">룸타입</dt>
              <dd className="num">{types.map((t) => `${t.name} ${won(t.list_rent)}`).join(" · ")}</dd>
            </div>
          </dl>
          <p className="text-sm text-ink2">운영정책·정형 답변·메일 서명은 기본 문구로 채워진다. 상담·계약·청구는 비어 있는 상태로 시작한다.</p>
          {realMode && (
            <label className="flex items-start gap-2 rounded-md border border-bad/40 bg-bad/5 p-3 text-sm text-bad" htmlFor="sw-agree">
              <input id="sw-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[rgb(var(--bad))]" />
              지금 쓰는 실사용 데이터가 이 내용으로 바뀐다. 백업 파일을 먼저 내려받았다.
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="min-h-[1.25rem] text-xs text-bad" role="alert">
          {err && step !== 4 ? err : step === 4 && err ? err : ""}
        </p>
        <div className="flex gap-2">
          <Button onClick={step === 0 ? onCancel : () => setStep((s) => s - 1)}>{step === 0 ? "그만두기" : "이전"}</Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" disabled={!!err} onClick={() => setStep((s) => s + 1)}>
              다음
            </Button>
          ) : (
            <Button variant="brass" loading={busy} disabled={!!err} onClick={start}>
              호실 {pv.codes.length}개로 시작
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
