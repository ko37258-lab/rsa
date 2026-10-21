/**
 * 계약 영역 전용 도우미. finance-shared.ts(청구 영역 소유)에 있던 것 중 계약 쪽에서 규칙이 바뀐 것을 옮겨 왔다.
 * - 체결 때 청구 초안 만들기: 입주일 기준 고정 계산 대신 mock/schedule.ts 의 청구 일정(일할·선불/후불·할인·고지서)을 따른다.
 * - 렌트롤: 남은 총임대료·관리비를 청구 일정에서 센다.
 */
import { HttpError } from "../router";
import { newId, nowIso } from "../db";
import { inBranch, leaseMoney, partyCard, type Index } from "../logic";
import { scheduleLines, remainingAfter, rentCap, type RentCap, type ScheduleLine } from "../schedule";
import { monthEnd, ym } from "@/lib/dates";
import type { BillingCycle, BillingMode, ChargeKind, DB, Lease, LeaseDiscount, MgmtMode, Party, PartyCard, VatMode } from "@/types";
import { newCharge, num, maskName } from "./finance-shared";

// ── 청구 방식 ───────────────────────────────────────────

export interface BillingFields {
  cycle: BillingCycle;
  billing_mode: BillingMode;
  prorate: boolean;
  due_day: number;
  due_days: number;
  mgmt_mode: MgmtMode;
  discounts: LeaseDiscount[];
}

/** 요청 본문에서 청구 방식을 읽는다. 없는 값은 fallback(지점 조건이나 지금 계약)으로 */
export function readBillingFields(
  b: Record<string, unknown>,
  fallback: { cycle: BillingCycle; billing_mode: BillingMode; prorate: boolean; due_days: number; mgmt_mode: MgmtMode; bill_day: number; discounts?: LeaseDiscount[] },
  start: string,
): BillingFields {
  const cycle: BillingCycle = b.cycle === "calendar" || b.cycle === "anniversary" ? b.cycle : fallback.cycle;
  const billDay = b.bill_day !== undefined && b.bill_day !== null && b.bill_day !== "" ? num(b.bill_day) : b.due_day !== undefined && cycle === "calendar" ? num(b.due_day) : fallback.bill_day;
  if (cycle === "calendar" && (billDay < 1 || billDay > 31)) throw new HttpError(400, "청구일은 1~31 사이로 적는다");
  const dueDays = b.due_days !== undefined && b.due_days !== null && b.due_days !== "" ? num(b.due_days) : fallback.due_days;
  if (dueDays < 0 || dueDays > 60) throw new HttpError(400, "납기 일수는 0~60일 사이로 적는다");
  return {
    cycle,
    billing_mode: b.billing_mode === "postpaid" || b.billing_mode === "prepaid" ? b.billing_mode : fallback.billing_mode,
    prorate: typeof b.prorate === "boolean" ? b.prorate : fallback.prorate,
    due_day: cycle === "calendar" ? billDay : Number(start.slice(8, 10)),
    due_days: dueDays,
    mgmt_mode: b.mgmt_mode === "bill" || b.mgmt_mode === "fixed" ? b.mgmt_mode : fallback.mgmt_mode,
    discounts: Array.isArray(b.discounts) ? readDiscounts(b.discounts) : fallback.discounts ?? [],
  };
}

export function readDiscounts(raw: unknown[]): LeaseDiscount[] {
  return raw
    .map((d) => d as { label?: unknown; amount?: unknown; months?: unknown })
    .map((d) => ({
      label: String(d.label ?? "").trim() || "할인",
      amount: Math.abs(num(d.amount)),
      months: d.months === null || d.months === undefined || d.months === "" || Number(d.months) <= 0 ? null : num(d.months),
    }))
    .filter((d) => d.amount > 0);
}

/** "달력 월 · 25일 청구 · 선불 · 일할 · 납기 5일 · 관리비 고지서" */
export function billingSummary(l: Pick<Lease, "cycle" | "billing_mode" | "prorate" | "due_day" | "due_days" | "mgmt_mode">): string {
  return [
    l.cycle === "calendar" ? `달력 월 · ${l.due_day}일 청구` : `입주일 기준 · 매월 ${l.due_day}일`,
    l.billing_mode === "prepaid" ? "선불" : "후불",
    l.prorate ? "일할" : "일할 안 함",
    l.due_days ? `납기 ${l.due_days}일` : "청구일이 납기",
    l.mgmt_mode === "bill" ? "관리비 고지서(후불)" : "관리비 고정",
  ].join(" · ");
}

const SCHEDULE_KINDS: ChargeKind[] = ["rent", "mgmt", "discount"];

/**
 * 청구 일정의 줄 가운데 청구일이 uptoMonth 이하인 것을 「발송 대기」(draft) 청구로 만든다. 이미 있는 줄은 건너뛴다.
 * 같은 줄 = (계약, 종류, 사용 시작일) — 할인은 이름까지. 취소된 청구는 없는 것으로 본다.
 */
export function createScheduleCharges(db: DB, l: Lease, uptoMonth: string): number {
  const existing = db.charges.filter((c) => c.lease_id === l.id && c.status !== "cancelled" && SCHEDULE_KINDS.includes(c.kind));
  const has = (x: ScheduleLine) => existing.some((c) => c.kind === x.kind && c.period_from === x.period_from && (x.kind !== "discount" || c.label === x.label));
  let created = 0;
  for (const x of scheduleLines(l)) {
    if (ym(x.bill_date) > uptoMonth || has(x)) continue;
    db.charges.push(
      newCharge(l, x.kind, x.label, x.amount, x.due_date, {
        bill: x.bill_date,
        from: x.period_from,
        to: x.period_to,
        days: x.days,
        month_days: x.month_days,
        needs_amount: x.needs_amount,
        status: "draft",
      }),
    );
    created++;
  }
  return created;
}

/** 미리 보기·첫 청구 계산용 가짜 계약 */
export function previewLease(b: Record<string, unknown>, fallback: Parameters<typeof readBillingFields>[1]): Lease {
  const start = String(b.start_date ?? "");
  const end = String(b.end_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new HttpError(400, "시작일과 만료일을 고른다");
  if (end < start) throw new HttpError(400, "만료일이 시작일보다 앞이다");
  const f = readBillingFields(b, fallback, start);
  const vat: VatMode = b.vat === "included" || b.vat === "excluded" ? b.vat : "none";
  return {
    id: "preview",
    branch_id: "",
    unit_id: "",
    inquiry_id: null,
    contractor_id: "",
    payer_id: "",
    status: "draft",
    start_date: start,
    end_date: end,
    move_in_date: null,
    move_out_date: null,
    deposit: 0,
    mgmt_deposit: 0,
    prepaid_rent: 0,
    contract_fee: 0,
    rent: num(b.rent),
    list_rent: num(b.rent),
    mgmt_fee: num(b.mgmt_fee),
    cleaning_fee: 0,
    vat,
    source_group: "",
    assignee_id: null,
    created_at: nowIso(),
    signed_at: null,
    closed_at: null,
    renewal_of: null,
    memo: "",
    occupant_ids: [],
    signed_copies: [],
    ...f,
  };
}

// ── 재계약 · 인상 상한 ───────────────────────────────────

/** [l, l 의 앞 계약, 그 앞 …] */
export function chainBack(ix: Index, l: Lease): Lease[] {
  const out: Lease[] = [];
  let cur: Lease | undefined = l;
  let guard = 0;
  while (cur && guard++ < 30) {
    out.push(cur);
    cur = cur.renewal_of ? ix.lease.get(cur.renewal_of) : undefined;
  }
  return out;
}

/** 이 계약(prev)을 renewalStart 부터 연장할 때의 인상 상한 */
export function rentCapFor(ix: Index, prev: Lease, renewalStart: string): RentCap | null {
  return rentCap(chainBack(ix, prev), renewalStart);
}

/** 상한을 넘는 월세인가(인상 불가인데 올린 것 포함) */
export function exceedsCap(cap: RentCap | null, rent: number): boolean {
  if (!cap) return false;
  if (!cap.can_raise) return rent > cap.prev_rent;
  return cap.cap_rent !== null && rent > cap.cap_rent;
}

/** 이 계약을 이어받은 재계약(취소 아님) */
export function renewalOf(db: DB, l: Lease): Lease | undefined {
  return db.leases.find((x) => x.renewal_of === l.id && x.status !== "cancelled");
}

// ── 당사자 ─────────────────────────────────────────────

export interface LeaseParty extends PartyCard {
  roles: Array<"contractor" | "payer" | "occupant">;
  nationality: string;
  bank_account: string | null;
}

export function leaseParties(ix: Index, l: Lease): LeaseParty[] {
  const out = new Map<string, LeaseParty>();
  const add = (id: string, role: LeaseParty["roles"][number]) => {
    const p = ix.party.get(id);
    if (!p) return;
    const cur = out.get(id);
    if (cur) {
      if (!cur.roles.includes(role)) cur.roles.push(role);
      return;
    }
    out.set(id, { ...(partyCard(p) as PartyCard), roles: [role], nationality: p.nationality, bank_account: p.bank_account });
  };
  add(l.contractor_id, "contractor");
  add(l.payer_id, "payer");
  for (const id of l.occupant_ids) add(id, "occupant");
  return [...out.values()];
}

export function makeParty(db: DB, branchId: string, p: { kind?: Party["kind"]; name?: unknown; phone?: unknown; email?: unknown; nationality?: unknown }, what = "이름"): Party {
  const name = String(p.name ?? "").trim();
  if (!name) throw new HttpError(400, `${what}을 적는다`);
  const now = nowIso();
  const party: Party = {
    id: newId("pt"),
    kind: p.kind === "corporation" ? "corporation" : "individual",
    name,
    phone: String(p.phone ?? "").trim(),
    email: String(p.email ?? "").trim(),
    nationality: String(p.nationality || "KR"),
    gender: null,
    branch_id: branchId,
    contact_name: null,
    created_at: now,
    last_activity_at: now,
    retention_until: null,
    bank_account: null,
  };
  db.parties.push(party);
  return party;
}

// ── 렌트롤 ──────────────────────────────────────────────

export function rentRoll(db: DB, ix: Index, branchId: string | null, t: string, masked: boolean) {
  const thisM = ym(t);
  const after = monthEnd(thisM);
  const rows = db.leases
    .filter(inBranch(branchId))
    .filter((l) => ["concluded", "move_in_confirmed", "occupied", "closing"].includes(l.status))
    .map((l) => {
      const c = ix.party.get(l.contractor_id);
      const cs = ix.chargesByLease.get(l.id) ?? [];
      const monthOf = (k: ChargeKind) => cs.filter((x) => x.kind === k && x.month === thisM && x.status !== "cancelled").reduce((s, x) => s + x.amount, 0);
      // 이번 달 뒤에 시작하는 청구 기간의 월세(할인 반영)·관리비 합
      const remain = remainingAfter(l, after);
      const m = leaseMoney(ix, l, t);
      const name = c?.name ?? "";
      const phone = c?.phone ?? "";
      return {
        id: l.id,
        unit_code: ix.unit.get(l.unit_id)?.code ?? "?",
        status: l.status,
        kind: l.renewal_of ? "재계약" : ix.party.get(l.payer_id)?.kind === "corporation" ? "법인" : "신규",
        start_date: l.start_date,
        end_date: l.end_date,
        contractor_name: masked ? maskName(name) : name,
        nationality: c?.nationality ?? "",
        gender: c?.gender ?? null,
        phone: masked ? phone.replace(/(\d{2,3})-(\d{3,4})-(\d{4})/, "$1-****-$3") : phone,
        email: masked ? "" : c?.email ?? "",
        deposit: l.deposit,
        mgmt_deposit: l.mgmt_deposit,
        prepaid_rent: l.prepaid_rent,
        contract_fee: l.contract_fee,
        rent: l.rent,
        mgmt_fee: l.mgmt_fee,
        cleaning_fee: l.cleaning_fee,
        month_rent: monthOf("rent") + monthOf("discount"),
        month_mgmt: monthOf("mgmt"),
        remaining_rent: remain.rent,
        remaining_mgmt: l.mgmt_mode === "bill" ? 0 : remain.mgmt,
        unpaid: m.overdue,
        billing: billingSummary(l),
        occupants: l.occupant_ids.length,
      };
    })
    .sort((a, b) => a.unit_code.localeCompare(b.unit_code, "ko", { numeric: true }));
  return { today: t, masked, rows };
}
