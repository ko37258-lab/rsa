/**
 * 청구 · 수납 · 장부 API (원본 /api/billing…)
 *
 * 청구 흐름: 발송 대기(draft) → 확인(scheduled: 청구서 번호 고정, 청구일 9시 메일 예약) → 발송 완료(sent).
 * 확인 취소하면 발송 대기로 돌아가고 번호는 다시 쓰지 않는다.
 * Mock 의 "메일 발송기"(flush)는 청구 화면을 읽을 때마다 예약 시각이 지난 청구서를 보낸 것으로 바꾼다.
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, saveDB, today } from "../db";
import { indexDB, inBranch, partyCard, payerBalances, chargePaid, isBilled, isSigned, type Index } from "../logic";
import { logHistory } from "./common";
import { CHARGE_KIND } from "@/lib/codes";
import { ym, plusMonth, plusDays, monthStart, monthEnd, overlapDays } from "@/lib/dates";
import { scheduleLines, billDayIn } from "../schedule";
import type { Charge, ChargeKind, DB, Invoice, Lease, Party, Payment, VatMode } from "@/types";
import {
  monthParam, newCharge, ensurePeriodCharges, allocatedOf, allocateFIFO, allocatable, num, revenueOf, commission, vatSplit, VAT_KINDS,
  lineExists, chargeFromLine,
} from "./finance-shared";

// ── 도우미 ─────────────────────────────────────────────

/** 청구서에 붙이는 발송 기록 · 못 보낸 이유(공유 타입에 없는 필드라 여기서 넓힌다) */
type Send = { at: string; via: Invoice["via"]; to: string | null; kind: "send" | "resend" | "manual" };
type InvoiceX = Invoice & { sends?: Send[]; fail_reason?: string | null };

const OPEN: Lease["status"][] = ["concluded", "move_in_confirmed", "occupied", "closing"];
const iso = (d: string, h: number) => `${d}T${String(h).padStart(2, "0")}:00:00+09:00`;

function unitCodeOf(ix: Index, leaseId: string | null): string | null {
  if (!leaseId) return null;
  return ix.unit.get(ix.lease.get(leaseId)?.unit_id ?? "")?.code ?? null;
}

function branchOf(db: DB, id: string) {
  return db.branches.find((b) => b.id === id);
}

/** 메일 발송기: 예약 시각이 지난 청구서를 보낸 것으로 바꾼다. 바뀐 게 있으면 저장 */
function flush(db: DB): number {
  const now = nowIso();
  let n = 0;
  for (const inv of db.invoices as InvoiceX[]) {
    if (inv.state !== "scheduled" || !inv.send_after || inv.send_after > now) continue;
    markSent(db, inv, inv.send_after, "send");
    n++;
  }
  if (n) saveDB();
  return n;
}

function markSent(db: DB, inv: InvoiceX, at: string, kind: Send["kind"]): void {
  inv.state = "sent";
  inv.sent_at = at;
  inv.fail_reason = null;
  inv.sends = [...(inv.sends ?? []), { at, via: inv.via, to: inv.via === "email" ? inv.recipient_email : null, kind }];
  for (const c of db.charges) {
    if (!inv.charge_ids.includes(c.id) || c.status === "cancelled") continue;
    c.status = "sent";
    c.sent_at = at;
    c.sent_via = inv.via;
  }
}

/** yymm-##### — 그 달 번호 중 가장 큰 것 + 1. 취소된 청구서 번호도 세므로 다시 쓰지 않는다 */
function nextInvoiceNo(db: DB, billDate: string): string {
  const prefix = `${billDate.slice(2, 4)}${billDate.slice(5, 7)}-`;
  let max = 0;
  for (const inv of db.invoices) if (inv.invoice_no.startsWith(prefix)) max = Math.max(max, Number(inv.invoice_no.slice(prefix.length)) || 0);
  for (const c of db.charges) if (c.invoice_no?.startsWith(prefix)) max = Math.max(max, Number(c.invoice_no.slice(prefix.length)) || 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

function sendAfter(db: DB, branchId: string, billDate: string): string {
  const hour = branchOf(db, branchId)?.terms?.send_hour ?? 9;
  const at = iso(billDate, hour);
  const now = nowIso();
  return new Date(at).getTime() < new Date(now).getTime() ? now : at;
}

function accountText(db: DB, branchId: string): string {
  const b = branchOf(db, branchId);
  const a = b?.accounts?.[0];
  return a ? `${a.bank} ${a.number} · 예금주 ${a.holder}` : b?.bank_account ?? "";
}

function lineView(ix: Index, c: Charge) {
  const paid = chargePaid(ix, c);
  return { ...c, paid, left: c.amount - paid, unit_code: unitCodeOf(ix, c.lease_id) };
}

/** 청구서 하나를 화면·인쇄용으로 */
function invoiceView(db: DB, ix: Index, inv: InvoiceX) {
  const t = today();
  const lines = db.charges
    .filter((c) => inv.charge_ids.includes(c.id))
    .map((c) => lineView(ix, c))
    .sort((a, b) => (a.unit_code ?? "").localeCompare(b.unit_code ?? "", "ko", { numeric: true }) || (a.period_from ?? "").localeCompare(b.period_from ?? "") || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  // 지난 청구 중 아직 남은 돈(이월)
  const carry = db.charges
    .filter((c) => c.payer_id === inv.payer_id && isBilled(c) && !inv.charge_ids.includes(c.id) && c.due_date < inv.bill_date)
    .map((c) => lineView(ix, c))
    .filter((c) => c.left > 0);
  const payer = ix.party.get(inv.payer_id);
  const branch = branchOf(db, inv.branch_id);
  const leaseIds = [...new Set(lines.map((l) => l.lease_id).filter((x): x is string => !!x))];
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const paid = lines.reduce((s, l) => s + l.paid, 0);
  return {
    ...inv,
    sends: inv.sends ?? [],
    fail_reason: inv.fail_reason ?? null,
    total,
    paid,
    left: total - paid,
    due_date: lines.reduce((d, l) => (l.due_date < d ? l.due_date : d), lines[0]?.due_date ?? inv.bill_date),
    overdue: lines.some((l) => l.left > 0 && l.due_date < t),
    lines,
    carry_over: { total: carry.reduce((s, c) => s + c.left, 0), lines: carry.slice(0, 12) },
    payer: partyCard(payer),
    payer_contact: payer ? { email: payer.email, phone: payer.phone, contact_name: payer.contact_name, kind: payer.kind } : null,
    leases: leaseIds.map((id) => ({ id, unit_code: unitCodeOf(ix, id) ?? "?" })),
    branch: branch ? { id: branch.id, name: branch.name, name_en: branch.name_en, address: branch.address, phone: branch.phone, email: branch.email } : null,
    account: accountText(db, inv.branch_id),
  };
}

const KIND_ORDER: ChargeKind[] = ["rent", "discount", "mgmt", "usage", "deposit", "contract_fee", "prepaid_rent", "cleaning", "damage", "penalty", "other"];

/** 이름 비교용: 공백·괄호·법인 표기를 빼고 소문자로 */
function normName(s: string): string {
  return s
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "")
    .replace(/[()\s.,·*-]/g, "")
    .toLowerCase();
}

/** "김*수" 처럼 가린 이름이 맞는지 */
function maskedMatch(masked: string, name: string): boolean {
  const m = masked.replace(/\s/g, "");
  if (!m.includes("*")) return false;
  const re = new RegExp(`^${m.split("*").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".")}$`);
  return re.test(name.replace(/\s/g, ""));
}

/** 영문 이름 "SATO Y" ↔ "Sato Yui" */
function initialsMatch(dep: string, name: string): boolean {
  const a = dep.toLowerCase().split(/\s+/).filter(Boolean);
  const b = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (a.length < 2 || b.length < 2) return false;
  return a[0] === b[0] && b[1].startsWith(a[1]);
}

interface Candidate {
  payer_id: string;
  payer: ReturnType<typeof partyCard>;
  unit_codes: string[];
  unpaid: number;
  score: number;
  reasons: string[];
}

/** 안 맞춘 입금 하나에 맞을 만한 납부자 */
function suggest(db: DB, ix: Index, pay: Payment, balances: ReturnType<typeof payerBalances>): Candidate[] {
  const dep = pay.depositor_name ?? "";
  const depN = normName(dep);
  const memo = `${pay.memo ?? ""} ${dep} ${Object.values(pay.bank_row ?? {}).join(" ")}`;
  const out: Candidate[] = [];
  for (const b of balances) {
    const payer = ix.party.get(b.payer_id);
    if (!payer) continue;
    const leases = b.lease_ids.map((id) => ix.lease.get(id)).filter((l): l is Lease => !!l);
    const names: Array<[string, string]> = [[payer.name, payer.kind === "corporation" ? "법인명" : "납부자"]];
    if (payer.contact_name) names.push([payer.contact_name, "법인 담당자"]);
    for (const l of leases) {
      const c = ix.party.get(l.contractor_id);
      if (c && c.id !== payer.id) names.push([c.name, "계약자"]);
      for (const oid of l.occupant_ids ?? []) {
        const o = ix.party.get(oid);
        if (o) names.push([o.name, "입주자"]);
      }
    }
    let score = 0;
    const reasons: string[] = [];
    let nameHit = false;
    for (const [n, role] of names) {
      const nn = normName(n);
      if (!nn || !depN) continue;
      if (nn === depN) {
        score += 6;
        reasons.push(`이름 같음(${role})`);
        nameHit = true;
        break;
      }
      if ((depN.length >= 2 && nn.includes(depN)) || (nn.length >= 2 && depN.includes(nn)) || maskedMatch(dep, n) || initialsMatch(dep, n)) {
        score += 3;
        reasons.push(`이름 비슷함(${role})`);
        nameHit = true;
        break;
      }
    }
    // 금액: 미납 합계, 청구서 합계와 같나
    const amt = allocatable(pay);
    const owed = b.unpaid + b.upcoming;
    if (b.unpaid > 0 && amt === b.unpaid) {
      score += 4;
      reasons.push("미납액과 같음");
    } else if (owed > 0 && amt === owed) {
      score += 4;
      reasons.push("미납액과 같음(납기 전 포함)");
    } else {
      const invTotals = db.invoices.filter((i) => i.payer_id === b.payer_id && i.state !== "cancelled").map((i) => i.total);
      if (invTotals.includes(amt)) {
        score += 4;
        reasons.push("금액이 청구서 합계와 같음");
      }
    }
    const code = b.unit_codes.find((u) => new RegExp(`(^|\\D)${u}(호|\\D|$)`).test(memo));
    if (code) {
      score += 3;
      reasons.push(`적요에 호실 번호(${code}호)`);
    }
    if (score >= 3 && (nameHit || score >= 4))
      out.push({ payer_id: b.payer_id, payer: partyCard(payer), unit_codes: b.unit_codes, unpaid: b.unpaid, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

function receiptView(db: DB, ix: Index, p: Payment) {
  const allocated = allocatedOf(db, p.id);
  const units = p.payer_id
    ? [...new Set(db.leases.filter((l) => l.payer_id === p.payer_id && l.status !== "cancelled").sort((a, b) => b.start_date.localeCompare(a.start_date)).map((l) => ix.unit.get(l.unit_id)?.code ?? "?"))].slice(0, 3)
    : [];
  return {
    ...p,
    payer: partyCard(p.payer_id ? ix.party.get(p.payer_id) : undefined),
    allocatable: allocatable(p),
    allocated,
    left: allocatable(p) - allocated,
    unit_codes: units,
  };
}

function payerFor(db: DB, id: unknown): Party {
  return must(db.parties.find((p) => p.id === id), "납부자");
}

function applyFees(p: Payment, b: Record<string, unknown>): void {
  if (b.platform_fee !== undefined) p.platform_fee = Math.max(0, num(b.platform_fee));
  if (b.pass_through !== undefined) p.pass_through = Math.max(0, num(b.pass_through));
  if (b.pass_through_reason !== undefined) p.pass_through_reason = String(b.pass_through_reason || "").trim() || null;
  if (p.pass_through > p.amount + p.platform_fee) throw new HttpError(400, "홈즈 몫 아님이 입금보다 크다");
}

/** 청구서 묶음 단위(납부자 + 청구일)로 그 달 청구를 모은다 */
function monthGroups(db: DB, ix: Index, branchId: string | null, m: string) {
  const t = today();
  const groups = new Map<string, Charge[]>();
  for (const c of db.charges.filter(inBranch(branchId))) {
    if (ym(c.bill_date ?? c.due_date) !== m || c.status === "cancelled") continue;
    const key = `${c.payer_id}|${c.bill_date ?? c.due_date}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const invById = new Map((db.invoices as InvoiceX[]).map((i) => [i.id, i]));
  const cancelledFor = new Set<string>();
  for (const inv of db.invoices) if (inv.state === "cancelled") for (const id of inv.charge_ids) cancelledFor.add(id);

  return [...groups.entries()]
    .map(([key, cs]) => {
      const [payerId, billDate] = key.split("|");
      const lines = cs
        .map((c) => lineView(ix, c))
        .sort((a, b) => (a.unit_code ?? "").localeCompare(b.unit_code ?? "", "ko", { numeric: true }) || (a.period_from ?? "").localeCompare(b.period_from ?? "") || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
      const invIds = [...new Set(lines.map((l) => l.invoice_id).filter((x): x is string => !!x))];
      const invoices = invIds.map((id) => invById.get(id)).filter((x): x is InvoiceX => !!x && x.state !== "cancelled");
      const inv = invoices.sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at))[0] ?? null;
      const drafts = lines.filter((l) => l.status === "draft");
      const needs = drafts.filter((l) => l.needs_amount).length;
      const total = lines.reduce((s, x) => s + x.amount, 0);
      const billed = lines.filter((l) => l.status !== "draft");
      const paid = lines.reduce((s, x) => s + x.paid, 0);
      const left = billed.reduce((s, x) => s + x.left, 0);
      let send_state: "draft" | "needs_amount" | "resend" | "scheduled" | "sent" | "failed" | "nothing";
      if (needs) send_state = "needs_amount";
      else if (drafts.length && drafts.some((d) => cancelledFor.has(d.id))) send_state = "resend";
      else if (drafts.length && !inv) send_state = "draft";
      else if (inv?.state === "failed") send_state = "failed";
      else if (inv?.state === "scheduled") send_state = "scheduled";
      else if (inv?.state === "sent") send_state = drafts.length ? "draft" : "sent";
      else if (drafts.length) send_state = "draft";
      else send_state = "nothing";
      let money_state: "none" | "unpaid" | "partial" | "paid" | "overdue";
      if (!billed.length) money_state = "none";
      else if (left <= 0) money_state = "paid";
      else if (billed.some((x) => x.left > 0 && x.due_date < t)) money_state = "overdue";
      else money_state = paid > 0 ? "partial" : "unpaid";
      const payer = ix.party.get(payerId);
      return {
        key,
        payer: partyCard(payer),
        recipient_email: payer?.email || null,
        unit_codes: [...new Set(lines.map((x) => x.unit_code).filter((x): x is string => !!x))],
        lease_ids: [...new Set(lines.map((x) => x.lease_id).filter((x): x is string => !!x))],
        branch_id: cs[0].branch_id,
        bill_date: billDate,
        due_date: lines.reduce((d, x) => (x.due_date < d ? x.due_date : d), lines[0].due_date),
        lines,
        total,
        paid,
        left,
        draft_count: drafts.length,
        needs_amount: needs,
        added_after_confirm: inv && inv.state !== "sent" ? drafts.length : 0,
        send_state,
        money_state,
        invoice: inv
          ? { id: inv.id, invoice_no: inv.invoice_no, state: inv.state, via: inv.via, send_after: inv.send_after, sent_at: inv.sent_at, confirmed_at: inv.confirmed_at, fail_reason: inv.fail_reason ?? null, sends: inv.sends ?? [] }
          : null,
        invoice_count: invoices.length,
      };
    })
    .sort((a, b) => a.bill_date.localeCompare(b.bill_date) || (a.unit_codes[0] ?? "").localeCompare(b.unit_codes[0] ?? "", "ko", { numeric: true }));
}

/** 확인: 고른 청구를 납부자·청구일로 묶어 청구서를 만든다 */
function confirmCharges(db: DB, ids: string[], via: Invoice["via"]) {
  const groups = new Map<string, Charge[]>();
  let blocked = 0;
  for (const c of db.charges) {
    if (!ids.includes(c.id) || c.status !== "draft") continue;
    if (c.needs_amount) {
      blocked++;
      continue;
    }
    const key = `${c.payer_id}|${c.bill_date ?? c.due_date}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  if (!groups.size) throw new HttpError(400, blocked ? `고지서 금액이 필요한 청구 ${blocked}건은 확인할 수 없다. 금액을 먼저 넣는다` : "확인할 청구를 고른다");
  const now = nowIso();
  const made: InvoiceX[] = [];
  let failed = 0;
  for (const [key, cs] of groups) {
    const [payerId, bill] = key.split("|");
    const payer = db.parties.find((p) => p.id === payerId);
    const inv: InvoiceX = {
      id: newId("inv"),
      invoice_no: nextInvoiceNo(db, bill),
      branch_id: cs[0].branch_id,
      payer_id: payerId,
      bill_date: bill,
      charge_ids: cs.map((c) => c.id),
      total: cs.reduce((s, c) => s + c.amount, 0),
      state: "scheduled",
      via,
      recipient_email: payer?.email || null,
      confirmed_at: now,
      send_after: null,
      sent_at: null,
      cancelled_at: null,
      sends: [],
      fail_reason: null,
    };
    db.invoices.push(inv);
    for (const c of cs) {
      c.status = "scheduled";
      c.invoice_id = inv.id;
      c.invoice_no = inv.invoice_no;
    }
    if (via === "email") {
      if (!inv.recipient_email) {
        inv.state = "failed";
        inv.fail_reason = "계약자 메일이 없다";
        failed++;
      } else inv.send_after = sendAfter(db, inv.branch_id, bill);
    } else markSent(db, inv, now, "manual");
    made.push(inv);
  }
  // 받아 둔 과납이 있으면 새 청구부터 채운다
  for (const pid of new Set(made.map((i) => i.payer_id)))
    for (const p of db.payments.filter((x) => x.payer_id === pid && x.status === "matched")) allocateFIFO(db, p);
  return { invoices: made.length, blocked, failed, scheduled: made.filter((i) => i.state === "scheduled").length, sent: made.filter((i) => i.state === "sent").length, ids: made.map((i) => i.id) };
}

/** 계약의 청구 일정 중 청구일이 지났는데 청구가 없는 줄 */
function leaseGaps(db: DB, l: Lease) {
  const t = today();
  if (!isSigned(l) || l.status === "cancelled") return [];
  return scheduleLines(l)
    .filter((x) => x.bill_date <= t && !lineExists(db, l, x))
    .map((x) => ({ kind: x.kind, label: x.label, period_from: x.period_from, period_to: x.period_to, amount: x.amount, bill_date: x.bill_date, due_date: x.due_date, needs_amount: x.needs_amount }));
}

/** 그 달에 계약이 살아 있나 */
function leaseInMonth(l: Lease, m: string): boolean {
  const last = l.move_out_date && l.move_out_date < l.end_date ? l.move_out_date : l.end_date;
  return overlapDays(l.start_date, last, monthStart(m), monthEnd(m)) > 0;
}

const VAT_LABEL: Record<VatMode, string> = { excluded: "별도", included: "포함", none: "비과세" };
function vatFromLabel(s: string, fallback: VatMode): VatMode {
  if (/별도/.test(s)) return "excluded";
  if (/포함/.test(s)) return "included";
  if (/비과세|없음|면세/.test(s)) return "none";
  return fallback;
}

/** 엑셀 날짜 칸 → yyyy-MM-dd */
function cellDate(v: unknown): string | null {
  const m = String(v ?? "").match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

// ── 경로 ────────────────────────────────────────────────

export const billingRoutes: Route[] = [
  // 청구서 ───────────────────────────────────────────────
  route("GET /api/billing/invoices/history", ({ query }) => {
    const db = getDB();
    flush(db);
    const ix = indexDB(db);
    const pid = query.get("recipient_party_id");
    const m = query.get("month") ? monthParam(query.get("month"), today()) : null;
    return (db.invoices as InvoiceX[])
      .filter(inBranch(query.get("branch_id")))
      .filter((i) => (!pid || i.payer_id === pid) && (!m || ym(i.bill_date) === m))
      .sort((a, b) => b.bill_date.localeCompare(a.bill_date) || b.confirmed_at.localeCompare(a.confirmed_at))
      .slice(0, 200)
      .map((i) => ({ ...i, sends: i.sends ?? [], fail_reason: i.fail_reason ?? null, payer: partyCard(ix.party.get(i.payer_id)), unit_codes: [...new Set(i.charge_ids.map((id) => unitCodeOf(ix, db.charges.find((c) => c.id === id)?.lease_id ?? null)).filter(Boolean))] }));
  }),

  route("GET /api/billing/invoices/:id", ({ params }) => {
    const db = getDB();
    flush(db);
    const ix = indexDB(db);
    return invoiceView(db, ix, must(db.invoices.find((i) => i.id === params.id), "청구서") as InvoiceX);
  }),

  route("POST /api/billing/confirm", ({ body }) => {
    const db = getDB();
    const ids: string[] = Array.isArray(body?.charge_ids) ? body.charge_ids : [];
    const via: Invoice["via"] = body?.via === "manual" || body?.via === "kakao" ? body.via : "email";
    const r = confirmCharges(db, ids, via);
    return r;
  }),

  /** 예전 화면 호환: 확인 + 바로 보내기 */
  route("POST /api/billing/send", ({ body }) => {
    const db = getDB();
    const ids: string[] = Array.isArray(body?.charge_ids) ? body.charge_ids : [];
    const via: Invoice["via"] = body?.via === "manual" || body?.via === "kakao" ? body.via : "email";
    const r = confirmCharges(db, ids, via);
    const now = nowIso();
    for (const inv of db.invoices as InvoiceX[]) if (r.ids.includes(inv.id) && inv.state === "scheduled") markSent(db, inv, now, "send");
    return { ...r, sent: r.invoices - r.failed };
  }),

  route("POST /api/billing/invoices/:id/unconfirm", ({ params }) => {
    const db = getDB();
    const inv = must(db.invoices.find((i) => i.id === params.id), "청구서") as InvoiceX;
    if (inv.state === "sent") throw new HttpError(409, "이미 나간 청구서는 확인 취소할 수 없다. 재발송하거나 정정 청구로 처리한다");
    if (inv.state === "cancelled") throw new HttpError(409, "이미 확인 취소한 청구서다");
    const ix = indexDB(db);
    const cs = db.charges.filter((c) => inv.charge_ids.includes(c.id));
    if (cs.some((c) => chargePaid(ix, c) !== 0)) throw new HttpError(409, "입금이 붙은 청구가 있어 확인 취소할 수 없다. 입금 재배분을 먼저 한다");
    inv.state = "cancelled";
    inv.cancelled_at = nowIso();
    for (const c of cs) {
      if (c.status === "cancelled") continue;
      c.status = "draft";
      c.invoice_id = null;
      c.invoice_no = null;
      c.sent_at = null;
      c.sent_via = null;
    }
    return { ok: true, invoice_no: inv.invoice_no };
  }),

  route("POST /api/billing/invoices/:id/send-now", ({ params }) => {
    const db = getDB();
    const inv = must(db.invoices.find((i) => i.id === params.id), "청구서") as InvoiceX;
    if (inv.state === "sent") throw new HttpError(409, "이미 보낸 청구서다. 재발송을 쓴다");
    if (inv.state === "cancelled") throw new HttpError(409, "확인 취소한 청구서다");
    const payer = db.parties.find((p) => p.id === inv.payer_id);
    if (inv.via === "email") {
      inv.recipient_email = payer?.email || inv.recipient_email;
      if (!inv.recipient_email) throw new HttpError(409, "계약자 메일이 없다. 고객 정보에 메일을 넣거나 직접 보냄으로 기록한다");
    }
    markSent(db, inv, nowIso(), "send");
    return invoiceView(db, indexDB(db), inv);
  }),

  route("POST /api/billing/invoices/:id/resend", ({ params, body }) => {
    const db = getDB();
    const inv = must(db.invoices.find((i) => i.id === params.id), "청구서") as InvoiceX;
    if (inv.state !== "sent") throw new HttpError(409, "보낸 청구서만 다시 보낸다");
    const via: Invoice["via"] = body?.via === "manual" || body?.via === "kakao" ? body.via : "email";
    const payer = db.parties.find((p) => p.id === inv.payer_id);
    if (via === "email" && !payer?.email) throw new HttpError(409, "계약자 메일이 없다");
    const at = nowIso();
    inv.sends = [...(inv.sends ?? []), { at, via, to: via === "email" ? payer?.email ?? null : null, kind: "resend" }];
    inv.sent_at = at;
    return invoiceView(db, indexDB(db), inv);
  }),

  route("POST /api/billing/invoices/:id/mark-sent", ({ params, body }) => {
    const db = getDB();
    const inv = must(db.invoices.find((i) => i.id === params.id), "청구서") as InvoiceX;
    if (inv.state === "cancelled") throw new HttpError(409, "확인 취소한 청구서다");
    inv.via = body?.via === "kakao" ? "kakao" : "manual";
    if (inv.state === "sent") inv.sends = [...(inv.sends ?? []), { at: nowIso(), via: inv.via, to: null, kind: "manual" }];
    else markSent(db, inv, nowIso(), "manual");
    return invoiceView(db, indexDB(db), inv);
  }),

  // 청구 줄 ──────────────────────────────────────────────
  route("POST /api/billing/charges", ({ body }) => {
    const db = getDB();
    const b = body ?? {};
    const l = must(db.leases.find((x) => x.id === b.lease_id), "계약");
    const amount = num(b.amount);
    if (amount === 0) throw new HttpError(400, "금액을 적는다");
    const kind: ChargeKind = (Object.keys(CHARGE_KIND) as ChargeKind[]).includes(b.kind) ? b.kind : "other";
    if (amount < 0 && kind !== "discount") throw new HttpError(400, "음수 금액은 할인으로만 넣는다");
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_date)) ? String(b.due_date) : today();
    const bill = /^\d{4}-\d{2}-\d{2}$/.test(String(b.bill_date)) ? String(b.bill_date) : due;
    const vat: VatMode = b.vat === "included" || b.vat === "excluded" ? b.vat : "none";
    const c = newCharge(l, kind, String(b.label || CHARGE_KIND[kind]), kind === "discount" ? -Math.abs(amount) : amount, due, {
      from: b.period_from || null,
      to: b.period_to || null,
      vat,
      bill,
      status: "draft",
    });
    db.charges.push(c);
    logHistory("lease", l.id, `직접 청구 · ${c.label} ${c.amount.toLocaleString("ko-KR")}원`);
    return c;
  }),

  /** 발송 대기 청구의 금액 고치기 · 고지서 금액 넣기 */
  route("PATCH /api/billing/charges/:id", ({ params, body }) => {
    const db = getDB();
    const c = must(db.charges.find((x) => x.id === params.id), "청구");
    if (c.status !== "draft") throw new HttpError(409, "확인한 청구는 고칠 수 없다. 확인 취소하거나 정정 청구로 처리한다");
    const l = c.lease_id ? db.leases.find((x) => x.id === c.lease_id) : undefined;
    if (body?.amount !== undefined) {
      const base = num(body.amount);
      if (base < 0 && c.kind !== "discount") throw new HttpError(400, "금액은 0원 이상이다");
      const vat: VatMode = body.vat === "included" || body.vat === "excluded" || body.vat === "none" ? body.vat : VAT_KINDS.includes(c.kind) ? l?.vat ?? "none" : "none";
      Object.assign(c, vatSplit(c.kind === "discount" ? -Math.abs(base) : base, vat));
      c.needs_amount = false;
    }
    if (body?.label) c.label = String(body.label).trim();
    if (l) logHistory("lease", l.id, `청구 금액 ${c.needs_amount ? "" : "확정"} · ${c.label} ${c.amount.toLocaleString("ko-KR")}원`);
    return c;
  }),

  route("DELETE /api/billing/charges/:id", ({ params }) => {
    const db = getDB();
    const c = must(db.charges.find((x) => x.id === params.id), "청구");
    if (c.status !== "draft") throw new HttpError(409, "확인한 청구는 지울 수 없다. 확인 취소하거나 정정 청구로 처리한다");
    if (db.allocations.some((a) => a.charge_id === c.id)) throw new HttpError(409, "입금이 붙은 청구는 지울 수 없다");
    c.status = "cancelled";
    return c;
  }),

  // 청구서 만들기 ───────────────────────────────────────────
  route("GET /api/billing/generate-preview", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const m = monthParam(query.get("month"), today());
    const lines: Array<{ lease_id: string; unit_code: string; branch_id: string; payer: string; kind: string; label: string; amount: number; bill_date: string; needs_amount: boolean; days: number | null; month_days: number | null }> = [];
    for (const l of db.leases.filter(inBranch(query.get("branch_id"))).filter((x) => OPEN.includes(x.status))) {
      for (const x of scheduleLines(l)) {
        if (ym(x.bill_date) !== m || lineExists(db, l, x)) continue;
        lines.push({ lease_id: l.id, unit_code: ix.unit.get(l.unit_id)?.code ?? "?", branch_id: l.branch_id, payer: ix.party.get(l.payer_id)?.name ?? "", kind: x.kind, label: x.label, amount: x.amount, bill_date: x.bill_date, needs_amount: x.needs_amount, days: x.days, month_days: x.month_days });
      }
    }
    lines.sort((a, b) => a.bill_date.localeCompare(b.bill_date) || a.unit_code.localeCompare(b.unit_code, "ko", { numeric: true }));
    return {
      month: m,
      lines,
      total: lines.reduce((s, x) => s + x.amount, 0),
      leases: new Set(lines.map((x) => x.lease_id)).size,
      needs_amount: lines.filter((x) => x.needs_amount).length,
      prorated: lines.filter((x) => x.days !== null).length,
    };
  }),

  route("POST /api/billing/generate", ({ body }) => {
    const db = getDB();
    const m = monthParam(body?.month ?? null, today());
    let created = 0;
    const leases = db.leases.filter(inBranch(body?.branch_id)).filter((l) => OPEN.includes(l.status));
    for (const l of leases) created += ensurePeriodCharges(db, l, m);
    return { created, month: m };
  }),

  // 관리비 엑셀(빌딩케어 양식 호환) ───────────────────────────────
  route("GET /api/billing/bill-form", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const bid = query.get("branch_id");
    if (!bid || bid === "all") throw new HttpError(400, "관리비 엑셀은 지점을 하나 고른 뒤 내려받는다");
    const branch = must(branchOf(db, bid), "지점");
    const m = monthParam(query.get("month"), today());
    const header = ["호실 정보(변경불가)", "항목", "공급가", "VAT 유형", "사용기간(시작)", "사용기간(종료)", "비고"];
    const rows: Array<Array<string | number | null>> = [];
    const leases = db.leases
      .filter((l) => l.branch_id === bid && OPEN.includes(l.status) && leaseInMonth(l, m))
      .sort((a, b) => (ix.unit.get(a.unit_id)?.code ?? "").localeCompare(ix.unit.get(b.unit_id)?.code ?? "", "ko", { numeric: true }));
    const prevFrom = monthStart(plusMonth(m, -1));
    const prevTo = monthEnd(plusMonth(m, -1));
    for (const l of leases) {
      const unit = `${ix.unit.get(l.unit_id)?.code ?? "?"}호 · ${ix.party.get(l.contractor_id)?.name ?? ""}`;
      const vat = VAT_LABEL[l.vat];
      const monthCharges = db.charges.filter((c) => c.lease_id === l.id && c.status !== "cancelled" && ym(c.bill_date ?? c.due_date) === m);
      const rent = monthCharges.find((c) => c.kind === "rent");
      const mgmt = monthCharges.find((c) => c.kind === "mgmt");
      // 이 달 월세 청구가 있는(또는 생길) 계약만 월세 줄을 넣는다. 나가는 계약은 사용료 줄만
      const rentLine = rent ?? scheduleLines(l).find((x) => x.kind === "rent" && ym(x.bill_date) === m);
      if (rentLine) rows.push([unit, "월세", rent ? rent.supply : rentLine.amount, vat, rentLine.period_from, rentLine.period_to, rent ? "" : "청구서 만들기 전"]);
      if (l.mgmt_mode === "bill" || mgmt)
        rows.push([unit, "관리비", mgmt && !mgmt.needs_amount ? mgmt.supply : null, vat, mgmt?.period_from ?? prevFrom, mgmt?.period_to ?? prevTo, mgmt?.needs_amount ? "고지서 금액 필요" : ""]);
      rows.push([unit, "전기", null, vat, prevFrom, prevTo, ""]);
      rows.push([unit, "가스·수도", null, vat, prevFrom, prevTo, ""]);
    }
    return { branch_name: branch.name, month: m, header, rows };
  }),

  route("POST /api/billing/bill-form", ({ body }) => {
    const db = getDB();
    const ix = indexDB(db);
    const bid = String(body?.branch_id ?? "");
    must(branchOf(db, bid), "지점");
    const m = monthParam(body?.month ?? null, today());
    const dry = body?.dry_run !== false;
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.rows) ? body.rows : [];
    const changes: Array<{ unit_code: string; item: string; action: "fill" | "update" | "create"; before: number | null; after: number; lease_id: string }> = [];
    const skipped: Array<{ unit_code: string; item: string; reason: string }> = [];
    let ignored = 0;
    // 한 호실에 나가는 계약·들어오는 계약이 같은 달에 있을 수 있다 → 계약자 이름으로 고른다
    const leasesByUnit = new Map<string, Lease[]>();
    for (const l of db.leases.filter((x) => x.branch_id === bid && OPEN.includes(x.status) && leaseInMonth(x, m))) {
      const code = ix.unit.get(l.unit_id)?.code;
      if (code) leasesByUnit.set(code, [...(leasesByUnit.get(code) ?? []), l]);
    }
    const pickLease = (code: string, unitText: string): Lease | "ambiguous" | null => {
      const ls = leasesByUnit.get(code) ?? [];
      if (ls.length <= 1) return ls[0] ?? null;
      const name = unitText.split("·")[1]?.trim();
      const hit = name ? ls.find((l) => ix.party.get(l.contractor_id)?.name === name) : undefined;
      return hit ?? "ambiguous";
    };
    for (const r of rows) {
      const unitText = String(r.unit ?? "");
      const item = String(r.item ?? "").trim();
      const supplyRaw = String(r.supply ?? "").replace(/[^\d-]/g, "");
      const code = unitText.match(/^\s*([A-Za-z0-9-]+)\s*호?/)?.[1] ?? "";
      if (!code || !item) continue;
      if (supplyRaw === "") {
        ignored++;
        continue;
      }
      const supply = Number(supplyRaw);
      const l = pickLease(code, unitText);
      if (l === "ambiguous") {
        skipped.push({ unit_code: code, item, reason: "이 호실에 이 달 계약이 둘이다 · «호실 정보» 칸의 계약자 이름을 그대로 둔다" });
        continue;
      }
      if (!l) {
        skipped.push({ unit_code: code, item, reason: "이 달 계약이 없다" });
        continue;
      }
      const vat = vatFromLabel(String(r.vat ?? ""), l.vat);
      const isRent = /월세|임대료/.test(item);
      const isMgmt = /관리비/.test(item);
      const pool = db.charges.filter((c) => c.lease_id === l.id && c.status !== "cancelled" && ym(c.bill_date ?? c.due_date) === m);
      if (isRent || isMgmt) {
        const c = pool.find((x) => x.kind === (isRent ? "rent" : "mgmt"));
        if (!c) {
          const planned = scheduleLines(l).some((x) => x.kind === (isRent ? "rent" : "mgmt") && ym(x.bill_date) === m);
          skipped.push({ unit_code: code, item, reason: planned ? "이 달 청구가 아직 없다 · 청구서 만들기를 먼저 한다" : `이 달 ${isRent ? "월세" : "관리비"} 청구가 없는 계약이다` });
          continue;
        }
        const touched = c.status !== "draft" || db.allocations.some((a) => a.charge_id === c.id);
        if (c.needs_amount) {
          if (touched) {
            skipped.push({ unit_code: code, item, reason: "보낸 청구서·입금 붙은 청구는 건드리지 않는다" });
            continue;
          }
          changes.push({ unit_code: code, item, action: "fill", before: null, after: vatSplit(supply, vat).amount, lease_id: l.id });
          if (!dry) {
            Object.assign(c, vatSplit(supply, vat));
            c.needs_amount = false;
          }
          continue;
        }
        if (c.supply === supply) continue; // 계약 금액과 같으면 그대로
        if (touched) {
          skipped.push({ unit_code: code, item, reason: "보낸 청구서·입금 붙은 청구는 건드리지 않는다" });
          continue;
        }
        changes.push({ unit_code: code, item, action: "update", before: c.amount, after: vatSplit(supply, vat).amount, lease_id: l.id });
        if (!dry) Object.assign(c, vatSplit(supply, vat));
        continue;
      }
      // 전기·가스·인터넷 등: 그 달 사용료 청구를 만든다(같은 이름이 있으면 고친다)
      const exist = pool.find((x) => x.kind === "usage" && x.label === item);
      if (exist) {
        if (exist.supply === supply) continue;
        if (exist.status !== "draft" || db.allocations.some((a) => a.charge_id === exist.id)) {
          skipped.push({ unit_code: code, item, reason: "보낸 청구서·입금 붙은 청구는 건드리지 않는다" });
          continue;
        }
        changes.push({ unit_code: code, item, action: "update", before: exist.amount, after: vatSplit(supply, vat).amount, lease_id: l.id });
        if (!dry) Object.assign(exist, vatSplit(supply, vat));
        continue;
      }
      const rent = pool.find((x) => x.kind === "rent");
      const bill = rent?.bill_date ?? billDayIn(m, l.due_day);
      const due = rent?.due_date ?? plusDays(bill, l.due_days ?? 0);
      changes.push({ unit_code: code, item, action: "create", before: null, after: vatSplit(supply, vat).amount, lease_id: l.id });
      if (!dry)
        db.charges.push(
          newCharge(l, "usage", item, supply, due, {
            bill,
            vat,
            from: cellDate(r.from) ?? monthStart(plusMonth(m, -1)),
            to: cellDate(r.to) ?? monthEnd(plusMonth(m, -1)),
            status: "draft",
          }),
        );
    }
    if (!dry) for (const lid of new Set(changes.map((c) => c.lease_id))) logHistory("lease", lid, `관리비 엑셀 반영 · ${m}`);
    return { month: m, dry_run: dry, changes, skipped, ignored };
  }),

  // 계약별 청구 ─────────────────────────────────────────────
  route("GET /api/billing/leases/:id/gaps", ({ params }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    return { gaps: leaseGaps(db, l) };
  }),

  route("POST /api/billing/leases/:id/gaps/fill", ({ params }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const t = today();
    let created = 0;
    if (isSigned(l))
      for (const x of scheduleLines(l)) {
        if (x.bill_date > t || lineExists(db, l, x)) continue;
        db.charges.push(chargeFromLine(l, x));
        created++;
      }
    if (created) logHistory("lease", l.id, `빠진 청구 ${created}줄 채움 · 발송 대기`);
    return { created };
  }),

  route("GET /api/billing/leases/:id", ({ params }) => {
    const db = getDB();
    flush(db);
    const ix = indexDB(db);
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const t = today();
    const cs = (ix.chargesByLease.get(l.id) ?? []).map((c) => lineView(ix, c));
    const billed = cs.filter((c) => isBilled(c));
    const upcoming = scheduleLines(l).find((x) => x.bill_date > t && !lineExists(db, l, x)) ?? null;
    const invIds = new Set(cs.map((c) => c.invoice_id).filter(Boolean));
    return {
      lease_id: l.id,
      terms: { cycle: l.cycle, billing_mode: l.billing_mode, prorate: l.prorate, due_day: l.due_day, due_days: l.due_days, mgmt_mode: l.mgmt_mode, vat: l.vat, discounts: l.discounts },
      totals: {
        billed: billed.reduce((s, c) => s + c.amount, 0),
        paid: billed.reduce((s, c) => s + c.paid, 0),
        overdue: billed.filter((c) => c.due_date <= t).reduce((s, c) => s + c.left, 0),
        upcoming: billed.filter((c) => c.due_date > t).reduce((s, c) => s + c.left, 0),
        draft: cs.filter((c) => c.status === "draft").reduce((s, c) => s + c.amount, 0),
        needs_amount: cs.filter((c) => c.status === "draft" && c.needs_amount).length,
      },
      next_line: upcoming,
      gaps: leaseGaps(db, l).length,
      invoices: (db.invoices as InvoiceX[])
        .filter((i) => invIds.has(i.id))
        .sort((a, b) => b.bill_date.localeCompare(a.bill_date))
        .map((i) => ({ id: i.id, invoice_no: i.invoice_no, bill_date: i.bill_date, state: i.state, via: i.via, total: i.total, sent_at: i.sent_at, send_after: i.send_after })),
    };
  }),

  // 납부자 ──────────────────────────────────────────────
  route("GET /api/billing/payers/:id/history", ({ params, query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const b = query.get("branch_id");
    const charges = db.charges
      .filter(inBranch(b))
      .filter((c) => c.payer_id === params.id && c.status !== "cancelled")
      .map((c) => ({ id: c.id, type: "charge" as const, date: c.due_date, label: c.label, kind: c.kind, amount: c.amount, left: c.amount - chargePaid(ix, c), status: c.status, unit_code: unitCodeOf(ix, c.lease_id), invoice_no: c.invoice_no }));
    const payments = db.payments
      .filter(inBranch(b))
      .filter((p) => p.payer_id === params.id)
      .map((p) => ({ id: p.id, type: "payment" as const, date: p.received_at.slice(0, 10), label: p.memo || `입금 · ${p.depositor_name}`, kind: p.method, amount: p.amount, left: allocatable(p) - allocatedOf(db, p.id), status: p.status, unit_code: null, invoice_no: null }));
    return [...charges, ...payments].sort((x, y) => y.date.localeCompare(x.date) || (x.type === "payment" ? -1 : 1));
  }),

  route("GET /api/billing/payers/:id", ({ params, query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const row = payerBalances(db, ix, query.get("branch_id"), today()).find((p) => p.payer_id === params.id);
    return row ?? must(null, "납부자");
  }),

  route("GET /api/billing/payers", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    return payerBalances(db, ix, query.get("branch_id"), t)
      .map((p) => {
        const leases = p.lease_ids.map((id) => ix.lease.get(id)!).filter(Boolean);
        const due = leases.find((l) => l.status === "occupied")?.due_day ?? leases[0]?.due_day ?? null;
        // 남은 돈(과납)은 플랫폼 수수료·홈즈 몫 아님까지 반영해 다시 센다
        const credit = db.payments
          .filter((x) => x.payer_id === p.payer_id && x.status === "matched")
          .reduce((s, x) => s + Math.max(0, allocatable(x) - allocatedOf(db, x.id)), 0);
        return {
          ...p,
          credit,
          leases: leases.map((l) => ({ id: l.id, unit_code: ix.unit.get(l.unit_id)?.code ?? "?", status: l.status, end_date: l.end_date })),
          due_day: due,
          deposit_status: p.unpaid > p.deposit_held ? ("short" as const) : ("ok" as const),
          deposit_gap: p.deposit_held - p.unpaid,
        };
      })
      .sort((a, b) => b.unpaid - a.unpaid || (a.unit_codes[0] ?? "").localeCompare(b.unit_codes[0] ?? "", "ko", { numeric: true }));
  }),

  // 계좌 · 은행 엑셀 ────────────────────────────────────────
  route("GET /api/billing/branch-accounts", ({ query }) => {
    const db = getDB();
    return db.branches
      .filter((b) => { const q = query.get("branch_id"); return !q || q === "all" || b.id === q; })
      .flatMap((b) => (b.accounts ?? []).map((a) => ({ ...a, branch_name: b.name })));
  }),

  route("GET /api/billing/bank-format", ({ query }) => {
    const db = getDB();
    const acc = db.branches.flatMap((b) => b.accounts ?? []).find((a) => a.id === query.get("account_id"));
    return {
      account: acc ?? null,
      format: acc?.format ?? null,
      aliases: {
        date: ["거래일시", "거래일자", "일자", "거래일", "날짜"],
        name: ["기재내용", "입금자", "보낸분", "내용", "의뢰인", "거래내용"],
        amount: ["입금액", "입금(원)", "맡기신금액", "입금금액", "받은금액"],
        out: ["출금액", "출금(원)", "찾으신금액", "출금금액"],
        memo: ["적요", "메모", "비고", "거래구분"],
      },
    };
  }),

  route("POST /api/billing/bank-deposits/upload", ({ body }) => {
    const db = getDB();
    const branch = must(branchOf(db, String(body?.branch_id ?? "")), "지점");
    const acc = (branch.accounts ?? []).find((a) => a.id === body?.account_id) ?? null;
    if (!acc && (branch.accounts ?? []).length) throw new HttpError(400, "입금 계좌를 고른다");
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.rows) ? body.rows : [];
    let created = 0;
    let duplicates = 0;
    let skipped = 0;
    const ids: string[] = [];
    const accountText = acc ? `${acc.bank} ${acc.number}` : branch.bank_account;
    for (const r of rows) {
      const amount = num(r.amount);
      const at = String(r.date ?? "");
      if (amount <= 0 || !/^\d{4}-\d{2}-\d{2}/.test(at)) {
        skipped++;
        continue;
      }
      const received = at.length === 10 ? `${at}T12:00:00+09:00` : at;
      const name = String(r.name ?? "").trim() || "이름 없음";
      const dup = db.payments.some(
        (p) => p.method === "bank" && (p.account_id ?? null) === (acc?.id ?? null) && p.received_at.slice(0, 16) === received.slice(0, 16) && p.depositor_name === name && p.amount === amount,
      );
      if (dup) {
        duplicates++;
        continue;
      }
      const raw = r.raw && typeof r.raw === "object" ? Object.fromEntries(Object.entries(r.raw as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])) : null;
      const pay: Payment = {
        id: newId("pay"),
        branch_id: branch.id,
        payer_id: null,
        depositor_name: name,
        amount,
        received_at: received,
        account: accountText,
        method: "bank",
        status: "unmatched",
        memo: String(r.memo ?? "").trim(),
        account_id: acc?.id ?? null,
        platform_fee: 0,
        pass_through: 0,
        pass_through_reason: null,
        bank_row: raw,
      };
      db.payments.push(pay);
      ids.push(pay.id);
      created++;
    }
    return { created, duplicates, skipped, ids };
  }),

  route("GET /api/billing/bank-deposits/suggestions", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const bid = query.get("branch_id");
    const only = query.get("payment_id");
    const unmatched = db.payments.filter(inBranch(bid)).filter((p) => p.status === "unmatched" && (!only || p.id === only));
    const cache = new Map<string, ReturnType<typeof payerBalances>>();
    return unmatched.map((p) => {
      let bal = cache.get(p.branch_id);
      if (!bal) {
        bal = payerBalances(db, ix, p.branch_id, t);
        cache.set(p.branch_id, bal);
      }
      const candidates = suggest(db, ix, p, bal);
      const top = candidates[0];
      return { payment_id: p.id, candidates, sure: !!top && top.score >= 9 && (!candidates[1] || candidates[1].score <= top.score - 4) };
    });
  }),

  route("GET /api/billing/bank-deposits/:id/original", ({ params }) => {
    const db = getDB();
    const p = must(db.payments.find((x) => x.id === params.id), "입금");
    const acc = db.branches.flatMap((b) => b.accounts ?? []).find((a) => a.id === p.account_id) ?? null;
    return { payment: p, bank_row: p.bank_row, account: acc };
  }),

  // 입금 ────────────────────────────────────────────────
  route("GET /api/billing/receipts/page", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const status = query.get("status");
    const offset = Math.max(0, Number(query.get("offset") ?? 0));
    const limit = Math.min(500, Math.max(1, Number(query.get("limit") ?? 50)));
    const needle = (query.get("q") ?? "").trim().toLowerCase().replace(/,/g, "");
    const all = db.payments.filter(inBranch(query.get("branch_id")));
    const counts = { all: all.length, unmatched: 0, matched: 0, skipped: 0 };
    for (const p of all) counts[p.status]++;
    const unitText = (pid: string | null) => (pid ? db.leases.filter((l) => l.payer_id === pid).map((l) => ix.unit.get(l.unit_id)?.code ?? "").join(" ") : "");
    const rows = all
      .filter((p) => !status || status === "all" || p.status === status)
      .filter((p) => !needle || [p.depositor_name, p.payer_id ? ix.party.get(p.payer_id)?.name : "", String(p.amount), p.memo, unitText(p.payer_id)].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => (a.status === "unmatched" ? 0 : 1) - (b.status === "unmatched" ? 0 : 1) || b.received_at.localeCompare(a.received_at));
    const page = rows.slice(offset, offset + limit).map((p) => receiptView(db, ix, p));
    return {
      rows: page,
      total: rows.length,
      next_offset: offset + limit < rows.length ? offset + limit : null,
      counts,
      unmatched_total: all.filter((p) => p.status === "unmatched").reduce((s, p) => s + p.amount, 0),
    };
  }),

  /** 예전 화면 호환(전체 목록) */
  route("GET /api/billing/receipts", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const status = query.get("status");
    const limit = Number(query.get("limit") ?? 500);
    return db.payments
      .filter(inBranch(query.get("branch_id")))
      .filter((p) => !status || p.status === status)
      .sort((a, b) => (a.status === "unmatched" ? 0 : 1) - (b.status === "unmatched" ? 0 : 1) || b.received_at.localeCompare(a.received_at))
      .slice(0, limit)
      .map((p) => receiptView(db, ix, p));
  }),

  /** 입금 하나와 배분 내역 · 다시 배분할 수 있는 청구 */
  route("GET /api/billing/receipts/:id", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const p = must(db.payments.find((x) => x.id === params.id), "입금");
    const mine = db.allocations.filter((a) => a.payment_id === p.id);
    const byCharge = new Map(mine.map((a) => [a.charge_id, a.amount]));
    const candidates = p.payer_id
      ? db.charges
          .filter((c) => c.payer_id === p.payer_id && (isBilled(c) || byCharge.has(c.id)))
          .map((c) => {
            const paidAll = chargePaid(ix, c);
            const mineAmt = byCharge.get(c.id) ?? 0;
            return { id: c.id, label: c.label, kind: c.kind, unit_code: unitCodeOf(ix, c.lease_id), due_date: c.due_date, amount: c.amount, paid_by_others: paidAll - mineAmt, mine: mineAmt, invoice_no: c.invoice_no };
          })
          .filter((c) => c.mine !== 0 || c.amount - c.paid_by_others !== 0)
          .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.amount - b.amount)
      : [];
    return { receipt: receiptView(db, ix, p), allocations: mine, candidates };
  }),

  route("POST /api/billing/receipts", ({ body }) => {
    const db = getDB();
    const b = body ?? {};
    const amount = num(b.amount);
    if (amount <= 0) throw new HttpError(400, "입금 금액을 적는다");
    const payer = b.payer_id ? payerFor(db, b.payer_id) : undefined;
    let branchId: string | undefined = b.branch_id && b.branch_id !== "all" ? b.branch_id : undefined;
    if (!branchId && payer) branchId = db.leases.find((l) => l.payer_id === payer.id)?.branch_id;
    if (!branchId) throw new HttpError(400, "지점을 고른다");
    const branch = must(branchOf(db, branchId), "지점");
    const received = String(b.received_at || today());
    const pay: Payment = {
      id: newId("pay"),
      branch_id: branch.id,
      payer_id: payer?.id ?? null,
      depositor_name: String(b.depositor_name || payer?.name || "").trim() || "이름 없음",
      amount,
      received_at: received.length === 10 ? `${received}T12:00:00+09:00` : received,
      account: String(b.account || "직접 기록"),
      method: "direct",
      status: payer ? "matched" : "unmatched",
      memo: String(b.memo ?? ""),
      account_id: null,
      platform_fee: 0,
      pass_through: 0,
      pass_through_reason: null,
      bank_row: null,
    };
    applyFees(pay, b);
    db.payments.push(pay);
    const allocated = allocateFIFO(db, pay);
    return { ...pay, allocated, left: allocatable(pay) - allocatedOf(db, pay.id) };
  }),

  route("POST /api/billing/receipts/:id/match", ({ params, body }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (pay.status === "matched" && pay.payer_id) throw new HttpError(409, "이미 납부자를 맞춘 입금이다");
    const payer = payerFor(db, body?.payer_id);
    applyFees(pay, body ?? {});
    pay.payer_id = payer.id;
    pay.status = "matched";
    const allocated = allocateFIFO(db, pay);
    return { ...pay, allocated, left: allocatable(pay) - allocatedOf(db, pay.id) };
  }),

  /** 맞춘 입금을 되돌려 다시 안 맞춘 입금으로(배분도 지운다) */
  route("POST /api/billing/receipts/:id/unmatch", ({ params }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (pay.method !== "bank") throw new HttpError(409, "직접 기록한 입금은 입금 취소를 쓴다");
    db.allocations = db.allocations.filter((a) => a.payment_id !== pay.id);
    pay.payer_id = null;
    pay.status = "unmatched";
    return pay;
  }),

  route("POST /api/billing/receipts/:id/fees", ({ params, body }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    applyFees(pay, body ?? {});
    if (allocatedOf(db, pay.id) > allocatable(pay)) throw new HttpError(409, "이미 배분한 돈보다 채울 수 있는 돈이 작아진다. 재배분을 먼저 한다");
    return receiptView(db, indexDB(db), pay);
  }),

  route("POST /api/billing/receipts/:id/reallocate", ({ params, body }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (pay.status !== "matched" || !pay.payer_id) throw new HttpError(409, "납부자를 맞춘 입금만 재배분한다");
    const list: Array<{ charge_id: string; amount: number }> = (Array.isArray(body?.allocations) ? body.allocations : [])
      .map((a: { charge_id: unknown; amount: unknown }) => ({ charge_id: String(a.charge_id), amount: num(a.amount) }))
      .filter((a: { amount: number }) => a.amount !== 0);
    const ix = indexDB(db);
    const mine = new Map(db.allocations.filter((a) => a.payment_id === pay.id).map((a) => [a.charge_id, 0]));
    for (const a of db.allocations) if (a.payment_id === pay.id) mine.set(a.charge_id, (mine.get(a.charge_id) ?? 0) + a.amount);
    let sum = 0;
    for (const a of list) {
      const c = must(db.charges.find((x) => x.id === a.charge_id), "청구");
      if (c.payer_id !== pay.payer_id) throw new HttpError(400, `${c.label}: 이 납부자의 청구가 아니다`);
      if (c.status === "cancelled") throw new HttpError(400, `${c.label}: 취소된 청구다`);
      const others = chargePaid(ix, c) - (mine.get(c.id) ?? 0);
      const room = c.amount - others;
      if (c.amount > 0 && (a.amount < 0 || a.amount > room)) throw new HttpError(400, `${c.label}: 0 ~ ${room.toLocaleString("ko-KR")}원 사이로 배분한다`);
      if (c.amount < 0 && (a.amount > 0 || a.amount < room)) throw new HttpError(400, `${c.label}: 할인은 ${room.toLocaleString("ko-KR")} ~ 0원 사이로 상쇄한다`);
      sum += a.amount;
    }
    if (sum > allocatable(pay)) throw new HttpError(400, `배분 합계 ${sum.toLocaleString("ko-KR")}원이 채울 수 있는 돈 ${allocatable(pay).toLocaleString("ko-KR")}원보다 크다`);
    if (sum < 0) throw new HttpError(400, "배분 합계가 0원보다 작다");
    db.allocations = db.allocations.filter((a) => a.payment_id !== pay.id);
    for (const a of list) db.allocations.push({ id: newId("al"), payment_id: pay.id, charge_id: a.charge_id, amount: a.amount, at: pay.received_at });
    return receiptView(db, indexDB(db), pay);
  }),

  /** 입금 잔액을 다음 청구(아직 안 보낸 것 포함)에 채운다 */
  route("POST /api/billing/receipts/:id/apply-credit", ({ params }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (pay.status !== "matched" || !pay.payer_id) throw new HttpError(409, "납부자를 맞춘 입금만 채운다");
    const allocated = allocateFIFO(db, pay, undefined, { includeDraft: true });
    return { allocated, left: allocatable(pay) - allocatedOf(db, pay.id) };
  }),

  route("POST /api/billing/receipts/:id/skip", ({ params }) => {
    const db = getDB();
    const pay = must(db.payments.find((p) => p.id === params.id), "입금");
    if (allocatedOf(db, pay.id) !== 0) throw new HttpError(409, "청구에 배분된 입금은 수납 아님으로 바꿀 수 없다");
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

  // 장부 · 매출 ─────────────────────────────────────────────
  route("GET /api/billing/book", ({ query }) => {
    const db = getDB();
    flush(db);
    const ix = indexDB(db);
    const m = monthParam(query.get("month"), today());
    const b = query.get("branch_id");
    const nameOf = (pid: string | null) => (pid ? ix.party.get(pid)?.name ?? "" : "");
    type Row = { entry: string; kind: "charge" | "payment" | "allocation" | "refund"; charge_kind: ChargeKind | null; date: string; unit_code: string | null; payer: string; payer_id: string | null; lease_id: string | null; label: string; amount: number; supply: number | null; vat: number | null; invoice_no: string | null; cancelled: boolean; status: string };
    const rows: Row[] = [];
    for (const c of db.charges.filter(inBranch(b))) {
      if (ym(c.bill_date ?? c.due_date) !== m || c.status === "draft") continue;
      rows.push({ entry: c.id, kind: "charge", charge_kind: c.kind, date: c.bill_date ?? c.due_date, unit_code: unitCodeOf(ix, c.lease_id), payer: nameOf(c.payer_id), payer_id: c.payer_id, lease_id: c.lease_id, label: c.label || CHARGE_KIND[c.kind], amount: c.amount, supply: c.supply, vat: c.vat_amount, invoice_no: c.invoice_no, cancelled: c.status === "cancelled", status: c.status });
    }
    const payById = new Map(db.payments.map((p) => [p.id, p]));
    for (const p of db.payments.filter(inBranch(b))) {
      if (ym(p.received_at.slice(0, 10)) !== m) continue;
      const fee = p.platform_fee ? ` · 플랫폼 수수료 ${p.platform_fee.toLocaleString("ko-KR")}` : "";
      const pass = p.pass_through ? ` · 홈즈 몫 아님 ${p.pass_through.toLocaleString("ko-KR")}` : "";
      rows.push({ entry: p.id, kind: "payment", charge_kind: null, date: p.received_at.slice(0, 10), unit_code: null, payer: p.payer_id ? nameOf(p.payer_id) : p.depositor_name, payer_id: p.payer_id, lease_id: null, label: `${p.method === "bank" ? `계좌 입금 · ${p.depositor_name}` : p.memo || "직접 기록"}${fee}${pass}`, amount: p.amount, supply: null, vat: null, invoice_no: null, cancelled: p.status === "skipped", status: p.status });
    }
    const chargeById = new Map(db.charges.map((c) => [c.id, c]));
    for (const a of db.allocations) {
      if (ym(a.at.slice(0, 10)) !== m) continue;
      const c = chargeById.get(a.charge_id);
      const p = payById.get(a.payment_id);
      if (!c || !inBranch(b)(c)) continue;
      rows.push({ entry: a.id, kind: "allocation", charge_kind: c.kind, date: a.at.slice(0, 10), unit_code: unitCodeOf(ix, c.lease_id), payer: nameOf(c.payer_id), payer_id: c.payer_id, lease_id: c.lease_id, label: `${c.label} ← ${p?.depositor_name ?? "입금"}`, amount: a.amount, supply: null, vat: null, invoice_no: c.invoice_no, cancelled: false, status: "allocated" });
    }
    for (const s of db.settlements) {
      if (s.status !== "refunded" || !s.refunded_at || ym(s.refunded_at.slice(0, 10)) !== m) continue;
      const l = ix.lease.get(s.lease_id);
      if (!l || !inBranch(b)(l)) continue;
      rows.push({ entry: s.id, kind: "refund", charge_kind: null, date: s.refunded_at.slice(0, 10), unit_code: ix.unit.get(l.unit_id)?.code ?? null, payer: nameOf(l.contractor_id), payer_id: l.contractor_id, lease_id: l.id, label: "보증금 반환", amount: s.refund_amount, supply: null, vat: null, invoice_no: null, cancelled: false, status: "refunded" });
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
      // 할인은 월세 매출에서 뺀 금액으로 본다(revenueOf 에서 rent 칸에 음수로 들어감)
      const discount = db.charges
        .filter((c) => c.branch_id === br.id && c.kind === "discount" && isBilled(c) && ym(c.period_from ?? c.due_date) === m)
        .reduce((s, c) => s + c.supply, 0);
      return {
        branch_id: br.id,
        name: br.name,
        term: br.commission,
        by_kind: { rent: Math.round(r.rent), mgmt: Math.round(r.mgmt), usage: Math.round(r.usage), other: Math.round(r.other) },
        discount: Math.round(discount),
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
        discount: perBranch.reduce((s, x) => s + x.discount, 0),
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

  // 달별 청구서 목록 ──────────────────────────────────────────
  route("GET /api/billing", ({ query }) => {
    const db = getDB();
    flush(db);
    const ix = indexDB(db);
    const m = monthParam(query.get("month"), today());
    return monthGroups(db, ix, query.get("branch_id"), m);
  }),
];
