/**
 * 재무 영역 API: 계약 · 청구 · 수납 · 정산 · 장부.
 * 원본 홈즈 PMS 와 같은 경로를 쓴다(/api/leases…, /api/billing…).
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import {
  indexDB, inBranch, partyCard, leaseMoney, payerBalances, depositHeldChain, chargePaid, isBilled, leaseLastDay,
  type Index,
} from "../logic";
import { logHistory } from "./common";
import { LEASE_FLOW, OPEN_LEASE, NON_REVENUE, CHARGE_KIND, LEASE_STATUS } from "@/lib/codes";
import { daysBetween, overlapDays, plusDays, plusMonths, ym, monthStart, monthEnd, plusMonth } from "@/lib/dates";
import type {
  Allocation, Charge, ChargeKind, DB, Deduction, Lease, LeaseStatus, Party, PartyCard, Payment, Settlement, Unit, VatMode,
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

function leaseRow(db: DB, ix: Index, l: Lease, t: string): LeaseRow {
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
function monthParam(v: string | null, t: string): string {
  return (v ?? t).slice(0, 7);
}

function vatSplit(base: number, vat: VatMode) {
  if (vat === "excluded") return { amount: Math.round(base * 1.1), supply: base, vat_amount: Math.round(base * 0.1) };
  if (vat === "included") {
    const supply = Math.round(base / 1.1);
    return { amount: base, supply, vat_amount: base - supply };
  }
  return { amount: base, supply: base, vat_amount: 0 };
}

/** 월세·관리비·사용료만 계약의 부가세 방식을 따른다 */
const VAT_KINDS: ChargeKind[] = ["rent", "mgmt", "usage"];

function newCharge(
  l: Lease,
  kind: ChargeKind,
  label: string,
  base: number,
  due: string,
  opts: { from?: string | null; to?: string | null; status?: Charge["status"]; vat?: VatMode } = {},
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
    due_date: due,
    status,
    invoice_no: status === "sent" ? invoiceNo(ym(due), l.payer_id) : null,
    sent_at: status === "sent" ? now : null,
    sent_via: status === "sent" ? "email" : null,
    created_at: now,
  };
}

function invoiceNo(month: string, payerId: string): string {
  return `INV-${month.replace("-", "")}-${payerId.replace(/^pt_/, "")}`;
}

/** 입주일 기준 청구 기간(k 번째) */
function period(l: Lease, k: number) {
  const from = plusMonths(l.start_date, k);
  const fullTo = plusDays(plusMonths(l.start_date, k + 1), -1);
  const last = leaseLastDay(l);
  const to = fullTo < last ? fullTo : last;
  return { from, to, fullTo };
}

/** 그 달에 시작하는 청구 기간의 월세·관리비(없을 때만) 만든다. 만든 개수 */
function ensurePeriodCharges(db: DB, l: Lease, month: string): number {
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

function allocatedOf(db: DB, paymentId: string): number {
  return db.allocations.filter((a) => a.payment_id === paymentId).reduce((s, a) => s + a.amount, 0);
}

/** 입금을 납부자의 미납 청구에 납기 순서(오래된 것부터)로 채운다 */
function allocateFIFO(db: DB, pay: Payment, onlyLeaseId?: string): number {
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

function newParty(db: DB, branchId: string, p: { kind?: Party["kind"]; name?: string; phone?: string; email?: string; nationality?: string }): Party {
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

function overlapping(db: DB, unitId: string, start: string, end: string, exceptId?: string): Lease | undefined {
  return db.leases.find((l) => l.unit_id === unitId && l.id !== exceptId && l.status !== "cancelled" && overlapDays(start, end, l.start_date, leaseLastDay(l)) > 0);
}

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};

// ── 정산 ────────────────────────────────────────────────

/** 미납 = 계약의 확정 청구 중 남은 돈(보증금·계약금·청소비 제외 — 청소비는 차감 줄로 따로 본다) */
function settlementUnpaid(ix: Index, l: Lease): number {
  return (ix.chargesByLease.get(l.id) ?? [])
    .filter((c) => isBilled(c) && c.kind !== "deposit" && c.kind !== "contract_fee" && c.kind !== "cleaning")
    .reduce((s, c) => s + Math.max(0, c.amount - chargePaid(ix, c)), 0);
}

function draftSettlement(db: DB, ix: Index, l: Lease): Settlement & { saved: boolean } {
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
function settleWithDeposit(db: DB, l: Lease, st: Settlement): void {
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
    };
    db.payments.push(pay);
    allocateFIFO(db, pay, l.id);
  }
}

// ── 렌트롤 ──────────────────────────────────────────────

function rentRoll(db: DB, ix: Index, branchId: string | null, t: string, masked: boolean) {
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

function maskName(n: string): string {
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}

// ── 매출 ────────────────────────────────────────────────

/** 공급가 기준 매출을 사용 기간의 일수로 달에 나눠 넣는다 */
function revenueOf(db: DB, branchId: string, months: string[]) {
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

function commission(term: DB["branches"][number]["commission"], base: number): number {
  if (term.structure === "fixed_minus") return Math.max(0, Math.round(base - term.fixed_amount));
  return Math.round((base * term.rate_bp) / 10000);
}

// ── 경로 ────────────────────────────────────────────────

export const financeRoutes: Route[] = [
  // 계약: 구체적인 경로를 :id 보다 먼저 둔다
  route("GET /api/leases/rent-roll", ({ query }) => {
    const db = getDB();
    return rentRoll(db, indexDB(db), query.get("branch_id"), today(), query.get("masked") === "true");
  }),

  route("GET /api/leases/move-outs", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const rows = db.leases
      .filter(inBranch(query.get("branch_id")))
      .map((l) => {
        const st = db.settlements.find((s) => s.lease_id === l.id) ?? null;
        const renewed = db.leases.some((x) => x.renewal_of === l.id && x.status !== "cancelled");
        let stage: "upcoming" | "settling" | "refund_wait" | "refunded" | null = null;
        if (l.status === "occupied" && !renewed && daysBetween(t, l.end_date) <= 30) stage = "upcoming";
        else if (l.status === "closing") stage = st?.status === "refunded" ? "refunded" : st?.status === "confirmed" ? "refund_wait" : "settling";
        else if (l.status === "closed" && st?.status === "refunded" && st.refunded_at && daysBetween(st.refunded_at.slice(0, 10), t) <= 45) stage = "refunded";
        else if (l.status === "closed" && st && st.status !== "refunded") stage = "refund_wait";
        if (!stage) return null;
        const s = draftSettlement(db, ix, l);
        return {
          ...leaseRow(db, ix, l, t),
          stage,
          settlement_status: st ? st.status : "none",
          deposit_total: s.deposit_total,
          unpaid: s.unpaid,
          deduction_total: s.deductions.reduce((a, d) => a + d.amount, 0),
          refund_amount: s.refund_amount,
          refunded_at: s.refunded_at,
          days_left: daysBetween(t, leaseLastDay(l)),
        };
      })
      .filter(<T,>(x: T | null): x is T => x !== null)
      .sort((a, b) => leaseLastDay(a).localeCompare(leaseLastDay(b)));
    return rows;
  }),

  route("GET /api/leases", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const statuses = query.getAll("status").filter(Boolean) as LeaseStatus[];
    const unitId = query.get("unit_id");
    const partyId = query.get("party_id");
    const inquiryId = query.get("inquiry_id");
    const q = (query.get("q") ?? "").trim().toLowerCase();
    const inq = inquiryId ? db.inquiries.find((x) => x.id === inquiryId) : undefined;
    return db.leases
      .filter(inBranch(query.get("branch_id")))
      .filter((l) => !statuses.length || statuses.includes(l.status))
      .filter((l) => query.get("open_only") !== "true" || OPEN_LEASE.includes(l.status))
      .filter((l) => !unitId || l.unit_id === unitId)
      .filter((l) => !partyId || l.contractor_id === partyId || l.payer_id === partyId)
      .filter((l) => !inquiryId || l.inquiry_id === inquiryId || (inq?.lease_ids ?? []).includes(l.id))
      .map((l) => leaseRow(db, ix, l, t))
      .filter((r) => {
        if (!q) return true;
        const hay = [r.unit_code, r.contractor?.name, r.contractor?.phone, r.contractor?.email, r.payer?.name].join(" ").toLowerCase();
        return hay.includes(q) || hay.replace(/-/g, "").includes(q.replace(/-/g, ""));
      })
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  }),

  route("GET /api/leases/:id", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const l = must(ix.lease.get(params.id), "계약");
    const unit = ix.unit.get(l.unit_id) ?? null;
    const prev = l.renewal_of ? ix.lease.get(l.renewal_of) : undefined;
    const next = db.leases.find((x) => x.unit_id === l.unit_id && x.status !== "cancelled" && x.start_date > l.start_date && x.id !== l.id && x.start_date <= plusDays(leaseLastDay(l), 120));
    return {
      ...leaseRow(db, ix, l, t),
      unit,
      unit_type: unit?.unit_type_id ? ix.type.get(unit.unit_type_id) ?? null : null,
      renewal_of_lease: prev ? leaseRow(db, ix, prev, t) : null,
      next_lease: next ? leaseRow(db, ix, next, t) : null,
      inquiry: l.inquiry_id ? (({ id, stage, created_at, source_group, source_detail }) => ({ id, stage, created_at, source_group, source_detail }))(must(db.inquiries.find((x) => x.id === l.inquiry_id), "상담")) : null,
      settlement: db.settlements.find((s) => s.lease_id === l.id) ?? null,
      assignee: db.staff.find((s) => s.id === l.assignee_id) ?? null,
      flow: LEASE_FLOW[l.status] ?? [],
    };
  }),

  route("POST /api/leases", ({ body }) => {
    const db = getDB();
    const b = body ?? {};
    const unit: Unit = must(db.units.find((u) => u.id === b.unit_id), "호실");
    const start = String(b.start_date ?? "");
    const end = String(b.end_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new HttpError(400, "시작일과 만료일을 고른다");
    if (end < start) throw new HttpError(400, "만료일이 시작일보다 앞이다");
    const rent = num(b.rent);
    if (rent <= 0) throw new HttpError(400, "월세를 적는다");
    const clash = overlapping(db, unit.id, start, end);
    if (clash)
      throw new HttpError(409, `${unit.code}호는 ${clash.start_date} ~ ${leaseLastDay(clash)} 에 다른 계약(${LEASE_STATUS[clash.status].label})이 있어 기간이 겹친다`);

    const inquiry = b.inquiry_id ? must(db.inquiries.find((q) => q.id === b.inquiry_id), "상담") : undefined;
    let contractorId: string | undefined = b.contractor_id || undefined;
    if (!contractorId && b.contractor_new) contractorId = newParty(db, unit.branch_id, b.contractor_new).id;
    if (!contractorId && inquiry) contractorId = inquiry.party_id;
    if (!contractorId) throw new HttpError(400, "계약자를 고르거나 새로 적는다");
    must(db.parties.find((p) => p.id === contractorId), "계약자");
    const payerId = b.payer_id || contractorId;
    must(db.parties.find((p) => p.id === payerId), "납부자");

    const type = unit.unit_type_id ? db.unit_types.find((x) => x.id === unit.unit_type_id) : undefined;
    const status: LeaseStatus = b.status === "awaiting_signature" ? "awaiting_signature" : "draft";
    const vat: VatMode = b.vat === "included" || b.vat === "excluded" ? b.vat : "none";
    const lease: Lease = {
      id: newId("ls"),
      branch_id: unit.branch_id,
      unit_id: unit.id,
      inquiry_id: inquiry?.id ?? null,
      contractor_id: contractorId,
      payer_id: payerId,
      status,
      start_date: start,
      end_date: end,
      move_in_date: null,
      move_out_date: null,
      deposit: num(b.deposit),
      mgmt_deposit: num(b.mgmt_deposit),
      prepaid_rent: num(b.prepaid_rent),
      contract_fee: num(b.contract_fee),
      rent,
      list_rent: type?.list_rent ?? rent,
      mgmt_fee: num(b.mgmt_fee),
      cleaning_fee: num(b.cleaning_fee),
      due_day: Number(start.slice(8, 10)),
      vat,
      source_group: String(b.source_group || inquiry?.source_group || "기타"),
      assignee_id: b.assignee_id || db.me.id,
      created_at: nowIso(),
      signed_at: null,
      closed_at: null,
      renewal_of: b.renewal_of || null,
      memo: String(b.memo ?? ""),
    };
    db.leases.push(lease);
    logHistory("lease", lease.id, status === "awaiting_signature" ? "계약 작성 · 서명 요청" : "계약 작성");
    if (inquiry) {
      if (!inquiry.lease_ids.includes(lease.id)) inquiry.lease_ids.push(lease.id);
      if (inquiry.stage !== "concluded") inquiry.stage = status === "awaiting_signature" ? "signing" : "drafting";
      inquiry.last_activity_at = nowIso();
      logHistory("inquiry", inquiry.id, `${unit.code}호 계약 작성`);
    }
    // 홀드는 계약으로 넘어갔으니 푼다
    db.blocks = db.blocks.filter((k) => !(k.kind === "hold" && k.unit_id === unit.id && (!inquiry || k.inquiry_id === inquiry.id)));
    return lease;
  }),

  route("PATCH /api/leases/:id", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const b = body ?? {};
    // 메모·담당은 언제나, 돈·기간은 입주 전까지만 고친다
    if (b.memo !== undefined) l.memo = String(b.memo);
    if (b.assignee_id !== undefined) l.assignee_id = b.assignee_id || null;
    const moneyKeys = ["deposit", "mgmt_deposit", "prepaid_rent", "contract_fee", "rent", "mgmt_fee", "cleaning_fee"] as const;
    const touchesTerms = moneyKeys.some((k) => b[k] !== undefined) || b.start_date !== undefined || b.end_date !== undefined || b.vat !== undefined || b.payer_id !== undefined;
    if (touchesTerms) {
      if (!["draft", "awaiting_signature", "concluded", "move_in_confirmed"].includes(l.status))
        throw new HttpError(409, `${LEASE_STATUS[l.status].label} 계약은 금액·기간을 고칠 수 없다. 재계약이나 직접 청구로 처리한다`);
      const start = b.start_date ?? l.start_date;
      const end = b.end_date ?? l.end_date;
      if (end < start) throw new HttpError(400, "만료일이 시작일보다 앞이다");
      const clash = overlapping(db, l.unit_id, start, end, l.id);
      if (clash) throw new HttpError(409, `${clash.start_date} ~ ${leaseLastDay(clash)} 의 다른 계약과 기간이 겹친다`);
      l.start_date = start;
      l.end_date = end;
      l.due_day = Number(start.slice(8, 10));
      for (const k of moneyKeys) if (b[k] !== undefined) l[k] = num(b[k]);
      if (b.vat === "none" || b.vat === "included" || b.vat === "excluded") l.vat = b.vat;
      if (b.payer_id) l.payer_id = must(db.parties.find((p) => p.id === b.payer_id), "납부자").id;
    }
    if (b.move_in_date !== undefined) l.move_in_date = b.move_in_date || null;
    if (b.source_group !== undefined) l.source_group = String(b.source_group);
    logHistory("lease", l.id, "계약 내용 수정");
    return l;
  }),

  route("POST /api/leases/:id/transition", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const to = body?.to as LeaseStatus;
    const allowed = (LEASE_FLOW[l.status] ?? []).find((f) => f.to === to);
    if (!allowed) throw new HttpError(409, `${LEASE_STATUS[l.status].label} 계약은 ${LEASE_STATUS[to]?.label ?? to}(으)로 바꿀 수 없다`);
    const t = today();
    const date: string | undefined = body?.date || undefined;
    const inquiry = l.inquiry_id ? db.inquiries.find((q) => q.id === l.inquiry_id) : undefined;

    if (to === "awaiting_signature") {
      if (inquiry && inquiry.stage !== "concluded") inquiry.stage = "signing";
    } else if (to === "concluded") {
      l.signed_at = nowIso();
      if (!l.renewal_of) {
        if (l.contract_fee > 0) db.charges.push(newCharge(l, "contract_fee", "계약금", l.contract_fee, t, { status: "sent" }));
        const balance = l.deposit + l.mgmt_deposit - l.contract_fee;
        const due = plusDays(l.start_date, -1) > t ? plusDays(l.start_date, -1) : t;
        if (balance > 0) db.charges.push(newCharge(l, "deposit", "보증금 잔금", balance, due, { status: "sent" }));
      }
      if (l.prepaid_rent > 0) db.charges.push(newCharge(l, "prepaid_rent", "선납임대료", l.prepaid_rent, plusDays(l.start_date, -1) > t ? plusDays(l.start_date, -1) : t, { status: "sent" }));
      // 이번 달까지 시작하는 청구 기간은 바로 청구서 초안을 만든다
      for (let m = ym(l.start_date); m <= ym(t); m = plusMonth(m, 1)) ensurePeriodCharges(db, l, m);
      if (inquiry) {
        inquiry.stage = "concluded";
        inquiry.closed_at = inquiry.closed_at ?? nowIso();
        inquiry.last_activity_at = nowIso();
        logHistory("inquiry", inquiry.id, "계약 체결");
      }
    } else if (to === "move_in_confirmed") {
      l.move_in_date = date ?? l.move_in_date ?? l.start_date;
    } else if (to === "occupied") {
      l.move_in_date = date ?? l.move_in_date ?? l.start_date;
    } else if (to === "closing") {
      const out = date ?? l.end_date;
      if (out < l.start_date) throw new HttpError(400, "퇴실일이 시작일보다 앞이다");
      l.move_out_date = out;
      const hasCleaning = db.charges.some((c) => c.lease_id === l.id && c.kind === "cleaning" && c.status !== "cancelled");
      if (!hasCleaning && l.cleaning_fee > 0) db.charges.push(newCharge(l, "cleaning", "퇴실청소비", l.cleaning_fee, out, { status: "sent", vat: "none" }));
    } else if (to === "closed") {
      const st = db.settlements.find((s) => s.lease_id === l.id);
      if (!st || (st.status !== "confirmed" && st.status !== "refunded")) throw new HttpError(409, "정산을 먼저 확정한다(정산 탭에서 보증금 반환 금액을 확정)");
      l.closed_at = nowIso();
    } else if (to === "cancelled") {
      l.closed_at = nowIso();
      for (const c of db.charges) if (c.lease_id === l.id && c.status === "draft") c.status = "cancelled";
      db.blocks = db.blocks.filter((k) => !(k.kind === "hold" && k.unit_id === l.unit_id && k.inquiry_id === l.inquiry_id));
    }
    const from = l.status;
    l.status = to;
    logHistory("lease", l.id, `${LEASE_STATUS[from].label} → ${LEASE_STATUS[to].label}${body?.reason ? ` · ${body.reason}` : ""}`);
    return l;
  }),

  route("GET /api/leases/:id/ledger", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const l = must(ix.lease.get(params.id), "계약");
    const charges = db.charges
      .filter((c) => c.lease_id === l.id)
      .map((c) => {
        const paid = c.status === "cancelled" ? 0 : chargePaid(ix, c);
        return { ...c, paid, left: c.status === "cancelled" ? 0 : c.amount - paid, overdue: isBilled(c) && c.due_date < t && c.amount - paid > 0 };
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.kind.localeCompare(b.kind));
    const chargeIds = new Set(charges.map((c) => c.id));
    const allocs = db.allocations.filter((a) => chargeIds.has(a.charge_id));
    const payIds = new Set(allocs.map((a) => a.payment_id));
    const payments = db.payments
      .filter((p) => payIds.has(p.id))
      .map((p) => ({ ...p, to_this_lease: allocs.filter((a) => a.payment_id === p.id).reduce((s, a) => s + a.amount, 0) }))
      .sort((a, b) => a.received_at.localeCompare(b.received_at));
    const m = leaseMoney(ix, l, t);
    return {
      charges,
      allocations: allocs,
      payments,
      totals: { billed: m.billed, paid: m.paid, overdue: m.overdue, upcoming: m.upcoming, deposit_held: depositHeldChain(ix, l), draft: charges.filter((c) => c.status === "draft").reduce((s, c) => s + c.amount, 0) },
    };
  }),

  route("GET /api/leases/:id/settlement", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const l = must(ix.lease.get(params.id), "계약");
    return draftSettlement(db, ix, l);
  }),

  route("PUT /api/leases/:id/settlement", ({ params, body }) => {
    const db = getDB();
    const ix = indexDB(db);
    const l = must(ix.lease.get(params.id), "계약");
    if (!["occupied", "closing", "closed"].includes(l.status)) throw new HttpError(409, "입주한 계약만 정산한다");
    const deductions: Deduction[] = (Array.isArray(body?.deductions) ? body.deductions : [])
      .map((d: { label?: string; amount?: number }) => ({ label: String(d.label ?? "").trim() || "기타 차감", amount: num(d.amount) }))
      .filter((d: Deduction) => d.amount !== 0);
    const status: Settlement["status"] = body?.status === "refunded" ? "refunded" : body?.status === "confirmed" ? "confirmed" : "draft";
    let st = db.settlements.find((s) => s.lease_id === l.id);
    if (st?.status === "refunded") throw new HttpError(409, "이미 반환을 마친 정산이다");
    if ((status === "confirmed" || status === "refunded") && l.status === "occupied") throw new HttpError(409, "퇴실 처리 뒤에 정산을 확정한다");
    const deposit = depositHeldChain(ix, l);
    const unpaid = settlementUnpaid(ix, l);
    const ded = deductions.reduce((s, d) => s + d.amount, 0);
    if (!st) {
      st = { id: newId("st"), lease_id: l.id, status: "draft", deposit_total: deposit, unpaid, deductions, refund_amount: 0, refund_account: "", confirmed_at: null, refunded_at: null };
      db.settlements.push(st);
    }
    st.deposit_total = deposit;
    st.unpaid = unpaid;
    st.deductions = deductions;
    st.refund_amount = deposit - unpaid - ded;
    st.refund_account = String(body?.refund_account ?? st.refund_account ?? "");
    if (status === "confirmed" || status === "refunded") st.confirmed_at = st.confirmed_at ?? nowIso();
    if (status === "refunded") {
      if (st.refund_amount > 0 && !st.refund_account.trim()) throw new HttpError(400, "반환 계좌를 적는다");
      settleWithDeposit(db, l, st);
      st.refunded_at = nowIso();
    }
    st.status = status;
    logHistory("lease", l.id, status === "refunded" ? `보증금 반환 ${st.refund_amount.toLocaleString("ko-KR")}원` : status === "confirmed" ? "정산 확정" : "정산 임시 저장");
    return st;
  }),

  // 청구 ─────────────────────────────────────────────────
  route("GET /api/billing/payers/:id/history", ({ params, query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const b = query.get("branch_id");
    const unitOf = (leaseId: string | null) => (leaseId ? ix.unit.get(ix.lease.get(leaseId)?.unit_id ?? "")?.code ?? null : null);
    const charges = db.charges
      .filter(inBranch(b))
      .filter((c) => c.payer_id === params.id && c.status !== "cancelled")
      .map((c) => ({ id: c.id, type: "charge" as const, date: c.due_date, label: c.label, kind: c.kind, amount: c.amount, left: c.amount - chargePaid(ix, c), status: c.status, unit_code: unitOf(c.lease_id) }));
    const payments = db.payments
      .filter(inBranch(b))
      .filter((p) => p.payer_id === params.id)
      .map((p) => ({ id: p.id, type: "payment" as const, date: p.received_at.slice(0, 10), label: p.memo || `입금 · ${p.depositor_name}`, kind: p.method, amount: p.amount, left: p.amount - allocatedOf(db, p.id), status: p.status, unit_code: null }));
    return [...charges, ...payments].sort((x, y) => y.date.localeCompare(x.date) || (x.type === "payment" ? -1 : 1));
  }),

  route("GET /api/billing/payers", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    return payerBalances(db, ix, query.get("branch_id"), t)
      .map((p) => {
        const leases = p.lease_ids.map((id) => ix.lease.get(id)!).filter(Boolean);
        const due = leases.find((l) => l.status === "occupied")?.due_day ?? leases[0]?.due_day ?? null;
        return {
          ...p,
          leases: leases.map((l) => ({ id: l.id, unit_code: ix.unit.get(l.unit_id)?.code ?? "?", status: l.status, end_date: l.end_date })),
          due_day: due,
          deposit_status: p.unpaid > p.deposit_held ? ("short" as const) : ("ok" as const),
          deposit_gap: p.deposit_held - p.unpaid,
        };
      })
      .sort((a, b) => b.unpaid - a.unpaid || (a.unit_codes[0] ?? "").localeCompare(b.unit_codes[0] ?? "", "ko", { numeric: true }));
  }),

  route("GET /api/billing/receipts", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const status = query.get("status");
    const limit = Number(query.get("limit") ?? 500);
    const unitsOf = (payerId: string | null) =>
      payerId
        ? [...new Set(db.leases.filter((l) => l.payer_id === payerId && l.status !== "cancelled").sort((a, b) => b.start_date.localeCompare(a.start_date)).map((l) => ix.unit.get(l.unit_id)?.code ?? "?"))].slice(0, 3)
        : [];
    const rows = db.payments
      .filter(inBranch(query.get("branch_id")))
      .filter((p) => !status || p.status === status)
      .sort((a, b) => (a.status === "unmatched" ? 0 : 1) - (b.status === "unmatched" ? 0 : 1) || b.received_at.localeCompare(a.received_at));
    return rows.slice(0, limit).map((p) => {
      const allocated = allocatedOf(db, p.id);
      return { ...p, payer: partyCard(p.payer_id ? ix.party.get(p.payer_id) : undefined), allocated, left: p.amount - allocated, unit_codes: unitsOf(p.payer_id) };
    });
  }),

  route("POST /api/billing/receipts", ({ body }) => {
    const db = getDB();
    const b = body ?? {};
    const amount = num(b.amount);
    if (amount <= 0) throw new HttpError(400, "입금 금액을 적는다");
    const payer = b.payer_id ? must(db.parties.find((p) => p.id === b.payer_id), "납부자") : undefined;
    let branchId: string | undefined = b.branch_id && b.branch_id !== "all" ? b.branch_id : undefined;
    if (!branchId && payer) branchId = db.leases.find((l) => l.payer_id === payer.id)?.branch_id;
    if (!branchId) throw new HttpError(400, "지점을 고른다");
    const branch = must(db.branches.find((x) => x.id === branchId), "지점");
    const received = String(b.received_at || today());
    const pay: Payment = {
      id: newId("pay"),
      branch_id: branch.id,
      payer_id: payer?.id ?? null,
      depositor_name: String(b.depositor_name || payer?.name || "").trim() || "이름 없음",
      amount,
      received_at: received.length === 10 ? `${received}T12:00:00+09:00` : received,
      account: String(b.account || branch.bank_account),
      method: "direct",
      status: payer ? "matched" : "unmatched",
      memo: String(b.memo ?? ""),
    };
    db.payments.push(pay);
    const allocated = allocateFIFO(db, pay);
    return { ...pay, allocated, left: amount - allocated };
  }),

  route("POST /api/billing/receipts/:id/match", ({ params, body }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (pay.status === "matched" && pay.payer_id) throw new HttpError(409, "이미 납부자를 맞춘 입금이다");
    const payer = must(db.parties.find((p) => p.id === body?.payer_id), "납부자");
    pay.payer_id = payer.id;
    pay.status = "matched";
    const allocated = allocateFIFO(db, pay);
    return { ...pay, allocated, left: pay.amount - allocatedOf(db, pay.id) };
  }),

  route("POST /api/billing/receipts/:id/skip", ({ params }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (allocatedOf(db, pay.id) > 0) throw new HttpError(409, "청구에 배분된 입금은 수납 아님으로 바꿀 수 없다");
    pay.status = "skipped";
    pay.payer_id = null;
    return pay;
  }),

  route("POST /api/billing/receipts/:id/unskip", ({ params }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    pay.status = "unmatched";
    return pay;
  }),

  route("POST /api/billing/receipts/:id/cancel", ({ params }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (pay.method !== "direct") throw new HttpError(409, "은행 입금은 지울 수 없다. 수납 아님으로 바꾼다");
    db.allocations = db.allocations.filter((a) => a.payment_id !== pay.id);
    db.payments = db.payments.filter((p) => p.id !== pay.id);
    return { ok: true };
  }),

  route("GET /api/billing/book", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const m = monthParam(query.get("month"), today());
    const b = query.get("branch_id");
    const unitOfLease = (leaseId: string | null) => (leaseId ? ix.unit.get(ix.lease.get(leaseId)?.unit_id ?? "")?.code ?? null : null);
    const nameOf = (pid: string | null) => (pid ? ix.party.get(pid)?.name ?? "" : "");
    const rows: Array<{ entry: string; kind: "charge" | "payment" | "allocation" | "refund"; date: string; unit_code: string | null; payer: string; payer_id: string | null; lease_id: string | null; label: string; amount: number; cancelled: boolean; status: string }> = [];
    for (const c of db.charges.filter(inBranch(b))) {
      if (c.month !== m || c.status === "draft") continue;
      rows.push({ entry: c.id, kind: "charge", date: c.due_date, unit_code: unitOfLease(c.lease_id), payer: nameOf(c.payer_id), payer_id: c.payer_id, lease_id: c.lease_id, label: c.label || CHARGE_KIND[c.kind], amount: c.amount, cancelled: c.status === "cancelled", status: c.status });
    }
    const payById = new Map(db.payments.map((p) => [p.id, p]));
    for (const p of db.payments.filter(inBranch(b))) {
      if (ym(p.received_at.slice(0, 10)) !== m) continue;
      rows.push({ entry: p.id, kind: "payment", date: p.received_at.slice(0, 10), unit_code: null, payer: p.payer_id ? nameOf(p.payer_id) : p.depositor_name, payer_id: p.payer_id, lease_id: null, label: p.method === "bank" ? `계좌 입금 · ${p.depositor_name}` : p.memo || "직접 기록", amount: p.amount, cancelled: p.status === "skipped", status: p.status });
    }
    const chargeById = new Map(db.charges.map((c) => [c.id, c]));
    for (const a of db.allocations) {
      if (ym(a.at.slice(0, 10)) !== m) continue;
      const c = chargeById.get(a.charge_id);
      const p = payById.get(a.payment_id);
      if (!c || !inBranch(b)(c)) continue;
      rows.push({ entry: a.id, kind: "allocation", date: a.at.slice(0, 10), unit_code: unitOfLease(c.lease_id), payer: nameOf(c.payer_id), payer_id: c.payer_id, lease_id: c.lease_id, label: `${c.label} ← ${p?.depositor_name ?? "입금"}`, amount: a.amount, cancelled: false, status: "allocated" });
    }
    for (const s of db.settlements) {
      if (s.status !== "refunded" || !s.refunded_at || ym(s.refunded_at.slice(0, 10)) !== m) continue;
      const l = ix.lease.get(s.lease_id);
      if (!l || !inBranch(b)(l)) continue;
      rows.push({ entry: s.id, kind: "refund", date: s.refunded_at.slice(0, 10), unit_code: ix.unit.get(l.unit_id)?.code ?? null, payer: nameOf(l.contractor_id), payer_id: l.contractor_id, lease_id: l.id, label: "보증금 반환", amount: s.refund_amount, cancelled: false, status: "refunded" });
    }
    const order = { charge: 0, payment: 1, allocation: 2, refund: 3 };
    return rows.sort((x, y) => y.date.localeCompare(x.date) || order[x.kind] - order[y.kind]);
  }),

  route("GET /api/billing/revenue", ({ query }) => {
    const db = getDB();
    const t = today();
    const m = monthParam(query.get("month"), t);
    const months = Array.from({ length: 12 }, (_, i) => plusMonth(m, i - 11));
    const bid = query.get("branch_id");
    const branches = db.branches.filter((br) => !bid || bid === "all" || br.id === bid);
    const seriesTotal = months.map((mm) => ({ month: mm, rent: 0, mgmt: 0, usage: 0, other: 0, base: 0, fee: 0 }));
    const perBranch = branches.map((br) => {
      const rev = revenueOf(db, br.id, months);
      months.forEach((mm, i) => {
        const r = rev.get(mm)!;
        const base = r.rent + r.mgmt + r.other;
        const s = seriesTotal[i];
        s.rent += r.rent;
        s.mgmt += r.mgmt;
        s.usage += r.usage;
        s.other += r.other;
        s.base += base;
        s.fee += commission(br.commission, base);
      });
      const r = rev.get(m)!;
      const resident = r.rent + r.mgmt + r.usage + r.other;
      const base = r.rent + r.mgmt + r.other;
      return {
        branch_id: br.id,
        name: br.name,
        term: br.commission,
        by_kind: { rent: Math.round(r.rent), mgmt: Math.round(r.mgmt), usage: Math.round(r.usage), other: Math.round(r.other) },
        resident_revenue: Math.round(resident),
        base: Math.round(base),
        fee: commission(br.commission, base),
      };
    });
    const round = <T extends Record<string, number | string>>(o: T): T => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v])) as T;
    return {
      month: m,
      partial: m === ym(t),
      branches: perBranch,
      total: {
        resident_revenue: perBranch.reduce((s, x) => s + x.resident_revenue, 0),
        base: perBranch.reduce((s, x) => s + x.base, 0),
        fee: perBranch.reduce((s, x) => s + x.fee, 0),
        by_kind: {
          rent: perBranch.reduce((s, x) => s + x.by_kind.rent, 0),
          mgmt: perBranch.reduce((s, x) => s + x.by_kind.mgmt, 0),
          usage: perBranch.reduce((s, x) => s + x.by_kind.usage, 0),
          other: perBranch.reduce((s, x) => s + x.by_kind.other, 0),
        },
      },
      series: seriesTotal.map(round),
    };
  }),

  route("POST /api/billing/generate", ({ body }) => {
    const db = getDB();
    const m = monthParam(body?.month ?? null, today());
    let created = 0;
    const leases = db.leases.filter(inBranch(body?.branch_id)).filter((l) => ["concluded", "move_in_confirmed", "occupied", "closing"].includes(l.status));
    for (const l of leases) created += ensurePeriodCharges(db, l, m);
    return { created, month: m };
  }),

  route("POST /api/billing/send", ({ body }) => {
    const db = getDB();
    const ids: string[] = Array.isArray(body?.charge_ids) ? body.charge_ids : [];
    const via: "email" | "manual" = body?.via === "manual" ? "manual" : "email";
    let sent = 0;
    const now = nowIso();
    for (const c of db.charges) {
      if (!ids.includes(c.id)) continue;
      if (c.status === "cancelled") continue;
      if (c.status === "sent" && via !== "email") continue;
      c.status = "sent";
      c.sent_at = now;
      c.sent_via = via;
      c.invoice_no = c.invoice_no ?? invoiceNo(c.month, c.payer_id);
      sent++;
    }
    if (!sent) throw new HttpError(400, "보낼 청구를 고른다");
    // 이미 받아 둔 과납이 있으면 새 청구부터 채운다
    for (const pid of new Set(db.charges.filter((c) => ids.includes(c.id)).map((c) => c.payer_id)))
      for (const p of db.payments.filter((x) => x.payer_id === pid && x.status === "matched")) allocateFIFO(db, p);
    return { sent };
  }),

  route("POST /api/billing/charges", ({ body }) => {
    const db = getDB();
    const b = body ?? {};
    const l = must(db.leases.find((x) => x.id === b.lease_id), "계약");
    const amount = num(b.amount);
    if (amount <= 0) throw new HttpError(400, "금액을 적는다");
    const kind: ChargeKind = (Object.keys(CHARGE_KIND) as ChargeKind[]).includes(b.kind) ? b.kind : "other";
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_date)) ? String(b.due_date) : today();
    const vat: VatMode = b.vat === "included" || b.vat === "excluded" ? b.vat : "none";
    const c = newCharge(l, kind, String(b.label || CHARGE_KIND[kind]), amount, due, { from: b.period_from || null, to: b.period_to || null, vat, status: "draft" });
    db.charges.push(c);
    logHistory("lease", l.id, `직접 청구 · ${c.label} ${c.amount.toLocaleString("ko-KR")}원`);
    return c;
  }),

  route("DELETE /api/billing/charges/:id", ({ params }) => {
    const db = getDB();
    const c = must(db.charges.find((x) => x.id === params.id), "청구");
    if (c.status !== "draft") throw new HttpError(409, "보낸 청구는 지울 수 없다. 정정 청구로 처리한다");
    c.status = "cancelled";
    return c;
  }),

  route("GET /api/billing", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const m = monthParam(query.get("month"), t);
    const groups = new Map<string, Charge[]>();
    for (const c of db.charges.filter(inBranch(query.get("branch_id")))) {
      if (c.month !== m || c.status === "cancelled") continue;
      groups.set(c.payer_id, [...(groups.get(c.payer_id) ?? []), c]);
    }
    return [...groups.entries()]
      .map(([payerId, cs]) => {
        const lines = cs
          .map((c) => {
            const paid = chargePaid(ix, c);
            return { ...c, paid, left: c.amount - paid, unit_code: c.lease_id ? ix.unit.get(ix.lease.get(c.lease_id)?.unit_id ?? "")?.code ?? null : null };
          })
          .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.kind.localeCompare(b.kind));
        const total = lines.reduce((s, x) => s + x.amount, 0);
        const paid = lines.reduce((s, x) => s + x.paid, 0);
        const left = total - paid;
        const due = lines.reduce((d, x) => (x.due_date < d ? x.due_date : d), lines[0].due_date);
        let status: "to_send" | "sent" | "nothing" | "paid" | "overdue";
        if (total === 0) status = "nothing";
        else if (lines.some((x) => x.status === "draft" || x.status === "scheduled")) status = "to_send";
        else if (left <= 0) status = "paid";
        else if (lines.some((x) => x.left > 0 && x.due_date < t)) status = "overdue";
        else status = "sent";
        const leaseIds = [...new Set(lines.map((x) => x.lease_id).filter((x): x is string => !!x))];
        return {
          key: payerId,
          payer: partyCard(ix.party.get(payerId)),
          unit_codes: [...new Set(lines.map((x) => x.unit_code).filter((x): x is string => !!x))],
          lease_ids: leaseIds,
          lines,
          total,
          paid,
          left,
          status,
          due_date: due,
          last_sent_at: lines.reduce<string | null>((s, x) => (x.sent_at && (!s || x.sent_at > s) ? x.sent_at : s), null),
        };
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.unit_codes[0] ?? "").localeCompare(b.unit_codes[0] ?? "", "ko", { numeric: true }));
  }),
];
