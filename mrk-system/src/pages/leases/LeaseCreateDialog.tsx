import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "@/api/client";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { plusDays, plusMonths } from "@/lib/dates";
import { cx, fmt, won } from "@/lib/format";
import { NATIONALITY, SOURCES, VAT_MODE } from "@/lib/codes";
import { Badge, Button, Dialog, Field, FormGrid, Input, MoneyInput, Segmented, Select, Textarea } from "@/components/ui";
import type { BillingCycle, BillingMode, Lease, MgmtMode, Party, PartyCard, Staff, Unit } from "@/types";
import { CustomerPicker } from "./CustomerPicker";
import { MONEY_KEYS, type BranchTermsRes, type LeaseDetail, type PreviewRes, type RentCapRes } from "./types";
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

interface DiscountRow {
  label: string;
  amount: number | null;
  months: string; // "" = 전 기간
}

type Occupant = { kind: "existing"; party: PartyCard } | { kind: "new"; name: string; phone: string; email: string; nationality: string };

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
  cycle: BillingCycle;
  billing_mode: BillingMode;
  bill_day: number | null;
  prorate: boolean;
  due_days: number | null;
  mgmt_mode: MgmtMode;
  source_group: string;
  assignee_id: string;
  memo: string;
}

/** 지점 조건이 채우는 칸(직접 고치면 그다음부터는 덮지 않는다) */
const TERM_KEYS = ["deposit", "mgmt_deposit", "contract_fee", "cleaning_fee", "vat", "cycle", "billing_mode", "bill_day", "prorate", "due_days", "mgmt_mode"] as const;

export function LeaseCreateDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: { unitId?: string | null; inquiryId?: string | null; start?: string | null; renewOf?: string | null };
}) {
  const { branchId, today, me } = useBranch();
  const nav = useNavigate();
  const renewOf = initial.renewOf ?? null;
  const prevQ = useApi<LeaseDetail>(["leases", "detail", renewOf], open && renewOf ? `/api/leases/${renewOf}` : null);
  const prev = prevQ.data ?? null;
  const units = useApi<UnitOption[]>(["units", branchId, "for-lease"], open && !renewOf ? `/api/units?branch_id=${branchId}` : null);
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
    cycle: "anniversary",
    billing_mode: "prepaid",
    bill_day: 1,
    prorate: true,
    due_days: 0,
    mgmt_mode: "fixed",
    source_group: "",
    assignee_id: me?.id ?? "",
    memo: "",
  }));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [occupants, setOccupants] = useState<Occupant[]>([]);
  const [pickingOccupant, setPickingOccupant] = useState(false);
  const [who, setWho] = useState<"inquiry" | "existing" | "new">(initial.inquiryId ? "inquiry" : "existing");
  const [contractor, setContractor] = useState<PartyCard | null>(null);
  const [newParty, setNewParty] = useState<{ kind: Party["kind"]; name: string; phone: string; email: string; nationality: string }>({ kind: "individual", name: "", phone: "", email: "", nationality: "KR" });
  const [separatePayer, setSeparatePayer] = useState(false);
  const [payer, setPayer] = useState<PartyCard | null>(null);
  const [capReason, setCapReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if ((TERM_KEYS as readonly string[]).includes(k)) setTouched((t) => new Set(t).add(k));
  };

  const unit = useMemo(() => {
    if (prev?.unit) return prev.unit as UnitOption;
    return (units.data ?? []).find((u) => u.id === form.unit_id) ?? null;
  }, [units.data, form.unit_id, prev]);

  const termsBranch = prev?.branch_id ?? unit?.branch_id ?? (branchId !== "all" ? branchId : null);
  const terms = useApi<BranchTermsRes>(["leases", "terms", termsBranch], open && termsBranch ? `/api/leases/branch-terms?branch_id=${termsBranch}` : null);

  // 지점 계약 조건으로 기본값을 채운다(재계약은 앞 계약을 따르므로 건너뛴다)
  useEffect(() => {
    const t = terms.data;
    if (!t || renewOf) return;
    setForm((f) => {
      const next = { ...f };
      const put = <K extends keyof Form>(k: K, v: Form[K]) => {
        if (!touched.has(k)) next[k] = v;
      };
      put("deposit", t.deposit);
      put("mgmt_deposit", t.mgmt_deposit);
      put("contract_fee", t.contract_fee);
      put("cleaning_fee", unit && unit.area_m2 > 25 ? t.cleaning_fee_large : t.cleaning_fee_small);
      put("vat", t.vat);
      put("cycle", t.cycle);
      put("billing_mode", t.billing_mode);
      put("bill_day", t.bill_day);
      put("prorate", t.prorate);
      put("due_days", t.due_days);
      put("mgmt_mode", t.mgmt_mode);
      return next;
    });
    // touched 는 일부러 빼다 — 지점 조건이 새로 왔을 때만 채운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms.data, unit?.area_m2, renewOf]);

  // 호실을 고르면 모집가로 금액을 채운다(직접 고친 값은 덮지 않는다)
  useEffect(() => {
    if (!unit || renewOf) return;
    setForm((f) => ({
      ...f,
      rent: f.rent ?? unit.asking_price?.rent ?? unit.type_list_rent ?? null,
      mgmt_fee: f.mgmt_fee ?? unit.asking_price?.mgmt ?? null,
    }));
  }, [unit, renewOf]);

  // 재계약: 앞 계약을 그대로 이어서 채운다
  useEffect(() => {
    if (!prev) return;
    const months = termLabel(prev.start_date, prev.end_date).match(/^(\d+)개월$/);
    const start = initial.start ?? plusDays(prev.end_date, 1);
    setForm((f) => ({
      ...f,
      unit_id: prev.unit_id,
      start_date: start,
      end_date: plusDays(plusMonths(start, months ? Number(months[1]) : 6), -1),
      rent: prev.rent,
      mgmt_fee: prev.mgmt_fee,
      deposit: prev.deposit,
      mgmt_deposit: prev.mgmt_deposit,
      contract_fee: 0,
      prepaid_rent: 0,
      cleaning_fee: prev.cleaning_fee,
      vat: prev.vat,
      cycle: prev.cycle,
      billing_mode: prev.billing_mode,
      bill_day: prev.cycle === "calendar" ? prev.due_day : prev.terms?.bill_day ?? 1,
      prorate: prev.prorate,
      due_days: prev.due_days,
      mgmt_mode: prev.mgmt_mode,
      source_group: "기타",
      assignee_id: prev.assignee_id ?? f.assignee_id,
    }));
    setWho("existing");
    setContractor(prev.contractor);
    if (prev.payer && prev.payer.id !== prev.contractor?.id) {
      setSeparatePayer(true);
      setPayer(prev.payer);
    }
    setOccupants(prev.parties.filter((p) => p.roles.includes("occupant")).map((p) => ({ kind: "existing" as const, party: p })));
  }, [prev, initial.start]);

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

  // 재계약 인상 상한
  const cap = useApi<RentCapRes>(["leases", "rent-cap", renewOf, form.start_date], open && renewOf && form.start_date ? `/api/leases/${renewOf}/rent-cap?start=${form.start_date}` : null);
  const capInfo = cap.data ?? null;
  const overCap = !!capInfo && form.rent !== null && (capInfo.can_raise ? capInfo.cap_rent !== null && form.rent > capInfo.cap_rent : form.rent > capInfo.prev_rent);

  // 첫 청구 미리 보기 — 입력이 멈추면(0.3초) 다시 계산한다
  const previewBody = useMemo(
    () => ({
      branch_id: termsBranch ?? undefined,
      start_date: form.start_date,
      end_date: form.end_date,
      rent: form.rent ?? 0,
      mgmt_fee: form.mgmt_fee ?? 0,
      vat: form.vat,
      cycle: form.cycle,
      billing_mode: form.billing_mode,
      bill_day: form.bill_day ?? 1,
      prorate: form.prorate,
      due_days: form.due_days ?? 0,
      mgmt_mode: form.mgmt_mode,
      discounts: discounts.filter((d) => d.amount).map((d) => ({ label: d.label, amount: d.amount, months: d.months ? Number(d.months) : null })),
    }),
    [termsBranch, form, discounts],
  );
  const [debounced, setDebounced] = useState(previewBody);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(previewBody), 300);
    return () => clearTimeout(h);
  }, [previewBody]);
  const previewReady = open && !!debounced.rent && /^\d{4}-\d{2}-\d{2}$/.test(debounced.start_date) && debounced.end_date >= debounced.start_date;
  const preview = useQuery<PreviewRes>({
    queryKey: ["leases", "preview", JSON.stringify(debounced)],
    queryFn: () => api<PreviewRes>("/api/billing/preview", { method: "POST", body: debounced }),
    enabled: previewReady,
    retry: false,
  });

  const save = useApiMutation<Lease>({
    invalidate: MONEY_KEYS,
    success: (l) => (l.renewal_of ? "재계약을 작성했다" : l.status === "awaiting_signature" ? "계약을 만들고 서명을 요청했다" : "계약을 임시 저장했다"),
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
      const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
      const until = u.today?.free_until ? ` · ${md(u.today.free_until)}까지` : "";
      const extra =
        st === "vacant" || st === "hold"
          ? `${STATE_LABEL[st]}${until}`
          : st === "occupied" || st === "reserved"
            ? `${STATE_LABEL[st]}${u.today?.free_from ? ` · ${md(u.today.free_from)}부터 빔` : ""}${until}`
            : st
              ? STATE_LABEL[st] ?? st
              : "";
      return { value: u.id, label: `${branchId === "all" ? `${u.branch_id.replace("b_", "").toUpperCase()} · ` : ""}${u.code}호${u.type_name ? ` · ${u.type_name}` : ""}${extra ? ` — ${extra}` : ""}` };
    });

  const submit = (status: "draft" | "awaiting_signature") => {
    setErr(null);
    if (!form.unit_id) return setErr("호실을 고른다");
    if (!form.rent) return setErr("월세를 적는다");
    if (form.end_date < form.start_date) return setErr("만료일이 시작일보다 앞이다");
    if (form.cycle === "calendar" && (!form.bill_day || form.bill_day < 1 || form.bill_day > 31)) return setErr("청구일은 1~31 사이로 적는다");
    if (overCap && !capReason.trim()) return setErr("인상 상한을 넘는다. 넘기는 사유를 적는다");
    const body: Record<string, unknown> = {
      unit_id: form.unit_id,
      inquiry_id: initial.inquiryId || undefined,
      renewal_of: renewOf || undefined,
      cap_reason: overCap ? capReason.trim() : undefined,
      start_date: form.start_date,
      end_date: form.end_date,
      rent: form.rent,
      mgmt_fee: form.mgmt_fee ?? 0,
      deposit: form.deposit ?? 0,
      mgmt_deposit: form.mgmt_deposit ?? 0,
      contract_fee: renewOf ? 0 : form.contract_fee ?? 0,
      prepaid_rent: form.prepaid_rent ?? 0,
      cleaning_fee: form.cleaning_fee ?? 0,
      vat: form.vat,
      cycle: form.cycle,
      billing_mode: form.billing_mode,
      bill_day: form.bill_day ?? undefined,
      prorate: form.prorate,
      due_days: form.due_days ?? 0,
      mgmt_mode: form.mgmt_mode,
      discounts: previewBody.discounts,
      occupant_ids: occupants.filter((o): o is Extract<Occupant, { kind: "existing" }> => o.kind === "existing").map((o) => o.party.id),
      occupants_new: occupants.filter((o): o is Extract<Occupant, { kind: "new" }> => o.kind === "new" && !!o.name.trim()).map(({ name, phone, email, nationality }) => ({ name, phone, email, nationality })),
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
  // 고른 호실이 언제부터 언제까지 비는지(겹치면 미리 알려 준다)
  const freeFrom = renewOf ? null : unit?.today?.free_from ?? null;
  const freeUntil = renewOf ? null : unit?.today?.free_until ?? null;
  const clash =
    unit && freeUntil && form.end_date > freeUntil
      ? `${freeUntil.slice(5).replace("-", ".")}까지만 비어 있다. 다음 계약이 그다음 날 시작한다`
      : unit && freeFrom && form.start_date < freeFrom
        ? `${freeFrom.slice(5).replace("-", ".")}부터 비는 방이다. 시작일을 늦춘다`
        : null;
  const pending = (s: string) => save.isPending && (save.variables?.body as { status?: string } | undefined)?.status === s;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={renewOf ? "연장 계약 작성" : "계약 작성"}
      description={
        renewOf
          ? "같은 호실·같은 계약자로 이어지는 재계약. 보증금은 앞 계약에서 이어받아 새로 받지 않는다."
          : "임시 저장은 호실 일정을 잡기만 한다. 서명 요청까지 하면 계약서를 보내고 서명을 기다린다."
      }
      footer={
        <>
          {(err || save.error) && <p className="mr-auto self-center text-xs text-bad">{err ?? save.error?.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button onClick={() => submit("draft")} loading={pending("draft")}>
            임시 저장
          </Button>
          <Button variant="primary" onClick={() => submit("awaiting_signature")} loading={pending("awaiting_signature")}>
            서명 요청까지
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">호실 · 기간</legend>
          {renewOf ? (
            <div className="rounded border border-line bg-sunken/60 px-3 py-2 text-sm">
              {prev ? (
                <>
                  <span className="font-semibold">{prev.unit_code}호</span>
                  <span className="ml-2 text-ink2">{prev.branch_name} · {prev.unit_type_name ?? "룸타입 없음"}</span>
                  <span className="ml-2 text-xs text-ink3">
                    앞 계약 {fmt(prev.start_date, "yy.M.d")} ~ {fmt(prev.end_date, "yy.M.d")} · 월 {won(prev.rent)}
                  </span>
                </>
              ) : (
                "앞 계약을 불러오는 중"
              )}
            </div>
          ) : (
            <Field label="호실" htmlFor="lc-unit" hint={units.isError ? "호실 목록을 불러오지 못했다" : unit?.asking_price ? `모집가 월 ${won(unit.asking_price.rent)} · 관리비 ${won(unit.asking_price.mgmt)}` : undefined}>
              <Select id="lc-unit" value={form.unit_id} onChange={(e) => set("unit_id", e.target.value)} options={unitOptions} placeholder={units.isLoading ? "불러오는 중" : "호실 고르기"} />
            </Field>
          )}
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
            <Field label="만료일" htmlFor="lc-end" hint={`기간 ${months}`} error={clash}>
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
                        setForm((f) => ({
                          ...f,
                          end_date: end,
                          deposit: renewOf ? f.deposit : m <= 1 ? 500000 : f.deposit === 500000 ? terms.data?.deposit ?? 1000000 : f.deposit,
                          prepaid_rent: renewOf ? 0 : m <= 1 ? f.rent ?? 0 : 0,
                        }))
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
          <legend className="label-caps mb-2">계약자 · 입주자</legend>
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

          <div className="flex flex-col gap-2 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">함께 사는 사람</span>
              <div className="flex gap-1.5">
                <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setPickingOccupant((v) => !v)}>
                  기존 고객에서
                </Button>
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setOccupants((o) => [...o, { kind: "new", name: "", phone: "", email: "", nationality: "KR" }])}>
                  새 사람
                </Button>
              </div>
            </div>
            {pickingOccupant && (
              <CustomerPicker
                id="lc-occupant-pick"
                value={null}
                onChange={(p) => {
                  if (!p) return;
                  setOccupants((o) => (o.some((x) => x.kind === "existing" && x.party.id === p.id) ? o : [...o, { kind: "existing", party: p }]));
                  setPickingOccupant(false);
                }}
              />
            )}
            {occupants.length === 0 && !pickingOccupant && <p className="text-xs text-ink3">계약자 혼자 산다. 2인 이상이면 입주자를 더한다</p>}
            {occupants.map((o, i) => (
              <div key={i} className="flex items-start gap-2">
                {o.kind === "existing" ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-line bg-sunken/60 px-3 py-2 text-sm">
                    <span className="font-medium">{o.party.name}</span>
                    <span className="num truncate text-xs text-ink3">{o.party.phone}</span>
                  </div>
                ) : (
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-4">
                    <Input id={`lc-occ-name-${i}`} aria-label="입주자 이름" placeholder="이름" value={o.name} onChange={(e) => setOccupants((xs) => xs.map((x, j) => (j === i && x.kind === "new" ? { ...x, name: e.target.value } : x)))} />
                    <Input id={`lc-occ-phone-${i}`} aria-label="입주자 전화" placeholder="전화" value={o.phone} onChange={(e) => setOccupants((xs) => xs.map((x, j) => (j === i && x.kind === "new" ? { ...x, phone: e.target.value } : x)))} />
                    <Input id={`lc-occ-email-${i}`} aria-label="입주자 이메일" placeholder="이메일" value={o.email} onChange={(e) => setOccupants((xs) => xs.map((x, j) => (j === i && x.kind === "new" ? { ...x, email: e.target.value } : x)))} />
                    <Select
                      id={`lc-occ-nat-${i}`}
                      aria-label="입주자 국적"
                      value={o.nationality}
                      onChange={(e) => setOccupants((xs) => xs.map((x, j) => (j === i && x.kind === "new" ? { ...x, nationality: e.target.value } : x)))}
                      options={Object.entries(NATIONALITY).map(([value, label]) => ({ value, label }))}
                    />
                  </div>
                )}
                <button type="button" aria-label="입주자 빼기" className="mt-1 rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => setOccupants((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">금액</legend>
          {renewOf && capInfo && (
            <div className={cx("rounded border px-3 py-2 text-sm", overCap ? "border-warn/50 bg-warn/10" : "border-line bg-sunken/60")}>
              <div className="font-medium">{capInfo.text}</div>
              <div className="mt-0.5 text-xs text-ink3">
                지금 월세 {won(capInfo.prev_rent)} · {fmt(capInfo.rent_since)}부터 이 금액
                {capInfo.can_raise && capInfo.cap_rent ? ` · 올릴 수 있는 최대 ${won(capInfo.cap_rent)}` : ""}
              </div>
              {overCap && (
                <Field label="상한을 넘기는 사유(계약 메모와 이력에 남는다)" htmlFor="lc-cap-reason" className="mt-2">
                  <Input id="lc-cap-reason" value={capReason} onChange={(e) => setCapReason(e.target.value)} placeholder="예: 리모델링 뒤 룸타입 변경, 계약자 합의" />
                </Field>
              )}
            </div>
          )}
          <FormGrid cols={3}>
            <Field label="월세" htmlFor="lc-rent">
              <MoneyInput id="lc-rent" value={form.rent} onChange={(v) => set("rent", v)} />
            </Field>
            <Field label="관리비" htmlFor="lc-mgmt" hint={form.mgmt_mode === "bill" ? "고지서 청구라 이 금액은 안내용이다" : undefined}>
              <MoneyInput id="lc-mgmt" value={form.mgmt_fee} onChange={(v) => set("mgmt_fee", v)} />
            </Field>
            <Field label="부가세" htmlFor="lc-vat">
              <Select id="lc-vat" value={form.vat} onChange={(e) => set("vat", e.target.value as Lease["vat"])} options={Object.entries(VAT_MODE).map(([value, label]) => ({ value, label }))} />
            </Field>
            {renewOf ? (
              <div className="sm:col-span-3 rounded border border-dashed border-line px-3 py-2 text-xs text-ink2">
                보증금 {won(form.deposit)} · 관리비 보증금 {won(form.mgmt_deposit)}은 앞 계약에서 이어받는다. 계약금·잔금 청구는 만들지 않는다.
              </div>
            ) : (
              <>
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
              </>
            )}
            <Field label="퇴실청소비" htmlFor="lc-clean" hint={terms.data ? `지점 기준 ${won(terms.data.cleaning_fee_small)} · 25㎡ 넘는 방 ${won(terms.data.cleaning_fee_large)}` : undefined}>
              <MoneyInput id="lc-clean" value={form.cleaning_fee} onChange={(v) => set("cleaning_fee", v)} />
            </Field>
          </FormGrid>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="label-caps mb-2">청구 방식</legend>
          {terms.data && !renewOf && <p className="-mt-1 text-xs text-ink3">{terms.data.branch_name} 계약 조건으로 채웠다. 이 계약만 다르게 하려면 고친다</p>}
          <FormGrid>
            <Field label="주기" hint={form.cycle === "calendar" ? "달력 월로 끊고 청구일에 청구한다. 그 달에 없는 날이면 말일" : "입주일부터 한 달씩 끊어 매월 같은 날 청구한다"}>
              <Segmented<BillingCycle>
                size="sm"
                value={form.cycle}
                onChange={(v) => set("cycle", v)}
                options={[
                  { value: "anniversary", label: "입주일 기준" },
                  { value: "calendar", label: "달력 월 · 청구일" },
                ]}
              />
            </Field>
            <Field label="선불 · 후불" hint={form.billing_mode === "prepaid" ? "그 달치를 직전 청구일에 청구한다" : "지난 달치를 다음 청구일에 청구한다"}>
              <Segmented<BillingMode>
                size="sm"
                value={form.billing_mode}
                onChange={(v) => set("billing_mode", v)}
                options={[
                  { value: "prepaid", label: "선불" },
                  { value: "postpaid", label: "후불" },
                ]}
              />
            </Field>
            {form.cycle === "calendar" && (
              <Field label="청구일(매월)" htmlFor="lc-billday">
                <Input id="lc-billday" type="number" min={1} max={31} value={form.bill_day ?? ""} onChange={(e) => set("bill_day", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
            )}
            <Field label="납기 일수" htmlFor="lc-duedays" hint="청구일부터 며칠 안에 내는지. 0 이면 청구일이 납기">
              <Input id="lc-duedays" type="number" min={0} max={60} value={form.due_days ?? ""} onChange={(e) => set("due_days", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="관리비" hint={form.mgmt_mode === "bill" ? "고지서 금액이 오면 넣는다. 고지서 청구는 늘 후불" : "계약 금액을 월세와 같이 청구한다"}>
              <Segmented<MgmtMode>
                size="sm"
                value={form.mgmt_mode}
                onChange={(v) => set("mgmt_mode", v)}
                options={[
                  { value: "fixed", label: "고정" },
                  { value: "bill", label: "고지서" },
                ]}
              />
            </Field>
            <Field label="일할">
              <label className="flex h-9 items-center gap-2 text-sm text-ink2">
                <input id="lc-prorate" type="checkbox" checked={form.prorate} onChange={(e) => set("prorate", e.target.checked)} className="size-4 accent-[rgb(var(--navy))]" />
                첫 달·마지막 달은 그 달 실제 일수로 나눈다
              </label>
            </Field>
          </FormGrid>

          <div className="flex flex-col gap-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">할인</span>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brass hover:underline" onClick={() => setDiscounts((d) => [...d, { label: "", amount: null, months: "1" }])}>
                <Plus className="size-3.5" />
                할인 더하기
              </button>
            </div>
            {discounts.length === 0 && <p className="text-xs text-ink3">할인은 월세에서 깎는 줄로 같은 청구서에 붙는다</p>}
            {discounts.map((d, i) => (
              <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_150px_140px_32px]">
                <Input id={`lc-dc-label-${i}`} aria-label="할인 이름" placeholder="예: 첫 달 입주 할인" value={d.label} onChange={(e) => setDiscounts((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <MoneyInput id={`lc-dc-amt-${i}`} value={d.amount} onChange={(v) => setDiscounts((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} placeholder="월 금액" />
                <Select
                  id={`lc-dc-months-${i}`}
                  aria-label="할인 기간"
                  value={d.months}
                  onChange={(e) => setDiscounts((xs) => xs.map((x, j) => (j === i ? { ...x, months: e.target.value } : x)))}
                  options={[{ value: "", label: "전 기간" }, ...[1, 2, 3, 6, 12].map((m) => ({ value: String(m), label: `앞 ${m}달` }))]}
                />
                <button type="button" aria-label="할인 지우기" className="rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => setDiscounts((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <PreviewTable preview={preview.data} loading={preview.isFetching && !preview.data} error={preview.error as Error | null} ready={previewReady} />
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

/** 첫 청구 미리 보기 — 처음 세 번의 청구일까지 */
function PreviewTable({ preview, loading, error, ready }: { preview: PreviewRes | undefined; loading: boolean; error: Error | null; ready: boolean }) {
  if (!ready) return <p className="text-xs text-ink3">기간과 월세를 넣으면 첫 청구를 미리 보여 준다</p>;
  if (error) return <p className="text-xs text-bad">{error.message}</p>;
  if (loading || !preview) return <p className="text-xs text-ink3">첫 청구를 계산하는 중</p>;
  const dates = [...new Set(preview.lines.map((l) => l.bill_date))].sort().slice(0, 3);
  const shown = preview.lines.filter((l) => dates.includes(l.bill_date));
  const more = preview.lines.length - shown.length;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-sm font-medium">첫 청구 미리 보기</span>
        <span className="text-xs text-ink3">
          첫 청구 {preview.first_bill_date ? fmt(preview.first_bill_date, "M.d (EEE)") : "—"} · <span className="num font-semibold text-ink">{won(preview.first_bill_total)}</span>
        </span>
      </div>
      <div className="scroll-x px-1">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left text-ink3">
              <th className="px-2 py-1.5 font-medium">청구일</th>
              <th className="px-2 py-1.5 font-medium">항목</th>
              <th className="px-2 py-1.5 font-medium">사용 기간</th>
              <th className="px-2 py-1.5 font-medium">일할</th>
              <th className="px-2 py-1.5 font-medium">납기</th>
              <th className="px-2 py-1.5 text-right font-medium">금액</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="num whitespace-nowrap px-2 py-1.5">{fmt(l.bill_date, "M.d")}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {l.label}
                  {l.needs_amount && <Badge tone="warn" className="ml-1.5">고지서 금액 필요</Badge>}
                </td>
                <td className="num whitespace-nowrap px-2 py-1.5 text-ink2">
                  {fmt(l.period_from, "M.d")} ~ {fmt(l.period_to, "M.d")}
                </td>
                <td className="num whitespace-nowrap px-2 py-1.5 text-ink2">{l.days ? `${l.days}일/${l.month_days}일` : "—"}</td>
                <td className="num whitespace-nowrap px-2 py-1.5 text-ink2">{fmt(l.due_date, "M.d")}</td>
                <td className={cx("num whitespace-nowrap px-2 py-1.5 text-right", l.amount < 0 && "text-bad")}>{l.needs_amount ? "—" : l.amount_with_vat.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-line px-3 py-2 text-xs text-ink3">
        <span>{preview.summary}</span>
        <span className="num">
          전 기간 월세 {won(preview.totals.rent + preview.totals.discount)}
          {preview.totals.mgmt ? ` · 관리비 ${won(preview.totals.mgmt)}` : ""}
          {more > 0 ? ` · 뒤로 ${more}줄 더` : ""}
        </span>
      </div>
    </div>
  );
}
