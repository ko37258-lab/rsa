/**
 * 재무 영역 공통 도우미 — leases.ts(계약·정산)와 billing.ts(청구·수납·장부)가 같이 쓴다.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { HttpError, } from "../router";
import { newId, nowIso, today } from "../db";
import {
  indexDB, inBranch, partyCard, leaseMoney, depositHeldChain, chargePaid, isBilled, leaseLastDay,
  type Index,
} from "../logic";
import { NON_REVENUE, } from "@/lib/codes";
import { daysBetween, overlapDays, plusDays, plusMonths, ym, monthStart, monthEnd, } from "@/lib/dates";
import type {
  Allocation, Charge, ChargeKind, DB, Deduction, Lease, Party, PartyCard, Payment, Settlement, VatMode,
} from "@/types";

// ── 공통 도우미 ─────────────────────────────────────────────

export interface LeaseRow extends Lease {
  unit_code: string;
  unit_type_name: string | null;
  branch_name: string;
  contractor: PartyCard | null;
  payer: PartyCard | null;
  money: { overdue: number; upcoming: number; deposit_held: number };
}

export function leaseRow(db: DB, ix: Index, l: Lease, t: string): LeaseRow {
  const unit = ix.unit.get(l.unit_id);
  const m = leaseMoney(ix, l, t);
  return {
    ...l,
    unit_code: unit?.code ?? "?",
    unit_type_name: unit?.unit_type_id ? ix.type.get(unit.unit_type_id)?.name ?? null : null,
    branch_name: db.branches.find((b) => b.id === l.branch_id)?.name ?? "",
    contractor: partyCard(ix.party.get(l.contractor_id)),
    payer: partyCard(ix.party.get(l.payer_id)),
    money: { overdue: m.overdue, upcoming: m.upcoming, deposit_held: depositHeldChain(ix, l) },
  };
}

/** "yyyy-MM-01" 이나 "yyyy-MM" 을 "yyyy-MM" 으로 */
export function monthParam(v: string | null, t: string): string {
  return (v ?? t).slice(0, 7);
}

export function vatSplit(base: number, vat: VatMode) {
  if (vat === "excluded") return { amount: Math.round(base * 1.1), supply: base, vat_amount: Math.round(base * 0.1) };
  if (vat === "included") {
    const supply = Math.round(base / 1.1);
    return { amount: base, supply, vat_amount: base - supply };
  }
  return { amount: base, supply: base, vat_amount: 0 };
}

/** 월세·관리비·사용료만 계약의 부가세 방식을 따른다 */
export const VAT_KINDS: ChargeKind[] = ["rent", "mgmt", "usage"];

export function newCharge(
  l: Lease,
  kind: ChargeKind,
  label: string,
  base: number,
  due: string,
  opts: { from?: string | null; to?: string | null; status?: Charge["status"]; vat?: VatMode; bill?: string; days?: number | null; month_days?: number | null; needs_amount?: boolean } = {},
): Charge {
  const vat = opts.vat ?? (VAT_KINDS.includes(kind) ? l.vat : "none");
  const status = opts.status ?? "draft";
  const now = nowIso();
  return {
    id: newId("c"),
    branch_id: l.branch_id,
    lease_id: l.id,
    payer_id: l.payer_id,
    month: ym(due),
    kind,
    label,
    ...vatSplit(base, vat),
    period_from: opts.from ?? null,
    period_to: opts.to ?? null,
    bill_date: opts.bill ?? due,
    due_date: due,
    status,
    invoice_no: status === "sent" ? invoiceNo(ym(due), l.payer_id) : null,
    invoice_id: null,
    days: opts.days ?? null,
    month_days: opts.month_days ?? null,
    needs_amount: opts.needs_amount ?? false,
    sent_at: status === "sent" ? now : null,
    sent_via: status === "sent" ? "email" : null,
    created_at: now,
  };
}

export function invoiceNo(month: string, payerId: string): string {
  return `INV-${month.replace("-", "")}-${payerId.replace(/^pt_/, "")}`;
}

/** 입주일 기준 청구 기간(k 번째) */
export function period(l: Lease, k: number) {
  const from = plusMonths(l.start_date, k);
  const fullTo = plusDays(plusMonths(l.start_date, k + 1), -1);
  const last = leaseLastDay(l);
  const to = fullTo < last ? fullTo : last;
  return { from, to, fullTo };
}

/** 그 달에 시작하는 청구 기간의 월세·관리비(없을 때만) 만든다. 만든 개수 */
export function ensurePeriodCharges(db: DB, l: Lease, month: string): number {
  let created = 0;
  const last = leaseLastDay(l);
  for (let k = 0; k < 240; k++) {
    const p = period(l, k);
    if (p.from > last) break;
    const pm = ym(p.from);
    if (pm < month) continue;
    if (pm > month) break;
    const exists = db.charges.some((c) => c.lease_id === l.id && c.status !== "cancelled" && (c.kind === "rent" || c.kind === "mgmt") && c.period_from === p.from);
    if (exists) continue;
    const full = daysBetween(p.from, p.fullTo) + 1;
    const used = daysBetween(p.from, p.to) + 1;
    const ratio = used >= full ? 1 : used / full;
    const mo = Number(p.from.slice(5, 7));
    const rent = Math.round((l.rent * ratio) / 10) * 10;
    const mgmt = Math.round((l.mgmt_fee * ratio) / 10) * 10;
    const sfx = ratio < 1 ? ` (${used}일)` : "";
    db.charges.push(newCharge(l, "rent", `${mo}월 월세${sfx}`, rent, p.from, { from: p.from, to: p.to }));
    if (mgmt > 0) db.charges.push(newCharge(l, "mgmt", `${mo}월 관리비${sfx}`, mgmt, p.from, { from: p.from, to: p.to }));
    created += mgmt > 0 ? 2 : 1;
  }
  return created;
}

export function allocatedOf(db: DB, paymentId: string): number {
  return db.allocations.filter((a) => a.payment_id === paymentId).reduce((s, a) => s + a.amount, 0);
}

/** 입금을 납부자의 미납 청구에 납기 순서(오래된 것부터)로 채운다 */
export function allocateFIFO(db: DB, pay: Payment, onlyLeaseId?: string): number {
  if (!pay.payer_id) return 0;
  const ix = indexDB(db);
  let left = pay.amount - allocatedOf(db, pay.id);
  if (left <= 0) return 0;
  const targets = db.charges
    .filter((c) => c.payer_id === pay.payer_id && isBilled(c) && (!onlyLeaseId || c.lease_id === onlyLeaseId))
    .map((c) => ({ c, left: c.amount - chargePaid(ix, c) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => a.c.due_date.localeCompare(b.c.due_date) || a.c.created_at.localeCompare(b.c.created_at));
  let total = 0;
  for (const x of targets) {
    if (left <= 0) break;
    const amt = Math.min(left, x.left);
    const al: Allocation = { id: newId("al"), payment_id: pay.id, charge_id: x.c.id, amount: amt, at: pay.received_at };
    db.allocations.push(al);
    left -= amt;
    total += amt;
  }
  return total;
}

export function newParty(db: DB, branchId: string, p: { kind?: Party["kind"]; name?: string; phone?: string; email?: string; nationality?: string }): Party {
  const name = String(p.name ?? "").trim();
  if (!name) throw new HttpError(400, "계약자 이름을 적는다");
  const now = nowIso();
  const party: Party = {
    id: newId("pt"),
    kind: p.kind === "corporation" ? "corporation" : "individual",
    name,
    phone: String(p.phone ?? "").trim(),
    email: String(p.email ?? "").trim(),
    nationality: p.nationality || "KR",
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

export function overlapping(db: DB, unitId: string, start: string, end: string, exceptId?: string): Lease | undefined {
  return db.leases.find((l) => l.unit_id === unitId && l.id !== exceptId && l.status !== "cancelled" && overlapDays(start, end, l.start_date, leaseLastDay(l)) > 0);
}

export const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};

// ── 정산 ────────────────────────────────────────────────

/** 미납 = 계약의 확정 청구 중 남은 돈(보증금·계약금·청소비 제외 — 청소비는 차감 줄로 따로 본다) */
export function settlementUnpaid(ix: Index, l: Lease): number {
  return (ix.chargesByLease.get(l.id) ?? [])
    .filter((c) => isBilled(c) && c.kind !== "deposit" && c.kind !== "contract_fee" && c.kind !== "cleaning")
    .reduce((s, c) => s + Math.max(0, c.amount - chargePaid(ix, c)), 0);
}

export function draftSettlement(db: DB, ix: Index, l: Lease): Settlement & { saved: boolean } {
  const saved = db.settlements.find((s) => s.lease_id === l.id);
  const deposit = depositHeldChain(ix, l);
  const unpaid = settlementUnpaid(ix, l);
  if (saved) {
    // 저장한 정산도 미납·보증금은 지금 값으로 다시 본다(반환 끝난 것은 그대로)
    if (saved.status === "refunded") return { ...saved, saved: true };
    const ded = saved.deductions.reduce((s, d) => s + d.amount, 0);
    return { ...saved, deposit_total: deposit, unpaid, refund_amount: deposit - unpaid - ded, saved: true };
  }
  const cleaning = (ix.chargesByLease.get(l.id) ?? []).find((c) => c.kind === "cleaning" && isBilled(c));
  const deductions: Deduction[] = [];
  if (cleaning) {
    const left = cleaning.amount - chargePaid(ix, cleaning);
    if (left > 0) deductions.push({ label: "퇴실청소비", amount: left });
  } else if (l.cleaning_fee > 0) deductions.push({ label: "퇴실청소비", amount: l.cleaning_fee });
  const ded = deductions.reduce((s, d) => s + d.amount, 0);
  return {
    id: "draft",
    lease_id: l.id,
    status: "draft",
    deposit_total: deposit,
    unpaid,
    deductions,
    refund_amount: deposit - unpaid - ded,
    refund_account: ix.party.get(l.contractor_id)?.bank_account ?? "",
    confirmed_at: null,
    refunded_at: null,
    saved: false,
  };
}

/** 반환 처리: 차감 줄을 청구로 만들고(없으면), 보증금으로 미납·차감을 채운 뒤 남은 돈을 돌려준다 */
export function settleWithDeposit(db: DB, l: Lease, st: Settlement): void {
  const t = today();
  let ix = indexDB(db);
  const leaseCharges = () => db.charges.filter((c) => c.lease_id === l.id && c.status !== "cancelled");
  for (const d of st.deductions) {
    if (d.amount <= 0) continue;
    const isCleaning = d.label.includes("청소");
    const existing = isCleaning ? leaseCharges().find((c) => c.kind === "cleaning") : undefined;
    if (existing) {
      if (existing.status === "draft") Object.assign(existing, { status: "sent", sent_at: nowIso(), sent_via: "manual", invoice_no: invoiceNo(existing.month, existing.payer_id) });
      continue;
    }
    db.charges.push(newCharge(l, isCleaning ? "cleaning" : "damage", d.label, d.amount, t, { status: "sent", vat: "none" }));
  }
  // 퇴실 뒤 기간의 아직 안 보낸 청구는 취소
  const last = leaseLastDay(l);
  for (const c of leaseCharges()) if (c.status === "draft" && c.period_from && c.period_from > last) c.status = "cancelled";
  ix = indexDB(db);
  const owed = leaseCharges()
    .filter((c) => isBilled(c) && c.kind !== "deposit" && c.kind !== "contract_fee")
    .reduce((s, c) => s + Math.max(0, c.amount - chargePaid(ix, c)), 0);
  const use = Math.min(owed, st.deposit_total);
  if (use > 0) {
    const pay: Payment = {
      id: newId("pay"),
      branch_id: l.branch_id,
      payer_id: l.payer_id,
      depositor_name: "보증금 차감",
      amount: use,
      received_at: nowIso(),
      account: "보증금",
      method: "direct",
      status: "matched",
      memo: "보증금 차감",
      account_id: null,
      platform_fee: 0,
      pass_through: 0,
      pass_through_reason: null,
      bank_row: null,
    };
    db.payments.push(pay);
    allocateFIFO(db, pay, l.id);
  }
}

// ── 렌트롤 ──────────────────────────────────────────────

export function rentRoll(db: DB, ix: Index, branchId: string | null, t: string, masked: boolean) {
  const thisM = ym(t);
  const rows = db.leases
    .filter(inBranch(branchId))
    .filter((l) => ["concluded", "move_in_confirmed", "occupied", "closing"].includes(l.status))
    .map((l) => {
      const c = ix.party.get(l.contractor_id);
      const cs = ix.chargesByLease.get(l.id) ?? [];
      const monthOf = (k: ChargeKind) => cs.filter((x) => x.kind === k && x.month === thisM).reduce((s, x) => s + x.amount, 0);
      // 이번 달 이후 남은 기간(개월) — 끝 날짜까지 청구 기간 수
      let remain = 0;
      for (let k = 0; k < 240; k++) {
        const p = period(l, k);
        if (p.from > leaseLastDay(l)) break;
        if (ym(p.from) > thisM) remain += (daysBetween(p.from, p.to) + 1) / (daysBetween(p.from, p.fullTo) + 1);
      }
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
        month_rent: monthOf("rent"),
        month_mgmt: monthOf("mgmt"),
        remaining_rent: Math.round(l.rent * remain),
        remaining_mgmt: Math.round(l.mgmt_fee * remain),
        unpaid: m.overdue,
        source_group: l.source_group,
        assignee_id: l.assignee_id,
        created_at: l.created_at,
      };
    })
    .sort((a, b) => a.unit_code.localeCompare(b.unit_code, "ko", { numeric: true }));
  return { today: t, rows };
}

export function maskName(n: string): string {
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}

// ── 매출 ────────────────────────────────────────────────

/** 공급가 기준 매출을 사용 기간의 일수로 달에 나눠 넣는다 */
export function revenueOf(db: DB, branchId: string, months: string[]) {
  const out = new Map<string, { rent: number; mgmt: number; usage: number; other: number }>();
  for (const m of months) out.set(m, { rent: 0, mgmt: 0, usage: 0, other: 0 });
  const first = months[0];
  const last = months[months.length - 1];
  for (const c of db.charges) {
    if (c.branch_id !== branchId || !isBilled(c) || NON_REVENUE.includes(c.kind)) continue;
    const key = c.kind === "rent" ? "rent" : c.kind === "mgmt" ? "mgmt" : c.kind === "usage" ? "usage" : "other";
    if (c.period_from && c.period_to) {
      if (ym(c.period_to) < first || ym(c.period_from) > last) continue;
      const total = daysBetween(c.period_from, c.period_to) + 1;
      for (const m of months) {
        const d = overlapDays(c.period_from, c.period_to, monthStart(m), monthEnd(m));
        if (d) out.get(m)![key] += (c.supply * d) / total;
      }
    } else {
      const m = ym(c.due_date);
      if (out.has(m)) out.get(m)![key] += c.supply;
    }
  }
  return out;
}

export function commission(term: DB["branches"][number]["commission"], base: number): number {
  if (term.structure === "fixed_minus") return Math.max(0, Math.round(base - term.fixed_amount));
  return Math.round((base * term.rate_bp) / 10000);
}

