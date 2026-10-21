/**
 * 계약 · 정산 API (원본 /api/leases…)
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import {
  indexDB, inBranch, leaseMoney, depositHeldChain, chargePaid, isBilled, leaseLastDay,
  
} from "../logic";
import { logHistory } from "./common";
import { LEASE_FLOW, OPEN_LEASE, LEASE_STATUS } from "@/lib/codes";
import { daysBetween, plusDays, ym, plusMonth } from "@/lib/dates";
import type {
  Deduction, Lease, LeaseStatus, Settlement, Unit, VatMode,
} from "@/types";
import { leaseRow, newCharge, ensurePeriodCharges, newParty, overlapping, num, settlementUnpaid, draftSettlement, settleWithDeposit, rentRoll } from "./finance-shared";

export const leasesRoutes: Route[] = [
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
    const terms = must(db.branches.find((x) => x.id === unit.branch_id), "지점").terms;
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
      due_day: (b.cycle ?? terms.cycle) === "calendar" ? terms.bill_day : Number(start.slice(8, 10)),
      vat,
      source_group: String(b.source_group || inquiry?.source_group || "기타"),
      assignee_id: b.assignee_id || db.me.id,
      created_at: nowIso(),
      signed_at: null,
      closed_at: null,
      renewal_of: b.renewal_of || null,
      memo: String(b.memo ?? ""),
      cycle: b.cycle === "calendar" || b.cycle === "anniversary" ? b.cycle : terms.cycle,
      billing_mode: b.billing_mode === "postpaid" || b.billing_mode === "prepaid" ? b.billing_mode : terms.billing_mode,
      prorate: typeof b.prorate === "boolean" ? b.prorate : terms.prorate,
      due_days: b.due_days !== undefined ? num(b.due_days) : terms.due_days,
      mgmt_mode: b.mgmt_mode === "bill" || b.mgmt_mode === "fixed" ? b.mgmt_mode : terms.mgmt_mode,
      discounts: Array.isArray(b.discounts) ? b.discounts : [],
      occupant_ids: Array.isArray(b.occupant_ids) ? b.occupant_ids : [],
      signed_copies: [],
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
];
