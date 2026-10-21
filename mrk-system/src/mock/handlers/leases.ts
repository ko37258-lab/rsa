/**
 * 계약 · 정산 API (원본 /api/leases…)
 * 청구 방식(주기·선불/후불·일할·할인·관리비 고지서)과 첫 청구 미리 보기(/api/billing/preview)도 여기서 맡는다.
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import { indexDB, inBranch, leaseMoney, depositHeldChain, chargePaid, isBilled, leaseLastDay, partyCard } from "../logic";
import { scheduleLines } from "../schedule";
import { logHistory } from "./common";
import { LEASE_FLOW, OPEN_LEASE, LEASE_STATUS } from "@/lib/codes";
import { daysBetween, plusDays, ym } from "@/lib/dates";
import type { Conversation, Deduction, FileRef, Lease, LeaseStatus, Message, Settlement, Unit, VatMode } from "@/types";
import { leaseRow, newCharge, num, settlementUnpaid, draftSettlement, settleWithDeposit, vatSplit } from "./finance-shared";
import {
  billingSummary, chainBack, createScheduleCharges, exceedsCap, leaseParties, makeParty, previewLease, readBillingFields, renewalOf, rentCapFor, rentRoll,
} from "./leases-helpers";

const EDITABLE: LeaseStatus[] = ["draft", "awaiting_signature", "concluded", "move_in_confirmed"];

function termsOf(branchId: string | null | undefined) {
  const db = getDB();
  const b = (branchId && branchId !== "all" ? db.branches.find((x) => x.id === branchId) : undefined) ?? db.branches[0];
  return must(b, "지점").terms;
}

/** 같은 호실에 기간이 겹치는 계약(취소 빼고) */
function overlapping(db: ReturnType<typeof getDB>, unitId: string, start: string, end: string, exceptId?: string): Lease | undefined {
  return db.leases.find((l) => l.unit_id === unitId && l.id !== exceptId && l.status !== "cancelled" && start <= leaseLastDay(l) && end >= l.start_date);
}

/** 재계약으로 넘길 수 있나: 거주 중이고, 체결된 재계약의 시작일이 왔다 */
function canHandOver(l: Lease, renewal: Lease | undefined, t: string): boolean {
  return l.status === "occupied" && !!renewal && ["concluded", "move_in_confirmed", "occupied"].includes(renewal.status) && renewal.start_date <= t;
}

function ensureCopies(l: Lease): FileRef[] {
  l.signed_copies ??= [];
  return l.signed_copies;
}

export const leasesRoutes: Route[] = [
  // ── 지점 조건 · 청구 방식 ─────────────────────────────────
  route("GET /api/leases/branch-terms", ({ query }) => {
    const db = getDB();
    const bid = query.get("branch_id");
    const b = (bid && bid !== "all" ? db.branches.find((x) => x.id === bid) : undefined) ?? db.branches[0];
    must(b, "지점");
    return { branch_id: b.id, branch_name: b.name, ...b.terms };
  }),

  route("GET /api/leases/amount-methods", () => ({
    cycle: [
      { value: "anniversary", label: "입주일 기준", hint: "입주일부터 한 달씩 끊어 매월 같은 날 청구한다" },
      { value: "calendar", label: "달력 월 · 청구일", hint: "달력 월로 끊고 정한 청구일에 청구한다. 그 달에 없는 날이면 말일" },
    ],
    billing_mode: [
      { value: "prepaid", label: "선불", hint: "그 달치를 직전 청구일에 청구한다" },
      { value: "postpaid", label: "후불", hint: "지난 달치를 다음 청구일에 청구한다" },
    ],
    mgmt_mode: [
      { value: "fixed", label: "고정", hint: "계약 금액을 월세와 같이 청구한다" },
      { value: "bill", label: "고지서", hint: "고지서 금액이 오면 넣는다. 고지서 청구는 늘 후불" },
    ],
    prorate: [
      { value: true, label: "일할", hint: "첫 달·마지막 달은 그 달 실제 일수로 나눈다" },
      { value: false, label: "일할 안 함", hint: "한 달 치를 다 받는다" },
    ],
    due_days: { label: "납기 일수", hint: "청구일부터 며칠 안에 내는지. 0 이면 청구일이 납기" },
  })),

  /** 첫 청구 미리 보기 — 계약 작성 화면에서 금액·방식을 바꿀 때마다 부른다 */
  route("POST /api/billing/preview", ({ body }) => {
    const b = body ?? {};
    const t = termsOf(b.branch_id as string | undefined);
    const l = previewLease(b, t);
    const lines = scheduleLines(l).map((x) => ({ ...x, ...(() => {
      const v = vatSplit(x.amount, l.vat);
      return { amount_with_vat: v.amount, vat_amount: v.vat_amount };
    })() }));
    const firstBill = lines.reduce<string | null>((m, x) => (m === null || x.bill_date < m ? x.bill_date : m), null);
    const totals = { rent: 0, mgmt: 0, discount: 0 };
    for (const x of lines) totals[x.kind] += x.amount;
    const firstLines = lines.filter((x) => x.bill_date === firstBill);
    return {
      lines,
      first_bill_date: firstBill,
      first_bill_total: firstLines.reduce((s, x) => s + x.amount_with_vat, 0),
      totals,
      summary: billingSummary(l),
      needs_amount: lines.some((x) => x.needs_amount),
    };
  }),

  // ── 목록 · 렌트롤 · 퇴실 ───────────────────────────────────
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
        const renewal = renewalOf(db, l);
        let stage: "upcoming" | "settling" | "refund_wait" | "refunded" | null = null;
        if (l.status === "occupied" && !renewal && daysBetween(t, l.end_date) <= 30) stage = "upcoming";
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
          renewal_id: renewal?.id ?? null,
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
      .filter((l) => !partyId || l.contractor_id === partyId || l.payer_id === partyId || l.occupant_ids.includes(partyId))
      .filter((l) => !inquiryId || l.inquiry_id === inquiryId || (inq?.lease_ids ?? []).includes(l.id))
      .map((l) => leaseRow(db, ix, l, t))
      .filter((r) => {
        if (!q) return true;
        const hay = [r.unit_code, r.contractor?.name, r.contractor?.phone, r.contractor?.email, r.payer?.name].join(" ").toLowerCase();
        return hay.includes(q) || hay.replace(/-/g, "").includes(q.replace(/-/g, ""));
      })
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
  }),

  // ── 상세 ─────────────────────────────────────────────────
  route("GET /api/leases/:id/rent-cap", ({ params, query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const l = must(ix.lease.get(params.id), "계약");
    // :id 가 이미 재계약이면 그 앞 계약 기준, 아니면 이 계약을 연장할 때 기준
    const asRenewal = !!l.renewal_of && !query.get("start");
    const prev = asRenewal ? ix.lease.get(l.renewal_of as string) : l;
    if (!prev) return null;
    const start = asRenewal ? l.start_date : query.get("start") || plusDays(prev.end_date, 1);
    const cap = rentCapFor(ix, prev, start);
    const rent = query.get("rent") !== null ? num(query.get("rent")) : asRenewal ? l.rent : null;
    return cap ? { ...cap, rent, exceeds: rent !== null ? exceedsCap(cap, rent) : false, chain: chainBack(ix, prev).map((x) => ({ id: x.id, start_date: x.start_date, end_date: x.end_date, rent: x.rent })) } : null;
  }),

  route("GET /api/leases/:id/settlement/refund-account", ({ params }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const c = db.parties.find((p) => p.id === l.contractor_id);
    const st = db.settlements.find((s) => s.lease_id === l.id);
    const account = st?.refund_account || c?.bank_account || "";
    return { account, holder: c?.name ?? "", source: st?.refund_account ? "settlement" : c?.bank_account ? "contractor" : "none", contractor_account: c?.bank_account ?? null };
  }),

  route("PUT /api/leases/:id/settlement/refund-account", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const account = String(body?.account ?? "").trim();
    if (!account) throw new HttpError(400, "반환 계좌를 적는다");
    const c = must(db.parties.find((p) => p.id === l.contractor_id), "계약자");
    if (body?.save_to_contractor !== false) c.bank_account = account;
    const st = db.settlements.find((s) => s.lease_id === l.id);
    if (st && st.status !== "refunded") st.refund_account = account;
    logHistory("lease", l.id, "반환 계좌 변경");
    return { account, holder: c.name };
  }),

  route("GET /api/leases/:id/signed-copies", ({ params }) => {
    const l = must(getDB().leases.find((x) => x.id === params.id), "계약");
    return ensureCopies(l);
  }),

  route("POST /api/leases/:id/signed-copies", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const f = body?.file as FileRef | undefined;
    if (!f || !f.id || !f.name) throw new HttpError(400, "올릴 파일을 고른다");
    const ref: FileRef = { id: String(f.id), name: String(f.name), size: num(f.size), mime: String(f.mime || "application/octet-stream"), kind: "signed_copy", created_at: f.created_at || nowIso() };
    ensureCopies(l).push(ref);
    logHistory("lease", l.id, `서명본 올림 · ${ref.name}`);
    return ref;
  }),

  route("DELETE /api/leases/:id/signed-copies/:fileId", ({ params }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const list = ensureCopies(l);
    const i = list.findIndex((f) => f.id === params.fileId);
    if (i < 0) throw new HttpError(404, "서명본을 찾지 못했다");
    const [gone] = list.splice(i, 1);
    logHistory("lease", l.id, `서명본 지움 · ${gone.name}`);
    return { ok: true };
  }),

  route("GET /api/leases/:id/parties", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const l = must(ix.lease.get(params.id), "계약");
    return leaseParties(ix, l);
  }),

  route("POST /api/leases/:id/parties", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    let pid: string | undefined = body?.party_id || undefined;
    if (!pid && body?.new) pid = makeParty(db, l.branch_id, body.new, "입주자 이름").id;
    if (!pid) throw new HttpError(400, "입주자를 고르거나 새로 적는다");
    const p = must(db.parties.find((x) => x.id === pid), "고객");
    if (p.id === l.contractor_id || l.occupant_ids.includes(p.id)) throw new HttpError(409, `${p.name}은(는) 이미 이 계약에 있다`);
    l.occupant_ids = [...l.occupant_ids, p.id];
    logHistory("lease", l.id, `입주자 추가 · ${p.name}`);
    return partyCard(p);
  }),

  route("DELETE /api/leases/:id/parties/:partyId", ({ params }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    if (!l.occupant_ids.includes(params.partyId)) throw new HttpError(409, "계약자·납부자는 뺄 수 없다. 입주자만 뺀다");
    l.occupant_ids = l.occupant_ids.filter((x) => x !== params.partyId);
    logHistory("lease", l.id, `입주자 뺌 · ${db.parties.find((p) => p.id === params.partyId)?.name ?? ""}`);
    return { ok: true };
  }),

  route("GET /api/leases/:id/conversations", ({ params }) => {
    const db = getDB();
    must(db.leases.find((x) => x.id === params.id), "계약");
    return db.conversations.filter((c) => c.lease_id === params.id).sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at));
  }),

  route("POST /api/leases/:id/conversations", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const text = String(body?.body ?? "").trim();
    if (!text) throw new HttpError(400, "내용을 적는다");
    const direction: Message["direction"] = body?.direction === "inbound" || body?.direction === "note" ? body.direction : "outbound";
    const via = (["phone", "visit", "email", "web", "kakao", "platform"] as const).includes(body?.via) ? body.via : "kakao";
    const now = nowIso();
    const contractor = db.parties.find((p) => p.id === l.contractor_id);
    const subject = String(body?.subject ?? "").trim() || null;
    const msg: Message = { id: newId("m"), direction, body: text, at: now, author: direction === "inbound" ? contractor?.name ?? "입주자" : db.me.name, via, subject, attachments: Array.isArray(body?.attachments) ? body.attachments : [] };
    // 같은 계약의 열린 대화(대화 묶음)를 쓰거나 새로 연다
    let conv: Conversation | undefined = body?.conversation_id ? db.conversations.find((c) => c.id === body.conversation_id && c.lease_id === l.id) : undefined;
    conv ??= db.conversations.filter((c) => c.lease_id === l.id && c.channel === via).sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))[0];
    if (!conv) {
      conv = {
        id: newId("cv"),
        branch_id: l.branch_id,
        inquiry_id: null,
        lease_id: l.id,
        channel: via,
        from_name: contractor?.name ?? "",
        from_contact: via === "email" ? contractor?.email ?? "" : contractor?.phone ?? "",
        subject: subject ?? text.slice(0, 40),
        messages: [],
        created_at: now,
        last_activity_at: now,
      };
      db.conversations.push(conv);
    }
    conv.messages.push(msg);
    conv.last_activity_at = now;
    return conv;
  }),

  route("GET /api/leases/:id", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const l = must(ix.lease.get(params.id), "계약");
    const unit = ix.unit.get(l.unit_id) ?? null;
    const branch = db.branches.find((b) => b.id === l.branch_id) ?? null;
    const prev = l.renewal_of ? ix.lease.get(l.renewal_of) : undefined;
    const renewal = renewalOf(db, l);
    const next = db.leases.find((x) => x.unit_id === l.unit_id && x.status !== "cancelled" && x.start_date > l.start_date && x.id !== l.id && x.start_date <= plusDays(leaseLastDay(l), 120));
    const flow = [...(LEASE_FLOW[l.status] ?? [])];
    // 재계약으로 이어진 거주 중 계약은 퇴실·정산 없이 바로 끝낸다(보증금은 재계약으로 넘어간다)
    if (canHandOver(l, renewal, t)) flow.unshift({ to: "closed", label: "재계약으로 넘기기" });
    return {
      ...leaseRow(db, ix, l, t),
      unit,
      unit_type: unit?.unit_type_id ? ix.type.get(unit.unit_type_id) ?? null : null,
      branch: branch ? { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone, email: branch.email, bank_account: branch.bank_account, accounts: branch.accounts } : null,
      building: unit ? db.buildings.find((b) => b.id === unit.building_id) ?? null : null,
      renewal_of_lease: prev ? leaseRow(db, ix, prev, t) : null,
      renewal_lease: renewal ? leaseRow(db, ix, renewal, t) : null,
      next_lease: next ? leaseRow(db, ix, next, t) : null,
      rent_cap: prev ? (() => {
        const cap = rentCapFor(ix, prev, l.start_date);
        return cap ? { ...cap, rent: l.rent, exceeds: exceedsCap(cap, l.rent) } : null;
      })() : null,
      inquiry: l.inquiry_id ? (({ id, stage, created_at, source_group, source_detail }) => ({ id, stage, created_at, source_group, source_detail }))(must(db.inquiries.find((x) => x.id === l.inquiry_id), "상담")) : null,
      settlement: db.settlements.find((s) => s.lease_id === l.id) ?? null,
      assignee: db.staff.find((s) => s.id === l.assignee_id) ?? null,
      flow,
      billing_summary: billingSummary(l),
      parties: leaseParties(ix, l),
      company_name: db.company_name,
      terms: branch?.terms ?? null,
    };
  }),

  // ── 작성 · 수정 · 상태 ────────────────────────────────────
  route("POST /api/leases", ({ body }) => {
    const db = getDB();
    const ix = indexDB(db);
    const b = body ?? {};
    const prev = b.renewal_of ? must(ix.lease.get(String(b.renewal_of)), "앞 계약") : undefined;
    const unit: Unit = must(db.units.find((u) => u.id === (b.unit_id || prev?.unit_id)), "호실");
    const start = String(b.start_date ?? (prev ? plusDays(prev.end_date, 1) : ""));
    const end = String(b.end_date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new HttpError(400, "시작일과 만료일을 고른다");
    if (end < start) throw new HttpError(400, "만료일이 시작일보다 앞이다");
    const rent = num(b.rent);
    if (rent <= 0) throw new HttpError(400, "월세를 적는다");
    if (prev) {
      if (prev.unit_id !== unit.id) throw new HttpError(400, "재계약은 같은 호실로만 한다");
      if (renewalOf(db, prev)) throw new HttpError(409, "이 계약은 이미 재계약이 있다");
      if (start <= prev.start_date) throw new HttpError(400, "재계약 시작일이 앞 계약 시작일보다 뒤여야 한다");
    }
    const clash = overlapping(db, unit.id, start, end, prev?.id);
    if (clash) throw new HttpError(409, `${unit.code}호는 ${clash.start_date} ~ ${leaseLastDay(clash)} 에 다른 계약(${LEASE_STATUS[clash.status].label})이 있어 기간이 겹친다`);
    // 재계약 인상 상한(주택임대차보호법 5%) — 넘기면 사유가 있어야 저장
    const cap = prev ? rentCapFor(ix, prev, start) : null;
    const capReason = String(b.cap_reason ?? "").trim();
    if (cap && exceedsCap(cap, rent) && !capReason) throw new HttpError(409, `${cap.text}. 월세 ${rent.toLocaleString("ko-KR")}원은 상한을 넘는다. 넘기는 사유를 적는다`);

    const inquiry = b.inquiry_id ? must(db.inquiries.find((q) => q.id === b.inquiry_id), "상담") : undefined;
    let contractorId: string | undefined = b.contractor_id || undefined;
    if (!contractorId && b.contractor_new) contractorId = makeParty(db, unit.branch_id, b.contractor_new, "계약자 이름").id;
    if (!contractorId && inquiry) contractorId = inquiry.party_id;
    if (!contractorId && prev) contractorId = prev.contractor_id;
    if (!contractorId) throw new HttpError(400, "계약자를 고르거나 새로 적는다");
    must(db.parties.find((p) => p.id === contractorId), "계약자");
    const payerId = b.payer_id || (prev && prev.payer_id !== prev.contractor_id ? prev.payer_id : contractorId);
    must(db.parties.find((p) => p.id === payerId), "납부자");
    const occupants: string[] = [];
    for (const id of Array.isArray(b.occupant_ids) ? b.occupant_ids : prev?.occupant_ids ?? []) if (db.parties.some((p) => p.id === id) && id !== contractorId && !occupants.includes(id)) occupants.push(String(id));
    for (const n of Array.isArray(b.occupants_new) ? b.occupants_new : []) if (String(n?.name ?? "").trim()) occupants.push(makeParty(db, unit.branch_id, n, "입주자 이름").id);

    const type = unit.unit_type_id ? db.unit_types.find((x) => x.id === unit.unit_type_id) : undefined;
    const terms = must(db.branches.find((x) => x.id === unit.branch_id), "지점").terms;
    const base = prev ?? null;
    const billing = readBillingFields(b, base ? { cycle: base.cycle, billing_mode: base.billing_mode, prorate: base.prorate, due_days: base.due_days, mgmt_mode: base.mgmt_mode, bill_day: base.cycle === "calendar" ? base.due_day : terms.bill_day } : terms, start);
    const status: LeaseStatus = b.status === "awaiting_signature" ? "awaiting_signature" : "draft";
    const vat: VatMode = b.vat === "included" || b.vat === "excluded" || b.vat === "none" ? b.vat : base?.vat ?? terms.vat;
    const memo = [String(b.memo ?? "").trim(), cap && exceedsCap(cap, rent) ? `인상 상한 초과 사유: ${capReason}` : ""].filter(Boolean).join("\n");
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
      move_in_date: prev ? start : null,
      move_out_date: null,
      // 재계약은 보증금을 이어받는다(같은 약정 금액, 새로 받지 않음)
      deposit: prev ? prev.deposit : num(b.deposit),
      mgmt_deposit: prev ? prev.mgmt_deposit : num(b.mgmt_deposit),
      prepaid_rent: num(b.prepaid_rent),
      contract_fee: prev ? 0 : num(b.contract_fee),
      rent,
      list_rent: type?.list_rent ?? rent,
      mgmt_fee: num(b.mgmt_fee),
      cleaning_fee: b.cleaning_fee !== undefined ? num(b.cleaning_fee) : prev?.cleaning_fee ?? 0,
      vat,
      source_group: String(b.source_group || inquiry?.source_group || (prev ? "기타" : "기타")),
      assignee_id: b.assignee_id || prev?.assignee_id || db.me.id,
      created_at: nowIso(),
      signed_at: null,
      closed_at: null,
      renewal_of: prev?.id ?? null,
      memo,
      ...billing,
      occupant_ids: occupants,
      signed_copies: [],
    };
    db.leases.push(lease);
    logHistory("lease", lease.id, `${prev ? "재계약" : "계약"} 작성${status === "awaiting_signature" ? " · 서명 요청" : ""}`);
    if (prev) logHistory("lease", prev.id, `재계약 작성 · ${start}부터 월 ${rent.toLocaleString("ko-KR")}원`);
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
    const changed: string[] = [];
    // 메모·담당·납부자는 언제나, 돈·기간·청구 방식은 입주 전까지만 고친다
    if (b.memo !== undefined) l.memo = String(b.memo);
    if (b.assignee_id !== undefined) l.assignee_id = b.assignee_id || null;
    if (b.payer_id && b.payer_id !== l.payer_id) {
      const payer = must(db.parties.find((p) => p.id === b.payer_id), "납부자");
      l.payer_id = payer.id;
      // 아직 안 보낸 청구는 새 납부자에게 간다
      for (const c of db.charges) if (c.lease_id === l.id && c.status === "draft") c.payer_id = payer.id;
      changed.push(`납부자 → ${payer.name}`);
    }
    const moneyKeys = ["deposit", "mgmt_deposit", "prepaid_rent", "contract_fee", "rent", "mgmt_fee", "cleaning_fee"] as const;
    const billingKeys = ["cycle", "billing_mode", "prorate", "due_days", "bill_day", "mgmt_mode", "discounts"];
    const touchesTerms = moneyKeys.some((k) => b[k] !== undefined) || b.start_date !== undefined || b.end_date !== undefined || b.vat !== undefined || billingKeys.some((k) => b[k] !== undefined);
    if (touchesTerms) {
      if (!EDITABLE.includes(l.status)) throw new HttpError(409, `${LEASE_STATUS[l.status].label} 계약은 금액·기간·청구 방식을 고칠 수 없다. 재계약이나 직접 청구로 처리한다`);
      const start = b.start_date ?? l.start_date;
      const end = b.end_date ?? l.end_date;
      if (end < start) throw new HttpError(400, "만료일이 시작일보다 앞이다");
      const clash = overlapping(db, l.unit_id, start, end, l.id);
      if (clash && clash.id !== l.renewal_of) throw new HttpError(409, `${clash.start_date} ~ ${leaseLastDay(clash)} 의 다른 계약과 기간이 겹친다`);
      l.start_date = start;
      l.end_date = end;
      for (const k of moneyKeys) if (b[k] !== undefined) l[k] = num(b[k]);
      if (b.vat === "none" || b.vat === "included" || b.vat === "excluded") l.vat = b.vat;
      const terms = db.branches.find((x) => x.id === l.branch_id)?.terms;
      Object.assign(
        l,
        readBillingFields(b, { cycle: l.cycle, billing_mode: l.billing_mode, prorate: l.prorate, due_days: l.due_days, mgmt_mode: l.mgmt_mode, bill_day: l.cycle === "calendar" ? l.due_day : terms?.bill_day ?? 1, discounts: l.discounts }, l.start_date),
      );
      changed.push("계약 내용");
    }
    if (b.move_in_date !== undefined) l.move_in_date = b.move_in_date || null;
    if (b.source_group !== undefined) l.source_group = String(b.source_group);
    logHistory("lease", l.id, changed.length ? `${changed.join(" · ")} 수정` : "계약 메모·담당 수정");
    return l;
  }),

  route("POST /api/leases/:id/transition", ({ params, body }) => {
    const db = getDB();
    const l = must(db.leases.find((x) => x.id === params.id), "계약");
    const to = body?.to as LeaseStatus;
    const renewal = renewalOf(db, l);
    const viaRenewal = to === "closed" && canHandOver(l, renewal, today());
    const allowed = viaRenewal || (LEASE_FLOW[l.status] ?? []).some((f) => f.to === to);
    if (!allowed) throw new HttpError(409, `${LEASE_STATUS[l.status].label} 계약은 ${LEASE_STATUS[to]?.label ?? to}(으)로 바꿀 수 없다`);
    const t = today();
    const date: string | undefined = body?.date || undefined;
    const inquiry = l.inquiry_id ? db.inquiries.find((q) => q.id === l.inquiry_id) : undefined;

    if (to === "awaiting_signature") {
      if (inquiry && inquiry.stage !== "concluded") inquiry.stage = "signing";
    } else if (to === "concluded") {
      l.signed_at = nowIso();
      // 계약금·잔금과 이번 달까지 청구일이 오는 월세·관리비·할인은 모두 「발송 대기」로 — 청구 화면에서 확인·발송한다
      if (!l.renewal_of) {
        const has = (k: string) => db.charges.some((c) => c.lease_id === l.id && c.kind === k && c.status !== "cancelled");
        if (l.contract_fee > 0 && !has("contract_fee")) db.charges.push(newCharge(l, "contract_fee", "계약금", l.contract_fee, t, { status: "draft" }));
        const balance = l.deposit + l.mgmt_deposit - l.contract_fee;
        const due = plusDays(l.start_date, -1) > t ? plusDays(l.start_date, -1) : t;
        if (balance > 0 && !has("deposit")) db.charges.push(newCharge(l, "deposit", "보증금 잔금", balance, due, { status: "draft" }));
      }
      if (l.prepaid_rent > 0 && !db.charges.some((c) => c.lease_id === l.id && c.kind === "prepaid_rent" && c.status !== "cancelled"))
        db.charges.push(newCharge(l, "prepaid_rent", "선납임대료", l.prepaid_rent, plusDays(l.start_date, -1) > t ? plusDays(l.start_date, -1) : t, { status: "draft" }));
      createScheduleCharges(db, l, ym(t));
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
      // 퇴실 뒤 기간의 아직 안 보낸 청구는 취소
      for (const c of db.charges) if (c.lease_id === l.id && c.status === "draft" && c.period_from && c.period_from > out) c.status = "cancelled";
    } else if (to === "closed") {
      if (!viaRenewal) {
        const st = db.settlements.find((s) => s.lease_id === l.id);
        if (!st || (st.status !== "confirmed" && st.status !== "refunded")) throw new HttpError(409, "정산을 먼저 확정한다(정산 탭에서 보증금 반환 금액을 확정)");
      } else if (renewal) {
        for (const c of db.charges) if (c.lease_id === l.id && c.status === "draft" && c.period_from && c.period_from > l.end_date) c.status = "cancelled";
        // 같은 사람이 계속 사니 재계약은 바로 거주 중으로
        if (renewal.status === "concluded" || renewal.status === "move_in_confirmed") {
          renewal.move_in_date = renewal.move_in_date ?? renewal.start_date;
          logHistory("lease", renewal.id, `${LEASE_STATUS[renewal.status].label} → ${LEASE_STATUS.occupied.label} · 앞 계약에서 이어 거주`);
          renewal.status = "occupied";
        }
      }
      l.closed_at = nowIso();
    } else if (to === "cancelled") {
      l.closed_at = nowIso();
      for (const c of db.charges) if (c.lease_id === l.id && c.status === "draft") c.status = "cancelled";
      db.blocks = db.blocks.filter((k) => !(k.kind === "hold" && k.unit_id === l.unit_id && k.inquiry_id === l.inquiry_id));
    }
    const from = l.status;
    l.status = to;
    logHistory("lease", l.id, `${LEASE_STATUS[from].label} → ${LEASE_STATUS[to].label}${viaRenewal ? " · 재계약으로 넘김" : ""}${body?.reason ? ` · ${body.reason}` : ""}`);
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
      totals: {
        billed: m.billed,
        paid: m.paid,
        overdue: m.overdue,
        upcoming: m.upcoming,
        deposit_held: depositHeldChain(ix, l),
        draft: charges.filter((c) => c.status === "draft").reduce((s, c) => s + c.amount, 0),
        needs_amount: charges.filter((c) => c.status === "draft" && c.needs_amount).length,
      },
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
    if (body?.save_account && st.refund_account.trim()) {
      const c = db.parties.find((p) => p.id === l.contractor_id);
      if (c) c.bank_account = st.refund_account.trim();
    }
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
