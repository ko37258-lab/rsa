/**
 * 청구 · 수납 · 장부 API (원본 /api/billing…)
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import {
  indexDB, inBranch, partyCard, payerBalances, chargePaid, 
  
} from "../logic";
import { logHistory } from "./common";
import { CHARGE_KIND, } from "@/lib/codes";
import { ym, plusMonth } from "@/lib/dates";
import type {
  Charge, ChargeKind, Payment, VatMode,
} from "@/types";
import { monthParam, newCharge, invoiceNo, ensurePeriodCharges, allocatedOf, allocateFIFO, num, revenueOf, commission } from "./finance-shared";

export const billingRoutes: Route[] = [
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
      account_id: null,
      platform_fee: 0,
      pass_through: 0,
      pass_through_reason: null,
      bank_row: null,
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
