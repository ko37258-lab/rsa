/**
 * 영업 영역 API: 호실 · 일정 블록 · 달력 · 상담(문의) · 고객.
 * 경로와 응답 모양은 원본 홈즈 PMS 와 맞춘다. 응답 타입은 각 화면의 model.ts 에 있다.
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import { indexDB, inBranch, partyCard, unitToday, leaseLastDay, type Index } from "../logic";
import { logHistory } from "./common";
import { INQUIRY_STAGE } from "@/lib/codes";
import { overlapDays, plusDays, plusMonths } from "@/lib/dates";
import type { DB, Inquiry, InquiryStage, Lease, Message, Party, Tour, Unit, UnitBlock } from "@/types";
import type { CalendarData, CalendarSegment, UnitDetail, UnitRow } from "@/pages/units/model";
import type { InquiryDetail, InquiryLeaseSummary, InquiryRow, PartyMatch, UnitMatch } from "@/pages/inquiries/model";
import type { CustomerDetail, CustomerRole, CustomerRow, CustomerStage } from "@/pages/customers/model";

// ── 공통 도우미 ───────────────────────────────────────────

const branchName = (db: DB, id: string | null) => (id ? db.branches.find((b) => b.id === id)?.name ?? null : null);
const staffName = (db: DB, id: string | null) => (id ? db.staff.find((s) => s.id === id)?.name ?? null : null);
const live = (l: Lease) => l.status !== "cancelled" && l.status !== "draft";
const digits = (s: string) => s.replace(/\D/g, "");

/** 호실이 [from,to] 내내 비어 판매할 수 있나 */
function freeFor(db: DB, ix: Index, u: Unit, from: string, to: string): boolean {
  if (u.sale_status !== "on_sale") return false;
  const leases = (ix.leasesByUnit.get(u.id) ?? []).filter(live);
  if (leases.some((l) => overlapDays(l.start_date, leaseLastDay(l), from, to) > 0)) return false;
  return !db.blocks.some((b) => b.unit_id === u.id && b.kind === "suspend" && overlapDays(b.from, b.until ?? "9999-12-31", from, to) > 0);
}

function unitRow(db: DB, ix: Index, u: Unit, t: string, period?: { from: string; to: string }): UnitRow {
  const s = unitToday(db, ix, u, t);
  const name = (pid: string) => ix.party.get(pid)?.name ?? "—";
  return {
    ...u,
    type_name: u.unit_type_id ? ix.type.get(u.unit_type_id)?.name ?? null : null,
    building_name: db.buildings.find((b) => b.id === u.building_id)?.name ?? null,
    branch_name: branchName(db, u.branch_id) ?? "",
    today: { state: s.state, free_from: s.free_from, free_until: s.free_until, block: s.block },
    current: s.lease ? { lease_id: s.lease.id, contractor_name: name(s.lease.contractor_id), start_date: s.lease.start_date, end_date: leaseLastDay(s.lease), status: s.lease.status } : null,
    next: s.next_lease ? { lease_id: s.next_lease.id, contractor_name: name(s.next_lease.contractor_id), start_date: s.next_lease.start_date, status: s.next_lease.status } : null,
    ...(period ? { fits: freeFor(db, ix, u, period.from, period.to) } : {}),
  };
}

function unitSort(a: Unit, b: Unit): number {
  return a.branch_id.localeCompare(b.branch_id) || (a.floor ?? 0) - (b.floor ?? 0) || a.code.localeCompare(b.code, "ko", { numeric: true });
}

function isAwaiting(q: Inquiry): boolean {
  if (q.closed_at) return false;
  const last = [...q.messages].reverse().find((m) => m.direction !== "note");
  return !!last && last.direction === "inbound";
}

function inquiryRow(db: DB, ix: Index, q: Inquiry, now: number): InquiryRow {
  const { messages, ...rest } = q;
  const party = ix.party.get(q.party_id);
  const awaiting = isAwaiting(q);
  const lastInbound = awaiting ? [...messages].reverse().find((m) => m.direction === "inbound") : null;
  const lastMsg = [...messages].reverse().find((m) => m.direction !== "note");
  return {
    ...rest,
    party: party ? { ...partyCard(party)!, contact_name: party.contact_name } : null,
    assignee_name: staffName(db, q.assignee_id),
    branch_name: branchName(db, q.branch_id),
    awaiting,
    awaiting_minutes: lastInbound ? Math.max(0, Math.round((now - new Date(lastInbound.at).getTime()) / 60000)) : null,
    message_count: messages.length,
    last_message: lastMsg ? lastMsg.body.slice(0, 80) : null,
    unit_code: q.unit_id ? ix.unit.get(q.unit_id)?.code ?? null : null,
  };
}

function leaseSummaryForInquiry(db: DB, ix: Index, q: Inquiry): InquiryLeaseSummary[] {
  return db.leases
    .filter((l) => l.inquiry_id === q.id || q.lease_ids.includes(l.id))
    .map((l) => ({ id: l.id, status: l.status, unit_id: l.unit_id, unit_code: ix.unit.get(l.unit_id)?.code ?? "—", start_date: l.start_date, end_date: l.end_date, rent: l.rent }));
}

function findInquiry(db: DB, id: string): Inquiry {
  return must(db.inquiries.find((q) => q.id === id), "상담");
}

// ── 고객 단계 계산 ─────────────────────────────────────────

interface PartyLinks {
  asContractor: Lease[];
  asPayer: Lease[];
  inquiries: Inquiry[];
  branches: Set<string>;
}

function partyLinks(db: DB): Map<string, PartyLinks> {
  const m = new Map<string, PartyLinks>();
  const get = (pid: string) => {
    let x = m.get(pid);
    if (!x) {
      x = { asContractor: [], asPayer: [], inquiries: [], branches: new Set() };
      m.set(pid, x);
    }
    return x;
  };
  for (const l of db.leases) {
    const c = get(l.contractor_id);
    c.asContractor.push(l);
    c.branches.add(l.branch_id);
    if (l.payer_id !== l.contractor_id) {
      const p = get(l.payer_id);
      p.asPayer.push(l);
      p.branches.add(l.branch_id);
    }
  }
  for (const q of db.inquiries) {
    const x = get(q.party_id);
    x.inquiries.push(q);
    if (q.branch_id) x.branches.add(q.branch_id);
  }
  return m;
}

function customerRow(db: DB, p: Party, links: PartyLinks | undefined): CustomerRow {
  const L = links ?? { asContractor: [], asPayer: [], inquiries: [], branches: new Set<string>() };
  const leases = [...L.asContractor, ...L.asPayer].filter((l) => l.status !== "cancelled");
  let stage: CustomerStage;
  if (leases.some((l) => l.status === "occupied" || l.status === "closing")) stage = "거주 중";
  else if (leases.some((l) => ["draft", "awaiting_signature", "concluded", "move_in_confirmed"].includes(l.status))) stage = "계약 중";
  else if (L.inquiries.some((q) => q.kind === "inquiry" && !q.closed_at)) stage = "문의 중";
  else if (leases.length) stage = "지난 고객";
  else if (L.inquiries.length && L.inquiries.every((q) => q.stage === "lost")) stage = "결렬";
  else stage = "문의 중";
  const role: CustomerRole = L.asContractor.length ? "계약자" : L.asPayer.length ? "납부자" : "문의자";
  const acts = [p.last_activity_at, ...L.inquiries.map((q) => q.last_activity_at), ...leases.map((l) => l.created_at)];
  const last = acts.sort().at(-1) ?? p.created_at;
  // 보존 기한: 거래 중이면 기한 없음, 끝난 계약은 종료 후 5년(세법 장부 보존), 결렬 문의는 1년
  let retention: CustomerRow["retention"];
  if (p.retention_until) retention = { until: p.retention_until, reason: "직접 정함" };
  else if (stage === "거주 중" || stage === "계약 중") retention = { until: null, reason: "기한 없음 · 계약" };
  else if (stage === "문의 중") retention = { until: null, reason: "기한 없음 · 문의" };
  else if (stage === "지난 고객") {
    const end = leases.map((l) => leaseLastDay(l)).sort().at(-1)!;
    retention = { until: plusMonths(end, 60), reason: "계약 끝난 뒤 5년" };
  } else retention = { until: plusMonths(last.slice(0, 10), 12), reason: "결렬 뒤 1년" };
  const bid = p.branch_id ?? [...L.branches][0] ?? null;
  return {
    ...p,
    last_activity_at: last,
    branch_name: branchName(db, bid),
    inquiry_count: L.inquiries.length,
    lease_count: new Set(leases.map((l) => l.id)).size,
    stage,
    role,
    retention,
  };
}

// ── 경로 ────────────────────────────────────────────────

export const salesRoutes: Route[] = [
  // 호실 목록
  route("GET /api/units", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const ps = query.get("period_start");
    const months = Number(query.get("months") ?? 0);
    const period = ps ? { from: ps, to: months > 0 ? plusDays(plusMonths(ps, months), -1) : ps } : undefined;
    return db.units
      .filter(inBranch(query.get("branch_id")))
      .sort(unitSort)
      .map((u) => unitRow(db, ix, u, t, period));
  }),

  route("GET /api/units/:id", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const u = must(ix.unit.get(params.id), "호실");
    const detail: UnitDetail = {
      ...unitRow(db, ix, u, today()),
      unit_type: u.unit_type_id ? ix.type.get(u.unit_type_id) ?? null : null,
      leases: (ix.leasesByUnit.get(u.id) ?? [])
        .slice()
        .reverse()
        .map((l) => ({ id: l.id, status: l.status, start_date: l.start_date, end_date: l.end_date, move_out_date: l.move_out_date, contractor_name: ix.party.get(l.contractor_id)?.name ?? "—", rent: l.rent })),
      blocks: db.blocks.filter((b) => b.unit_id === u.id).sort((a, b) => b.from.localeCompare(a.from)),
    };
    return detail;
  }),

  route("POST /api/units", ({ body }) => {
    const db = getDB();
    const code = String(body?.code ?? "").trim();
    const branchId = String(body?.branch_id ?? "");
    const branch = must(db.branches.find((b) => b.id === branchId), "지점");
    if (!/^[A-Za-z0-9-]+$/.test(code)) throw new HttpError(400, "호실 번호는 영문·숫자·- 만 쓴다");
    if (db.units.some((u) => u.branch_id === branch.id && u.code.toLowerCase() === code.toLowerCase())) throw new HttpError(409, `${code}호는 이미 ${branch.name}에 있다`);
    const type = body?.unit_type_id ? must(db.unit_types.find((t) => t.id === body.unit_type_id && t.branch_id === branch.id), "룸타입") : null;
    const floor = body?.floor === "" || body?.floor === null || body?.floor === undefined ? (/^\d{3,4}$/.test(code) ? Number(code.slice(0, -2)) : null) : Number(body.floor);
    const sameFloor = db.units.filter((u) => u.branch_id === branch.id && u.floor === floor);
    const unit: Unit = {
      id: newId("u"),
      branch_id: branch.id,
      building_id: body?.building_id || db.buildings.find((b) => b.branch_id === branch.id)?.id || "",
      unit_type_id: type?.id ?? null,
      code,
      floor,
      area_m2: Number(body?.area_m2) || type?.area_m2 || 0,
      facing: body?.facing || null,
      sale_status: "on_sale",
      asking_price: body?.asking_price ?? (type ? { rent: type.list_rent, mgmt: type.list_mgmt } : null),
      layout: { col: sameFloor.reduce((m, u) => Math.max(m, u.layout.col + u.layout.span - 1), 0) + 1, span: 1 },
      memo: "",
      created_at: nowIso(),
      asking_history: [],
    };
    db.units.push(unit);
    logHistory("unit", unit.id, "호실 등록");
    return unit;
  }),

  route("PATCH /api/units/:id", ({ params, body }) => {
    const db = getDB();
    const u = must(db.units.find((x) => x.id === params.id), "호실");
    const changes: string[] = [];
    if (body?.sale_status && body.sale_status !== u.sale_status) {
      u.sale_status = body.sale_status;
      changes.push(body.sale_status === "on_sale" ? "판매 재개" : "판매 중지");
    }
    if (body && "asking_price" in body) {
      u.asking_price = body.asking_price;
      changes.push(body.asking_price ? `모집가 월 ${Math.round(body.asking_price.rent / 10000)}만원` : "모집가 지움");
    }
    if (body && "unit_type_id" in body) {
      if (body.unit_type_id) must(db.unit_types.find((t) => t.id === body.unit_type_id && t.branch_id === u.branch_id), "룸타입");
      u.unit_type_id = body.unit_type_id || null;
      changes.push("룸타입 변경");
    }
    if (body && typeof body.memo === "string") u.memo = body.memo;
    if (body?.layout) u.layout = { col: Math.max(1, Number(body.layout.col)), span: Math.min(4, Math.max(1, Number(body.layout.span))) };
    if (body && "floor" in body) u.floor = body.floor === null ? null : Number(body.floor);
    if (changes.length) logHistory("unit", u.id, changes.join(" · "));
    return u;
  }),

  route("GET /api/units/:id/asking-prices", ({ params }) => {
    const db = getDB();
    const u = must(db.units.find((x) => x.id === params.id), "호실");
    const t = u.unit_type_id ? db.unit_types.find((x) => x.id === u.unit_type_id) : null;
    return { asking_price: u.asking_price, list_price: t ? { rent: t.list_rent, mgmt: t.list_mgmt } : null };
  }),

  // 일정 블록(홀드·운영중지)
  route("GET /api/units/:id/blocks", ({ params }) => getDB().blocks.filter((b) => b.unit_id === params.id).sort((a, b) => b.from.localeCompare(a.from))),

  route("POST /api/units/:id/blocks", ({ params, body }) => {
    const db = getDB();
    const ix = indexDB(db);
    const u = must(ix.unit.get(params.id), "호실");
    const kind = body?.kind === "suspend" ? "suspend" : body?.kind === "hold" ? "hold" : null;
    if (!kind) throw new HttpError(400, "홀드인지 운영중지인지 고른다");
    const from = String(body?.from || today());
    const until = body?.until ? String(body.until) : null;
    if (until && until < from) throw new HttpError(400, "끝나는 날이 시작일보다 앞이다");
    if (kind === "hold") {
      const busy = (ix.leasesByUnit.get(u.id) ?? []).filter(live).some((l) => overlapDays(l.start_date, leaseLastDay(l), from, until ?? from) > 0);
      if (busy) throw new HttpError(409, "그 기간에 계약이 있어 홀드할 수 없다");
    }
    const block: UnitBlock = {
      id: newId("bk"),
      unit_id: u.id,
      kind,
      from,
      until,
      reason: String(body?.reason ?? "").trim() || (kind === "hold" ? "문의 고객 홀드" : "운영중지"),
      inquiry_id: body?.inquiry_id || null,
      hold_expires_at: kind === "hold" ? body?.hold_expires_at || `${until ?? plusDays(from, 1)}T18:00:00+09:00` : null,
      created_at: nowIso(),
    };
    db.blocks.push(block);
    logHistory("unit", u.id, kind === "hold" ? `홀드 ${from}${until ? ` ~ ${until}` : ""}` : `운영중지 ${from}${until ? ` ~ ${until}` : ""} · ${block.reason}`);
    if (block.inquiry_id) logHistory("inquiry", block.inquiry_id, `${u.code}호 홀드`);
    return block;
  }),

  route("DELETE /api/units/:unitId/blocks/:blockId", ({ params }) => {
    const db = getDB();
    const i = db.blocks.findIndex((b) => b.id === params.blockId && b.unit_id === params.unitId);
    const b = must(i >= 0 ? db.blocks[i] : null, "일정");
    db.blocks.splice(i, 1);
    logHistory("unit", params.unitId, `${b.kind === "hold" ? "홀드" : "운영중지"} 풀기`);
    return { ok: true };
  }),

  // 지점 달력(호실 × 날짜)
  route("GET /api/branches/:id/calendar", ({ params, query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const from = query.get("from") || t;
    const to = query.get("to") || plusDays(from, 30);
    const data: CalendarData = {
      from,
      to,
      units: db.units
        .filter(inBranch(params.id))
        .sort(unitSort)
        .map((u) => {
          const segs: CalendarSegment[] = [];
          for (const l of (ix.leasesByUnit.get(u.id) ?? []).filter(live)) {
            const last = leaseLastDay(l);
            if (overlapDays(l.start_date, last, from, to) === 0) continue;
            segs.push({ kind: "lease", id: l.id, from: l.start_date, to: last, label: ix.party.get(l.contractor_id)?.name ?? "계약", status: l.status });
          }
          for (const b of db.blocks.filter((x) => x.unit_id === u.id)) {
            const end = b.kind === "hold" ? (b.hold_expires_at?.slice(0, 10) ?? b.until ?? b.from) : b.until ?? to;
            if (overlapDays(b.from, end, from, to) === 0) continue;
            segs.push({ kind: b.kind, id: b.id, from: b.from, to: end, label: b.kind === "hold" ? "홀드" : b.reason, status: b.kind });
          }
          return { id: u.id, code: u.code, floor: u.floor, branch_id: u.branch_id, branch_name: branchName(db, u.branch_id) ?? "", type_name: u.unit_type_id ? ix.type.get(u.unit_type_id)?.name ?? null : null, sale_status: u.sale_status, segments: segs.sort((a, b) => a.from.localeCompare(b.from)) };
        }),
    };
    return data;
  }),

  // ── 상담(문의) ─────────────────────────────────────────
  route("GET /api/inquiries", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const b = query.get("branch_id");
    const unplaced = query.get("include_unplaced") === "true";
    const kind = query.get("kind");
    const status = query.get("status") ?? "all";
    const q = (query.get("q") ?? "").trim().toLowerCase();
    const qd = digits(q);
    const now = Date.now();
    return db.inquiries
      .filter((x) => inBranch(b)(x) || (unplaced && x.branch_id === null))
      .filter((x) => !kind || x.kind === kind)
      .filter((x) => {
        if (status === "active") return !x.closed_at;
        if (status === "awaiting") return isAwaiting(x);
        if (status === "done") return !!x.closed_at;
        return true;
      })
      .filter((x) => {
        if (!q) return true;
        const p = ix.party.get(x.party_id);
        if (!p) return false;
        return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.contact_name ?? "").toLowerCase().includes(q) || (qd.length >= 3 && digits(p.phone).includes(qd));
      })
      .map((x) => inquiryRow(db, ix, x, now))
      .sort((a, b) => Number(b.awaiting) - Number(a.awaiting) || b.last_activity_at.localeCompare(a.last_activity_at));
  }),

  route("GET /api/inquiries/:id", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const q = findInquiry(db, params.id);
    const p = ix.party.get(q.party_id);
    const links = p ? partyLinks(db).get(p.id) : undefined;
    const detail: InquiryDetail = {
      ...q,
      messages: [...q.messages].sort((a, b) => a.at.localeCompare(b.at)),
      party: p
        ? { ...partyCard(p)!, contact_name: p.contact_name, nationality: p.nationality, inquiry_count: links?.inquiries.length ?? 0, lease_count: (links?.asContractor.length ?? 0) + (links?.asPayer.length ?? 0) }
        : null,
      assignee_name: staffName(db, q.assignee_id),
      branch_name: branchName(db, q.branch_id),
      awaiting: isAwaiting(q),
      unit_code: q.unit_id ? ix.unit.get(q.unit_id)?.code ?? null : null,
      tours: [...q.tours].sort((a, b) => b.at.localeCompare(a.at)).map((t) => ({ ...t, unit_codes: t.unit_ids.map((id) => ix.unit.get(id)?.code ?? "?") })),
      leases: leaseSummaryForInquiry(db, ix, q),
    };
    return detail;
  }),

  route("POST /api/parties/search", ({ body }) => {
    const db = getDB();
    const field = body?.field as "phone" | "email" | "name";
    const raw = String(body?.value ?? "").trim();
    if (!raw) return [];
    const links = partyLinks(db);
    const hit = (p: Party) => {
      if (field === "phone") return digits(raw).length >= 7 && digits(p.phone) === digits(raw);
      if (field === "email") return p.email.toLowerCase() === raw.toLowerCase();
      return p.name.toLowerCase().includes(raw.toLowerCase()) || (p.contact_name ?? "").toLowerCase().includes(raw.toLowerCase());
    };
    const rows: PartyMatch[] = db.parties
      .filter(hit)
      .slice(0, 20)
      .map((p) => {
        const L = links.get(p.id);
        return { ...partyCard(p)!, contact_name: p.contact_name, inquiry_count: L?.inquiries.length ?? 0, lease_count: (L?.asContractor.length ?? 0) + (L?.asPayer.length ?? 0) };
      });
    return rows;
  }),

  route("POST /api/inquiries", ({ body }) => {
    const db = getDB();
    const isCorp = body?.kind === "corporation";
    const name = String(body?.name ?? "").trim();
    const company = String(body?.company_name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const branchId = body?.branch_id || null;
    if (branchId) must(db.branches.find((b) => b.id === branchId), "지점");
    let party: Party;
    if (body?.party_id) {
      party = must(db.parties.find((p) => p.id === body.party_id), "고객");
    } else {
      if (isCorp ? !company : !name) throw new HttpError(400, isCorp ? "회사명을 적는다" : "이름을 적는다");
      if (!phone && !email) throw new HttpError(400, "전화나 이메일 중 하나는 있어야 한다");
      party = {
        id: newId("pt"),
        kind: isCorp ? "corporation" : "individual",
        name: isCorp ? company : name,
        phone,
        email,
        nationality: body?.nationality || (phone.startsWith("+") && !phone.startsWith("+82") ? "" : "KR"),
        gender: null,
        branch_id: branchId,
        contact_name: isCorp ? name || null : null,
        created_at: nowIso(),
        last_activity_at: nowIso(),
        retention_until: null,
        bank_account: null,
      };
      db.parties.push(party);
      logHistory("customer", party.id, "문의로 고객 생성");
    }
    const at = nowIso();
    const message = String(body?.message ?? "").trim();
    const channel = body?.channel || "phone";
    const kind: Inquiry["kind"] = body?.inquiry_kind === "life" ? "life" : "inquiry";
    const msgs: Message[] = message ? [{ id: newId("m"), direction: "inbound", body: message, at, author: party.name, via: channel }] : [];
    const inq: Inquiry = {
      id: newId("iq"),
      branch_id: branchId,
      kind,
      party_id: party.id,
      channel,
      source_group: body?.source_group || "기타",
      source_detail: body?.source_detail || "기타",
      stage: "new",
      lost_reason: null,
      assignee_id: body?.assignee_id || db.staff.find((s) => s.id === "s_lee")?.id || null,
      desired_move_in: body?.desired_move_in || null,
      stay_months: body?.stay_months ? Number(body.stay_months) : null,
      monthly_budget: body?.monthly_budget ? Number(body.monthly_budget) : null,
      rooms: Math.max(1, Number(body?.rooms) || 1),
      message,
      unit_id: body?.unit_id || null,
      lease_ids: [],
      created_at: at,
      first_reply_at: null,
      last_activity_at: at,
      closed_at: null,
      messages: msgs,
      tours: [],
      extra_party_ids: [],
    };
    db.inquiries.push(inq);
    party.last_activity_at = at;
    logHistory("inquiry", inq.id, `${kind === "life" ? "생활문의" : "입주문의"} 접수`);
    return inq;
  }),

  route("PATCH /api/inquiries/:id", ({ params, body }) => {
    const db = getDB();
    const q = findInquiry(db, params.id);
    const notes: string[] = [];
    if (body?.stage && body.stage !== q.stage) {
      const stage = body.stage as InquiryStage;
      if (!(stage in INQUIRY_STAGE)) throw new HttpError(400, "알 수 없는 단계");
      if (stage === "lost") {
        if (!body.lost_reason) throw new HttpError(400, "결렬 사유를 고른다");
        q.lost_reason = String(body.lost_reason);
        q.closed_at = nowIso();
        notes.push(`결렬 · ${q.lost_reason}`);
      } else {
        notes.push(`단계 ${INQUIRY_STAGE[q.stage].label} → ${INQUIRY_STAGE[stage].label}`);
        q.lost_reason = null;
        q.closed_at = stage === "concluded" ? nowIso() : null;
      }
      q.stage = stage;
    }
    if (body && "close" in body) {
      q.closed_at = body.close ? nowIso() : null;
      if (q.kind === "life") q.stage = body.close ? "concluded" : "new";
      notes.push(body.close ? "완료 처리" : "다시 열기");
    }
    if (body && "assignee_id" in body && body.assignee_id !== q.assignee_id) {
      q.assignee_id = body.assignee_id || null;
      notes.push(`담당 ${staffName(db, q.assignee_id) ?? "없음"}`);
    }
    if (body && "branch_id" in body) {
      if (body.branch_id) must(db.branches.find((b) => b.id === body.branch_id), "지점");
      q.branch_id = body.branch_id || null;
      notes.push(`희망 지점 ${branchName(db, q.branch_id) ?? "정하지 않음"}`);
    }
    for (const k of ["desired_move_in", "stay_months", "monthly_budget", "rooms"] as const) {
      if (body && k in body) {
        const v = body[k];
        (q as unknown as Record<string, unknown>)[k] = v === "" || v === null ? null : k === "desired_move_in" ? String(v) : Number(v);
      }
    }
    q.last_activity_at = nowIso();
    if (notes.length) logHistory("inquiry", q.id, notes.join(" · "));
    return q;
  }),

  route("GET /api/inquiries/:id/conversations", ({ params }) => [...findInquiry(getDB(), params.id).messages].sort((a, b) => a.at.localeCompare(b.at))),

  route("POST /api/inquiries/:id/conversations", ({ params, body }) => {
    const db = getDB();
    const q = findInquiry(db, params.id);
    const text = String(body?.body ?? "").trim();
    if (!text) throw new HttpError(400, "보낼 내용을 적는다");
    const direction: Message["direction"] = body?.direction === "note" ? "note" : body?.direction === "inbound" ? "inbound" : "outbound";
    const at = nowIso();
    const msg: Message = { id: newId("m"), direction, body: text, at, author: direction === "inbound" ? ix0(db, q.party_id) : db.me.name, via: body?.via || "email" };
    q.messages.push(msg);
    if (direction === "outbound" && !q.first_reply_at) q.first_reply_at = at;
    q.last_activity_at = at;
    const p = db.parties.find((x) => x.id === q.party_id);
    if (p) p.last_activity_at = at;
    return msg;
  }),

  route("POST /api/inquiries/:id/tours", ({ params, body }) => {
    const db = getDB();
    const q = findInquiry(db, params.id);
    if (!body?.at) throw new HttpError(400, "투어 일시를 고른다");
    const ids: string[] = Array.isArray(body?.unit_ids) ? body.unit_ids : [];
    if (!ids.length) throw new HttpError(400, "보여줄 호실을 하나 이상 고른다");
    const codes = ids.map((id) => must(db.units.find((u) => u.id === id), "호실").code);
    const tour: Tour = { id: newId("tr"), at: String(body.at), unit_ids: ids, status: "scheduled", memo: String(body?.memo ?? "") };
    q.tours.push(tour);
    if (q.stage === "new") q.stage = "tour";
    q.last_activity_at = nowIso();
    logHistory("inquiry", q.id, `투어 잡음 · ${codes.map((c) => `${c}호`).join(", ")}`);
    return tour;
  }),

  route("PATCH /api/inquiries/:id/tours/:tourId", ({ params, body }) => {
    const db = getDB();
    const q = findInquiry(db, params.id);
    const t = must(q.tours.find((x) => x.id === params.tourId), "투어");
    if (body?.status) t.status = body.status;
    if (typeof body?.memo === "string") t.memo = body.memo;
    const label: Record<Tour["status"], string> = { scheduled: "예정", done: "다녀감", no_show: "안 옴", cancelled: "취소" };
    logHistory("inquiry", q.id, `투어 ${label[t.status]}`);
    return t;
  }),

  route("POST /api/inquiries/matches", ({ body }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const from = body?.move_in && body.move_in >= t ? String(body.move_in) : t;
    const months = Math.max(1, Number(body?.months) || 1);
    const to = plusDays(plusMonths(from, months), -1);
    const budget = body?.budget ? Number(body.budget) : null;
    const out: UnitMatch[] = [];
    for (const u of db.units.filter(inBranch(body?.branch_id ?? null))) {
      if (!freeFor(db, ix, u, from, to)) continue;
      const s = unitToday(db, ix, u, t);
      if (s.state === "hold" && s.block?.inquiry_id !== body?.inquiry_id) continue;
      const rent = u.asking_price?.rent ?? (u.unit_type_id ? ix.type.get(u.unit_type_id)?.list_rent ?? null : null);
      const over = budget && rent ? Math.max(0, rent - budget) : 0;
      if (budget && rent && rent > budget * 1.1) continue;
      const next = (ix.leasesByUnit.get(u.id) ?? []).filter(live).find((l) => l.start_date > to);
      const freeFrom = s.lease ? plusDays(leaseLastDay(s.lease), 1) : t;
      out.push({
        unit_id: u.id,
        code: u.code,
        branch_id: u.branch_id,
        branch_name: branchName(db, u.branch_id) ?? "",
        type_name: u.unit_type_id ? ix.type.get(u.unit_type_id)?.name ?? null : null,
        floor: u.floor,
        area_m2: u.area_m2,
        rent,
        mgmt: u.asking_price?.mgmt ?? null,
        free_from: freeFrom,
        free_until: next ? plusDays(next.start_date, -1) : null,
        over_budget: over,
        reason: over > 0 ? `예산보다 월 ${Math.round(over / 10000)}만원 높음` : budget ? "예산 안 · 기간 내내 빔" : "기간 내내 빔",
      });
    }
    return out.sort((a, b) => a.over_budget - b.over_budget || (b.rent ?? 0) - (a.rent ?? 0)).slice(0, 8);
  }),

  // ── 고객 ───────────────────────────────────────────────
  route("GET /api/customers", ({ query }) => {
    const db = getDB();
    const b = query.get("branch_id");
    const kind = query.get("kind");
    const stage = query.get("stage");
    const q = (query.get("q") ?? "").trim().toLowerCase();
    const qd = digits(q);
    const links = partyLinks(db);
    return db.parties
      .filter((p) => {
        if (!b || b === "all") return true;
        return p.branch_id === b || links.get(p.id)?.branches.has(b);
      })
      .filter((p) => !kind || p.kind === kind)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.contact_name ?? "").toLowerCase().includes(q) || (qd.length >= 3 && digits(p.phone).includes(qd)))
      .map((p) => customerRow(db, p, links.get(p.id)))
      .filter((r) => !stage || r.stage === stage)
      .sort((x, y) => y.last_activity_at.localeCompare(x.last_activity_at));
  }),

  route("GET /api/customers/:id", ({ params }) => {
    const db = getDB();
    const ix = indexDB(db);
    const p = must(ix.party.get(params.id), "고객");
    const L = partyLinks(db).get(p.id);
    const row = customerRow(db, p, L);
    const leaseMap = new Map<string, Lease>();
    for (const l of [...(L?.asContractor ?? []), ...(L?.asPayer ?? [])]) leaseMap.set(l.id, l);
    const detail: CustomerDetail = {
      ...row,
      inquiries: (L?.inquiries ?? [])
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((q) => ({ id: q.id, kind: q.kind, stage: q.stage, branch_name: branchName(db, q.branch_id), created_at: q.created_at, last_activity_at: q.last_activity_at, message: q.message, closed_at: q.closed_at })),
      leases: [...leaseMap.values()]
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .map((l) => ({
          id: l.id,
          status: l.status,
          unit_id: l.unit_id,
          unit_code: ix.unit.get(l.unit_id)?.code ?? "—",
          branch_name: branchName(db, l.branch_id) ?? "",
          start_date: l.start_date,
          end_date: l.end_date,
          rent: l.rent,
          as: l.contractor_id === p.id && l.payer_id === p.id ? "계약자·납부자" : l.contractor_id === p.id ? "계약자" : "납부자",
        })),
    };
    return detail;
  }),

  route("PATCH /api/customers/:id", ({ params, body }) => {
    const db = getDB();
    const p = must(db.parties.find((x) => x.id === params.id), "고객");
    const changed: string[] = [];
    const label: Record<string, string> = { name: "이름", phone: "전화", email: "이메일", nationality: "국적", bank_account: "환불 계좌", contact_name: "담당자", retention_until: "보존 기한", gender: "성별" };
    for (const k of Object.keys(label)) {
      if (body && k in body) {
        const v = body[k] === "" ? null : body[k];
        if (k === "name" && !v) throw new HttpError(400, "이름은 비울 수 없다");
        if ((p as unknown as Record<string, unknown>)[k] !== v) {
          (p as unknown as Record<string, unknown>)[k] = k === "name" || k === "phone" || k === "email" || k === "nationality" ? v ?? "" : v;
          changed.push(label[k]);
        }
      }
    }
    if (changed.length) logHistory("customer", p.id, `${changed.join(", ")} 고침`);
    return p;
  }),
];

function ix0(db: DB, partyId: string): string {
  return db.parties.find((p) => p.id === partyId)?.name ?? "고객";
}
