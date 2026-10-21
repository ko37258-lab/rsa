import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { plusDays, plusMonths } from "@/lib/dates";
import { cx, won } from "@/lib/format";
import { NATIONALITY, SOURCES, VAT_MODE } from "@/lib/codes";
import { Button, Dialog, Field, FormGrid, Input, MoneyInput, Segmented, Select, Textarea } from "@/components/ui";
import type { Lease, Party, PartyCard, Staff, Unit } from "@/types";
import { CustomerPicker } from "./CustomerPicker";
import { MONEY_KEYS } from "./types";
import { termLabel } from "./parts";

/** 상담 영역의 호실 목록 한 줄(필요한 칸만) */
type UnitOption = Unit & {
  type_name?: string | null;
  building_name?: string | null;
  today?: { state: string; free_from: string | null; free_until: string | null };
  type_list_rent?: number | null;
};

type InquiryLite = {
  id: string;
  branch_id?: string | null;
  party_id?: string;
  party?: PartyCard | null;
  party_card?: PartyCard | null;
  desired_move_in?: string | null;
  stay_months?: number | null;
  source_group?: string;
};

const TERMS = [1, 3, 6, 12];

const STATE_LABEL: Record<string, string> = {
  vacant: "빈 방",
  hold: "홀드",
  reserved: "계약 잡힘",
  occupied: "거주 중",
  suspended: "운영중지",
  off_sale: "판매 안 함",
};

interface Form {
  unit_id: string;
  start_date: string;
  end_date: string;
  rent: number | null;
  mgmt_fee: number | null;
  deposit: number | null;
  mgmt_deposit: number | null;
  contract_fee: number | null;
  prepaid_rent: number | null;
  cleaning_fee: number | null;
  vat: Lease["vat"];
  source_group: string;
  assignee_id: string;
  memo: string;
}

export function LeaseCreateDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: { unitId?: string | null; inquiryId?: string | null; start?: string | null };
}) {
  const { branchId, today, me } = useBranch();
  const nav = useNavigate();
  const units = useApi<UnitOption[]>(["units", branchId, "for-lease"], open ? `/api/units?branch_id=${branchId}` : null);
  const staff = useApi<Staff[]>(["staff"], open ? "/api/staff" : null);
  const inquiry = useApi<InquiryLite>(["inquiries", "detail", initial.inquiryId], open && initial.inquiryId ? `/api/inquiries/${initial.inquiryId}` : null);

  const start0 = initial.start ?? plusDays(today, 7);
  const [form, setForm] = useState<Form>(() => ({
    unit_id: initial.unitId ?? "",
    start_date: start0,
    end_date: plusDays(plusMonths(start0, 6), -1),
    rent: null,
    mgmt_fee: null,
    deposit: 1000000,
    mgmt_deposit: 100000,
    contract_fee: 300000,
    prepaid_rent: 0,
    cleaning_fee: 80000,
    vat: "none",
    source_group: "",
    assignee_id: me?.id ?? "",
    memo: "",
  }));
  const [who, setWho] = useState<"inquiry" | "existing" | "new">(initial.inquiryId ? "inquiry" : "existing");
  const [contractor, setContractor] = useState<PartyCard | null>(null);
  const [newParty, setNewParty] = useState<{ kind: Party["kind"]; name: string; phone: string; email: string; nationality: string }>({ kind: "individual", name: "", phone: "", email: "", nationality: "KR" });
  const [separatePayer, setSeparatePayer] = useState(false);
  const [payer, setPayer] = useState<PartyCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const unit = useMemo(() => (units.data ?? []).find((u) => u.id === form.unit_id) ?? null, [units.data, form.unit_id]);

  // 호실을 고르면 모집가로 금액을 채운다(직접 고친 값은 덮지 않는다)
  useEffect(() => {
    if (!unit) return;
    setForm((f) => ({
      ...f,
      rent: f.rent ?? unit.asking_price?.rent ?? unit.type_list_rent ?? null,
      mgmt_fee: f.mgmt_fee ?? unit.asking_price?.mgmt ?? null,
      cleaning_fee: unit.area_m2 > 25 ? 120000 : f.cleaning_fee,
    }));
  }, [unit]);

  // 상담에서 왔으면 희망 입주일·기간·유입경로를 가져온다
  useEffect(() => {
    const q = inquiry.data;
    if (!q) return;
    setForm((f) => {
      const start = initial.start ?? q.desired_move_in ?? f.start_date;
      const months = q.stay_months && q.stay_months > 0 ? q.stay_months : 6;
      return { ...f, start_date: start, end_date: plusDays(plusMonths(start, months), -1), source_group: f.source_group || q.source_group || "" };
    });
  }, [inquiry.data, initial.start]);

  const inquiryParty = inquiry.data?.party ?? inquiry.data?.party_card ?? null;

  const save = useApiMutation<Lease>({
    invalidate: MONEY_KEYS,
    success: (l) => (l.status === "awaiting_signature" ? "계약을 만들고 서명을 요청했다" : "계약을 임시 저장했다"),
    onSuccess: (l) => {
      onClose();
      nav(`/leases/${l.id}`);
    },
  });

  const unitOptions = (units.data ?? [])
    .filter((u) => u.sale_status !== "off_sale" || u.id === form.unit_id)
    .sort((a, b) => (a.branch_id + a.code).localeCompare(b.branch_id + b.code, "ko", { numeric: true }))
    .map((u) => {
      const st = u.today?.state;
      const extra = st === "vacant" ? "빈 방" : st === "occupied" || st === "reserved" ? `${STATE_LABEL[st]}${u.today?.free_from ? ` · ${u.today.free_from.slice(5).replace("-", ".")}부터 빔` : ""}` : st ? STATE_LABEL[st] ?? st : "";
      return { value: u.id, label: `${branchId === "all" ? `${u.branch_id.replace("b_", "").toUpperCase()} · ` : ""}${u.code}호${u.type_name ? ` · ${u.type_name}` : ""}${extra ? ` — ${extra}` : ""}` };
    });

  const submit = (status: "draft" | "awaiting_signature") => {
    setErr(null);
    if (!form.unit_id) return setErr("호실을 고른다");
    if (!form.rent) return setErr("월세를 적는다");
    if (form.end_date < form.start_date) return setErr("만료일이 시작일보다 앞이다");
    const body: Record<string, unknown> = {
      unit_id: form.unit_id,
      inquiry_id: initial.inquiryId || undefined,
      start_date: form.start_date,
      end_date: form.end_date,
      rent: form.rent,
      mgmt_fee: form.mgmt_fee ?? 0,
      deposit: form.deposit ?? 0,
      mgmt_deposit: form.mgmt_deposit ?? 0,
      contract_fee: form.contract_fee ?? 0,
      prepaid_rent: form.prepaid_rent ?? 0,
      cleaning_fee: form.cleaning_fee ?? 0,
      vat: form.vat,
      source_group: form.source_group || undefined,
      assignee_id: form.assignee_id || undefined,
      memo: form.memo,
      status,
    };
    if (who === "existing") {
      if (!contractor) return setErr("계약자를 고른다");
      body.contractor_id = contractor.id;
    } else if (who === "new") {
      if (!newParty.name.trim()) return setErr("계약자 이름을 적는다");
      body.contractor_new = newParty;
    } else if (!initial.inquiryId) return setErr("계약자를 고른다");
    if (separatePayer) {
      if (!payer) return setErr("납부자를 고른다");
      body.payer_id = payer.id;
    }
    save.mutate({ path: "/api/leases", method: "POST", body });
  };

  const months = form.start_date && form.end_date >= form.start_date ? termLabel(form.start_date, form.end_date) : "—";
  const firstBill = (form.rent ?? 0) + (form.mgmt_fee ?? 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="계약 작성"
      description="임시 저장은 호실 일정을 잡기만 한다. 서명 요청까지 보내면 계약자에게 전자계약 메일이 나간다."
      footer={
        <>
          {(err || save.error) && <p className="mr-auto self-center text-xs text-bad">{err ?? save.error?.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button onClick={() => submit("draft")} loading={save.isPending && save.variables?.body !== undefined && (save.variables.body as { status?: string }).status === "draft"}>
            임시 저장
          </Button>
          <Button variant="primary" onClick={() => submit("awaiting_signature")} loading={save.isPending && (save.variables?.body as { status?: string } | undefined)?.status === "awaiting_signature"}>
            서명 요청까지
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">호실 · 기간</legend>
          <Field label="호실" htmlFor="lc-unit" hint={units.isError ? "호실 목록을 불러오지 못했다" : unit?.asking_price ? `모집가 월 ${won(unit.asking_price.rent)} · 관리비 ${won(unit.asking_price.mgmt)}` : undefined}>
            <Select id="lc-unit" value={form.unit_id} onChange={(e) => set("unit_id", e.target.value)} options={unitOptions} placeholder={units.isLoading ? "불러오는 중" : "호실 고르기"} />
          </Field>
          <FormGrid cols={3}>
            <Field label="시작일" htmlFor="lc-start">
              <Input
                id="lc-start"
                type="date"
                value={form.start_date}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const keep = termLabel(f.start_date, f.end_date).match(/^(\d+)개월$/);
                    return { ...f, start_date: v, end_date: keep ? plusDays(plusMonths(v, Number(keep[1])), -1) : f.end_date };
                  });
                }}
              />
            </Field>
            <Field label="만료일" htmlFor="lc-end" hint={`기간 ${months}`}>
              <Input id="lc-end" type="date" value={form.end_date} min={form.start_date} onChange={(e) => set("end_date", e.target.value)} />
            </Field>
            <Field label="기간 빨리 고르기">
              <div className="flex gap-1">
                {TERMS.map((m) => {
                  const end = plusDays(plusMonths(form.start_date, m), -1);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, end_date: end, deposit: m <= 1 ? 500000 : f.deposit === 500000 ? 1000000 : f.deposit, prepaid_rent: m <= 1 ? f.rent ?? 0 : 0 }))
                      }
                      className={cx("h-9 flex-1 rounded border text-[13px] font-medium", form.end_date === end ? "border-navy bg-navy text-navy-fg" : "border-line bg-surface hover:bg-sunken")}
                    >
                      {m}개월
                    </button>
                  );
                })}
              </div>
            </Field>
          </FormGrid>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">계약자</legend>
          <Segmented
            value={who}
            onChange={setWho}
            size="sm"
            options={[...(initial.inquiryId ? [{ value: "inquiry" as const, label: "상담 고객" }] : []), { value: "existing" as const, label: "기존 고객" }, { value: "new" as const, label: "새 고객" }]}
          />
          {who === "inquiry" && (
            <p className="rounded border border-line bg-sunken/60 px-3 py-2 text-sm">
              {inquiryParty ? (
                <>
                  <span className="font-medium">{inquiryParty.name}</span>
                  <span className="num ml-2 text-xs text-ink3">{inquiryParty.phone}</span>
                </>
              ) : (
                "상담의 문의자"
              )}
              <span className="ml-2 text-xs text-ink3">을(를) 계약자로 한다</span>
            </p>
          )}
          {who === "existing" && <CustomerPicker id="lc-contractor" value={contractor} onChange={setContractor} />}
          {who === "new" && (
            <FormGrid>
              <Field label="종류" htmlFor="lc-kind">
                <Select id="lc-kind" value={newParty.kind} onChange={(e) => setNewParty((p) => ({ ...p, kind: e.target.value as Party["kind"] }))} options={[{ value: "individual", label: "개인" }, { value: "corporation", label: "법인" }]} />
              </Field>
              <Field label={newParty.kind === "corporation" ? "회사명" : "이름"} htmlFor="lc-name">
                <Input id="lc-name" value={newParty.name} onChange={(e) => setNewParty((p) => ({ ...p, name: e.target.value }))} />
              </Field>
              <Field label="전화" htmlFor="lc-phone">
                <Input id="lc-phone" inputMode="tel" placeholder="010-… 또는 +81 …" value={newParty.phone} onChange={(e) => setNewParty((p) => ({ ...p, phone: e.target.value }))} />
              </Field>
              <Field label="이메일" htmlFor="lc-email">
                <Input id="lc-email" type="email" value={newParty.email} onChange={(e) => setNewParty((p) => ({ ...p, email: e.target.value }))} />
              </Field>
              <Field label="국적" htmlFor="lc-nat">
                <Select id="lc-nat" value={newParty.nationality} onChange={(e) => setNewParty((p) => ({ ...p, nationality: e.target.value }))} options={Object.entries(NATIONALITY).map(([value, label]) => ({ value, label }))} />
              </Field>
            </FormGrid>
          )}
          <label className="flex items-center gap-2 text-sm text-ink2">
            <input id="lc-sep-payer" type="checkbox" checked={separatePayer} onChange={(e) => setSeparatePayer(e.target.checked)} className="size-4 accent-[rgb(var(--navy))]" />
            납부자가 따로 있다(법인 대납 등)
          </label>
          {separatePayer && <CustomerPicker id="lc-payer" value={payer} onChange={setPayer} />}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">금액</legend>
          <FormGrid cols={3}>
            <Field label="월세" htmlFor="lc-rent">
              <MoneyInput id="lc-rent" value={form.rent} onChange={(v) => set("rent", v)} />
            </Field>
            <Field label="관리비" htmlFor="lc-mgmt">
              <MoneyInput id="lc-mgmt" value={form.mgmt_fee} onChange={(v) => set("mgmt_fee", v)} />
            </Field>
            <Field label="부가세" htmlFor="lc-vat">
              <Select id="lc-vat" value={form.vat} onChange={(e) => set("vat", e.target.value as Lease["vat"])} options={Object.entries(VAT_MODE).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="보증금" htmlFor="lc-deposit">
              <MoneyInput id="lc-deposit" value={form.deposit} onChange={(v) => set("deposit", v)} />
            </Field>
            <Field label="관리비 보증금" htmlFor="lc-mdep">
              <MoneyInput id="lc-mdep" value={form.mgmt_deposit} onChange={(v) => set("mgmt_deposit", v)} />
            </Field>
            <Field label="계약금" htmlFor="lc-cfee" hint="서명 직후 받고, 보증금에서 뺀 나머지를 잔금으로 받는다">
              <MoneyInput id="lc-cfee" value={form.contract_fee} onChange={(v) => set("contract_fee", v)} />
            </Field>
            <Field label="선납임대료" htmlFor="lc-pre">
              <MoneyInput id="lc-pre" value={form.prepaid_rent} onChange={(v) => set("prepaid_rent", v)} />
            </Field>
            <Field label="퇴실청소비" htmlFor="lc-clean">
              <MoneyInput id="lc-clean" value={form.cleaning_fee} onChange={(v) => set("cleaning_fee", v)} />
            </Field>
            <Field label="첫 달 청구" hint="월세 + 관리비(부가세 별도면 10% 더)">
              <div className="num flex h-9 items-center rounded border border-dashed border-line px-3 text-sm font-semibold">{won(form.vat === "excluded" ? Math.round(firstBill * 1.1) : firstBill)}</div>
            </Field>
          </FormGrid>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">기타</legend>
          <FormGrid>
            <Field label="유입경로" htmlFor="lc-src">
              <Select id="lc-src" value={form.source_group} onChange={(e) => set("source_group", e.target.value)} options={Object.keys(SOURCES).map((k) => ({ value: k, label: k }))} placeholder="정하지 않음" />
            </Field>
            <Field label="담당" htmlFor="lc-assignee">
              <Select
                id="lc-assignee"
                value={form.assignee_id}
                onChange={(e) => set("assignee_id", e.target.value)}
                options={[...(me ? [{ value: me.id, label: `${me.name} (나)` }] : []), ...(staff.data ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.role}` }))]}
                placeholder="담당 없음"
              />
            </Field>
          </FormGrid>
          <Field label="메모" htmlFor="lc-memo">
            <Textarea id="lc-memo" rows={2} value={form.memo} onChange={(e) => set("memo", e.target.value)} placeholder="특약, 할인 사유 등" />
          </Field>
        </fieldset>
      </div>
    </Dialog>
  );
}
