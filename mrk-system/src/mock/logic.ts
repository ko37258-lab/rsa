/**
 * 여러 화면이 같이 쓰는 계산. 모든 Mock 핸들러는 여기 값으로 숫자를 맞춘다.
 */
import type { Charge, DB, Lease, Party, PartyCard, Unit, UnitBlock, UnitType } from "@/types";
import { SIGNED_LEASE, NON_REVENUE } from "@/lib/codes";
import { daysBetween, overlapDays, plusDays } from "@/lib/dates";

export interface Index {
  unit: Map<string, Unit>;
  type: Map<string, UnitType>;
  party: Map<string, Party>;
  lease: Map<string, Lease>;
  paid: Map<string, number>; // charge_id → 배분된 금액
  leasesByUnit: Map<string, Lease[]>;
  chargesByLease: Map<string, Charge[]>;
  chargesByPayer: Map<string, Charge[]>;
}

export function indexDB(db: DB): Index {
  const ix: Index = {
    unit: new Map(db.units.map((u) => [u.id, u])),
    type: new Map(db.unit_types.map((t) => [t.id, t])),
    party: new Map(db.parties.map((p) => [p.id, p])),
    lease: new Map(db.leases.map((l) => [l.id, l])),
    paid: new Map(),
    leasesByUnit: new Map(),
    chargesByLease: new Map(),
    chargesByPayer: new Map(),
  };
  for (const a of db.allocations) ix.paid.set(a.charge_id, (ix.paid.get(a.charge_id) ?? 0) + a.amount);
  for (const l of db.leases) {
    const arr = ix.leasesByUnit.get(l.unit_id) ?? [];
    arr.push(l);
    ix.leasesByUnit.set(l.unit_id, arr);
  }
  for (const arr of ix.leasesByUnit.values()) arr.sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (const c of db.charges) {
    if (c.status === "cancelled") continue;
    if (c.lease_id) ix.chargesByLease.set(c.lease_id, [...(ix.chargesByLease.get(c.lease_id) ?? []), c]);
    ix.chargesByPayer.set(c.payer_id, [...(ix.chargesByPayer.get(c.payer_id) ?? []), c]);
  }
  return ix;
}

/** "all" 이면 모든 지점 */
export function inBranch(branchId: string | null | undefined) {
  return (x: { branch_id: string | null }) => !branchId || branchId === "all" || x.branch_id === branchId;
}

export function partyCard(p: Party | undefined): PartyCard | null {
  if (!p) return null;
  return { id: p.id, name: p.name, kind: p.kind, phone: p.phone, email: p.email };
}

/** 이 날짜에 호실을 차지하는(체결 이후) 계약 */
export function isSigned(l: Lease): boolean {
  return SIGNED_LEASE.includes(l.status);
}

/** 계약이 호실을 실제로 쓰는 마지막 날 */
export function leaseLastDay(l: Lease): string {
  return l.move_out_date && l.move_out_date < l.end_date ? l.move_out_date : l.end_date;
}

/** 계약이 그날 호실을 잡고 있나(서명 대기 포함) */
export function holdsUnitOn(l: Lease, date: string): boolean {
  if (l.status === "cancelled" || l.status === "draft") return false;
  return l.start_date <= date && leaseLastDay(l) >= date;
}

export function chargePaid(ix: Index, c: Charge): number {
  return ix.paid.get(c.id) ?? 0;
}

/** 확정 청구(보낸 것)만 돈 계산에 넣는다 */
export function isBilled(c: Charge): boolean {
  return c.status === "sent" || c.status === "scheduled";
}

export type UnitState = "occupied" | "reserved" | "vacant" | "suspended" | "hold" | "off_sale";

export interface UnitToday {
  state: UnitState;
  lease: Lease | null; // 지금 계약
  next_lease: Lease | null; // 다음 계약
  free_from: string | null; // 이날부터 비어 판매 가능
  free_until: string | null; // 이날까지 비어 있음(다음 계약 전날)
  block: UnitBlock | null;
}

export function unitToday(db: DB, ix: Index, unit: Unit, today: string): UnitToday {
  const leases = (ix.leasesByUnit.get(unit.id) ?? []).filter((l) => l.status !== "cancelled" && l.status !== "draft");
  const lease = leases.find((l) => holdsUnitOn(l, today)) ?? null;
  const next = leases.find((l) => l.start_date > today) ?? null;
  const block =
    db.blocks.find(
      (b) => b.unit_id === unit.id && b.from <= today && (!b.until || b.until >= today) && (b.kind === "suspend" || !b.hold_expires_at || b.hold_expires_at.slice(0, 10) >= today),
    ) ?? null;
  const free_from = lease ? plusDays(leaseLastDay(lease), 1) : today;
  const free_until = next ? plusDays(next.start_date, -1) : null;
  let state: UnitState;
  if (unit.sale_status === "off_sale") state = "off_sale";
  else if (block?.kind === "suspend") state = "suspended";
  else if (lease) state = lease.status === "occupied" || lease.status === "closing" || lease.status === "closed" ? "occupied" : "reserved";
  else if (block?.kind === "hold") state = "hold";
  else state = "vacant";
  return { state, lease, next_lease: next, free_from, free_until, block };
}

/** 운영 호실(판매 중) — 기간 계산 분모 */
export function operatedUnits(db: DB, branchId: string | null): Unit[] {
  return db.units.filter(inBranch(branchId)).filter((u) => u.sale_status === "on_sale");
}

/** [from,to] 기간의 점유율·계약율 (호실-일 기준) */
export function occupancy(db: DB, branchId: string | null, from: string, to: string, today: string) {
  const units = operatedUnits(db, branchId);
  const unitIds = new Set(units.map((u) => u.id));
  const days = daysBetween(from, to) + 1;
  const capacity = units.length * days;
  let occupied = 0;
  let contracted = 0;
  for (const l of db.leases) {
    if (!unitIds.has(l.unit_id) || !isSigned(l)) continue;
    const d = overlapDays(l.start_date, leaseLastDay(l), from, to);
    if (!d) continue;
    contracted += d;
    // 오늘 이후는 "점유" 가 아직 아니다
    const occTo = to < today ? to : today;
    if (from <= occTo && (l.status === "occupied" || l.status === "closing" || l.status === "closed"))
      occupied += overlapDays(l.start_date, leaseLastDay(l), from, occTo);
  }
  const pastDays = to < today ? days : Math.max(0, daysBetween(from, today) + 1);
  return {
    capacity,
    occupied_days: occupied,
    contracted_days: contracted,
    occupancy: pastDays ? occupied / (units.length * pastDays) : null,
    contract_rate: capacity ? contracted / capacity : null,
    vacant_days: Math.max(0, capacity - contracted),
  };
}

export interface PayerBalance {
  payer_id: string;
  payer: PartyCard | null;
  unit_codes: string[];
  lease_ids: string[];
  charged: number; // 납기가 지난 확정 청구 합
  received: number; // 받은 돈(배분 + 남은 돈)
  unpaid: number; // 납기 지난 미납
  upcoming: number; // 납기 전 미납
  overdue_days: number; // 가장 오래된 미납의 경과일
  credit: number; // 배분 안 된 입금(과납)
  deposit_held: number; // 받아 둔 보증금
}

export function payerBalances(db: DB, ix: Index, branchId: string | null, today: string): PayerBalance[] {
  const map = new Map<string, PayerBalance>();
  const get = (pid: string) => {
    let b = map.get(pid);
    if (!b) {
      b = { payer_id: pid, payer: partyCard(ix.party.get(pid)), unit_codes: [], lease_ids: [], charged: 0, received: 0, unpaid: 0, upcoming: 0, overdue_days: 0, credit: 0, deposit_held: 0 };
      map.set(pid, b);
    }
    return b;
  };
  for (const l of db.leases.filter(inBranch(branchId))) {
    if (!isSigned(l) || l.status === "closed") continue;
    const b = get(l.payer_id);
    b.lease_ids.push(l.id);
    const code = ix.unit.get(l.unit_id)?.code;
    if (code && !b.unit_codes.includes(code)) b.unit_codes.push(code);
  }
  for (const c of db.charges.filter(inBranch(branchId))) {
    if (!isBilled(c)) continue;
    if (!map.has(c.payer_id)) continue;
    const b = get(c.payer_id);
    const paid = chargePaid(ix, c);
    const left = c.amount - paid;
    if (NON_REVENUE.includes(c.kind) && c.kind !== "contract_fee") b.deposit_held += paid;
    if (c.due_date <= today) {
      b.charged += c.amount;
      b.unpaid += left;
      if (left > 0) b.overdue_days = Math.max(b.overdue_days, daysBetween(c.due_date, today));
    } else b.upcoming += left;
  }
  for (const p of db.payments.filter(inBranch(branchId))) {
    if (!p.payer_id || !map.has(p.payer_id) || p.status !== "matched") continue;
    const b = get(p.payer_id);
    b.received += p.amount;
    const used = db.allocations.filter((a) => a.payment_id === p.id).reduce((s, a) => s + a.amount, 0);
    b.credit += p.amount - used;
  }
  return [...map.values()];
}

/** 계약 하나의 돈 요약 */
export function leaseMoney(ix: Index, lease: Lease, today: string) {
  const cs = ix.chargesByLease.get(lease.id) ?? [];
  let billed = 0;
  let paid = 0;
  let overdue = 0;
  let upcoming = 0;
  let depositHeld = 0;
  for (const c of cs) {
    if (!isBilled(c)) continue;
    const p = chargePaid(ix, c);
    billed += c.amount;
    paid += p;
    if (c.kind === "deposit" || c.kind === "contract_fee") depositHeld += p;
    if (c.due_date <= today) overdue += c.amount - p;
    else upcoming += c.amount - p;
  }
  return { billed, paid, overdue, upcoming, deposit_held: depositHeld };
}

/** 받아 둔 보증금(재계약이면 원 계약에서 이어받은 것까지) */
export function depositHeldChain(ix: Index, lease: Lease): number {
  let l: Lease | undefined = lease;
  let guard = 0;
  while (l && guard++ < 10) {
    const cs = ix.chargesByLease.get(l.id) ?? [];
    const held = cs.filter((c) => c.kind === "deposit" || c.kind === "contract_fee").reduce((s, c) => s + chargePaid(ix, c), 0);
    if (held > 0 || !l.renewal_of) return held;
    l = ix.lease.get(l.renewal_of);
  }
  return 0;
}

/** 매출 인식: 사용 기간의 달에 넣는다(기간이 없으면 청구일 달). 계약금·보증금은 제외 */
export function revenueByMonth(db: DB, branchId: string | null): Map<string, { rent: number; other: number }> {
  const out = new Map<string, { rent: number; other: number }>();
  for (const c of db.charges.filter(inBranch(branchId))) {
    if (c.status === "cancelled" || c.status === "draft" || NON_REVENUE.includes(c.kind)) continue;
    const m = (c.period_from ?? c.due_date).slice(0, 7);
    const r = out.get(m) ?? { rent: 0, other: 0 };
    if (c.kind === "rent") r.rent += c.supply;
    else r.other += c.supply;
    out.set(m, r);
  }
  return out;
}

/** 룸타입 정가 중앙값(공실 손실 계산용) */
export function medianListRent(db: DB, branchId: string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of db.unit_types.filter(inBranch(branchId))) out.set(t.id, t.list_rent);
  return out;
}
