/**
 * 대화함 API — 원본의 메일 수신함 연동을 대신한다.
 * 메일·카톡·문자로 받은 내용을 붙여넣어 기록하고, 상담이나 계약에 붙이거나 새 문의로 만든다.
 * (원본 /api/conversations/unlinked, /api/leases/conversation-candidates)
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import { logHistory } from "./common";
import { extract, firstSentence } from "./sales-extract";
import type { Channel, Conversation, DB, Inquiry, Lease, Message, Party } from "@/types";
import type { ConversationCandidate, ConversationDetail, ConversationRow } from "@/pages/inquiries/model";

const CHANNELS: Channel[] = ["phone", "visit", "email", "web", "kakao", "platform"];
const digits = (s: string) => s.replace(/\D/g, "");
const OPEN_LEASE: Lease["status"][] = ["draft", "awaiting_signature", "concluded", "move_in_confirmed", "occupied", "closing"];

function inboundText(c: Conversation): string {
  return c.messages
    .filter((m) => m.direction === "inbound")
    .map((m) => [m.subject, m.body].filter(Boolean).join("\n"))
    .join("\n");
}

function lastInbound(c: Conversation): Message | undefined {
  return [...c.messages].reverse().find((m) => m.direction === "inbound");
}

/** 대화의 보낸 사람과 맞는 계약·상담 후보 */
export function candidatesFor(db: DB, c: Conversation): ConversationCandidate[] {
  const contact = c.from_contact.trim().toLowerCase();
  const isMail = contact.includes("@");
  const tel = digits(contact);
  const ex = extract(inboundText(c), today());
  const mail2 = ex.email?.value.toLowerCase() ?? null;
  const tel2 = ex.phone ? digits(ex.phone.value) : null;
  const name = c.from_name.replace(/\(주\)|주식회사|인사팀|총무팀/g, "").trim().toLowerCase();

  const match = (p: Party | undefined): { reason: string; score: number } | null => {
    if (!p) return null;
    const pm = p.email.toLowerCase();
    const pt = digits(p.phone);
    if (pm && ((isMail && pm === contact) || (mail2 && pm === mail2))) return { reason: "메일 주소가 같다", score: 3 };
    if (pt.length >= 7 && ((tel.length >= 7 && pt === tel) || (tel2 && pt === tel2))) return { reason: "전화번호가 같다", score: 3 };
    const pn = p.name.replace(/\(주\)|주식회사/g, "").trim().toLowerCase();
    if (name.length >= 2 && pn.length >= 2 && (pn === name || pn.includes(name) || name.includes(pn))) return { reason: "이름이 같다", score: 1 };
    return null;
  };

  const party = new Map(db.parties.map((p) => [p.id, p]));
  const unitCode = (id: string) => db.units.find((u) => u.id === id)?.code ?? "?";
  const out: ConversationCandidate[] = [];
  for (const l of db.leases) {
    if (!OPEN_LEASE.includes(l.status)) continue;
    const people = [l.contractor_id, l.payer_id, ...(l.occupant_ids ?? [])];
    let best: { reason: string; score: number } | null = null;
    for (const pid of people) {
      const m = match(party.get(pid));
      if (m && (!best || m.score > best.score)) best = { ...m, reason: pid === l.contractor_id ? m.reason : `${m.reason}(${pid === l.payer_id ? "납부자" : "입주자"})` };
    }
    if (best) {
      const p = party.get(l.contractor_id);
      out.push({ kind: "lease", id: l.id, title: `${unitCode(l.unit_id)}호 · ${p?.name ?? "계약자"}`, sub: `${l.start_date.slice(2).replace(/-/g, ".")} ~ ${l.end_date.slice(2).replace(/-/g, ".")}`, reason: best.reason, score: best.score + 0.5 });
    }
  }
  for (const q of db.inquiries) {
    if (q.closed_at) continue;
    const m = match(party.get(q.party_id)) ?? q.extra_party_ids.map((id) => match(party.get(id))).find(Boolean) ?? null;
    if (m) out.push({ kind: "inquiry", id: q.id, title: `${party.get(q.party_id)?.name ?? "고객"} ${q.kind === "life" ? "생활문의" : "문의"}`, sub: `${q.created_at.slice(5, 10).replace("-", ".")} 접수`, reason: m.reason, score: m.score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

function convRow(db: DB, c: Conversation, withCount = true): ConversationRow {
  const last = lastInbound(c);
  const lastAny = [...c.messages].reverse().find((m) => m.direction !== "note");
  return {
    id: c.id,
    branch_id: c.branch_id,
    branch_name: c.branch_id ? db.branches.find((b) => b.id === c.branch_id)?.name ?? null : null,
    inquiry_id: c.inquiry_id,
    lease_id: c.lease_id,
    channel: c.channel,
    from_name: c.from_name,
    from_contact: c.from_contact,
    subject: c.subject,
    created_at: c.created_at,
    last_activity_at: c.last_activity_at,
    message_count: c.messages.length,
    preview: (last?.body ?? "").replace(/\s+/g, " ").slice(0, 100),
    awaiting: !!lastAny && lastAny.direction === "inbound",
    extracted: { ...extract(inboundText(c), today()), first_sentence: last ? firstSentence(last.body) : null },
    candidate_count: withCount ? candidatesFor(db, c).length : 0,
  };
}

function findConv(db: DB, id: string): Conversation {
  return must(db.conversations.find((c) => c.id === id), "대화");
}

/** 대화를 상담에 붙인다 — 메시지를 상담 대화로 옮기고 대화함에서 빠진다 */
function linkToInquiry(c: Conversation, q: Inquiry): void {
  const have = new Set(q.messages.map((m) => m.id));
  for (const m of c.messages) if (!have.has(m.id)) q.messages.push({ ...m });
  q.messages.sort((a, b) => a.at.localeCompare(b.at));
  const firstOut = q.messages.find((m) => m.direction === "outbound");
  if (firstOut && !q.first_reply_at) q.first_reply_at = firstOut.at;
  q.last_activity_at = q.messages[q.messages.length - 1]?.at ?? q.last_activity_at;
  c.inquiry_id = q.id;
  c.last_activity_at = nowIso();
}

export const inboxRoutes: Route[] = [
  route("GET /api/conversations/unlinked", ({ query }) => {
    const db = getDB();
    const b = query.get("branch_id");
    return db.conversations
      .filter((c) => !c.inquiry_id && !c.lease_id)
      .filter((c) => !b || b === "all" || c.branch_id === null || c.branch_id === b)
      .sort((a, z) => z.last_activity_at.localeCompare(a.last_activity_at))
      .map((c) => convRow(db, c));
  }),

  route("GET /api/conversations/:id", ({ params }) => {
    const db = getDB();
    const c = findConv(db, params.id);
    const detail: ConversationDetail = { ...convRow(db, c, false), messages: [...c.messages].sort((a, z) => a.at.localeCompare(z.at)), candidates: candidatesFor(db, c) };
    detail.candidate_count = detail.candidates.length;
    return detail;
  }),

  /** 대화 붙여넣기 — 받은 메일·카톡·문자를 기록한다 */
  route("POST /api/conversations", ({ body }) => {
    const db = getDB();
    const text = String(body?.body ?? "").trim();
    if (!text) throw new HttpError(400, "받은 내용을 붙여넣는다");
    const name = String(body?.from_name ?? "").trim();
    const contact = String(body?.from_contact ?? "").trim();
    const ex = extract(text, today());
    const channel: Channel = CHANNELS.includes(body?.channel) ? body.channel : contact.includes("@") ? "email" : "kakao";
    const branchId = body?.branch_id && body.branch_id !== "all" ? String(body.branch_id) : null;
    if (branchId) must(db.branches.find((b) => b.id === branchId), "지점");
    const at = body?.at ? String(body.at) : nowIso();
    const subject = String(body?.subject ?? "").trim() || ex.first_sentence?.slice(0, 40) || "제목 없음";
    const fromName = name || (ex.email?.value.split("@")[0] ?? "") || "보낸 사람 미상";
    const c: Conversation = {
      id: newId("cv"),
      branch_id: branchId,
      inquiry_id: null,
      lease_id: null,
      channel,
      from_name: fromName,
      from_contact: contact || ex.email?.value || ex.phone?.value || "",
      subject,
      messages: [{ id: newId("m"), direction: "inbound", body: text, at, author: fromName, via: channel, subject, attachments: [] }],
      created_at: at,
      last_activity_at: at,
    };
    db.conversations.push(c);
    // 바로 붙일 곳이 지정됐으면 붙인다
    if (body?.inquiry_id) linkToInquiry(c, must(db.inquiries.find((q) => q.id === body.inquiry_id), "상담"));
    else if (body?.lease_id) c.lease_id = must(db.leases.find((l) => l.id === body.lease_id), "계약").id;
    return convRow(db, c);
  }),

  route("POST /api/conversations/:id/messages", ({ params, body }) => {
    const db = getDB();
    const c = findConv(db, params.id);
    const text = String(body?.body ?? "").trim();
    if (!text) throw new HttpError(400, "내용을 적는다");
    const direction: Message["direction"] = body?.direction === "inbound" ? "inbound" : body?.direction === "note" ? "note" : "outbound";
    const msg: Message = {
      id: newId("m"),
      direction,
      body: text,
      at: nowIso(),
      author: direction === "inbound" ? c.from_name : db.me.name,
      via: CHANNELS.includes(body?.via) ? body.via : c.channel,
      subject: body?.subject ? String(body.subject) : null,
      attachments: Array.isArray(body?.attachments) ? body.attachments : [],
    };
    c.messages.push(msg);
    c.last_activity_at = msg.at;
    return msg;
  }),

  route("POST /api/conversations/:id/link", ({ params, body }) => {
    const db = getDB();
    const c = findConv(db, params.id);
    if (body?.inquiry_id) {
      const q = must(db.inquiries.find((x) => x.id === body.inquiry_id), "상담");
      linkToInquiry(c, q);
      logHistory("inquiry", q.id, `대화 붙임 · ${c.from_name} «${c.subject}»`);
      return { ok: true, inquiry_id: q.id };
    }
    if (body?.lease_id) {
      const l = must(db.leases.find((x) => x.id === body.lease_id), "계약");
      c.lease_id = l.id;
      if (!c.branch_id) c.branch_id = l.branch_id;
      c.last_activity_at = nowIso();
      logHistory("lease", l.id, `대화 붙임 · ${c.from_name} «${c.subject}»`);
      return { ok: true, lease_id: l.id };
    }
    throw new HttpError(400, "붙일 상담이나 계약을 고른다");
  }),

  /** 대화로 새 문의 만들기 — 읽은 조건(입주일·기간·예산)을 채운다 */
  route("POST /api/conversations/:id/to-inquiry", ({ params, body }) => {
    const db = getDB();
    const c = findConv(db, params.id);
    if (c.inquiry_id) throw new HttpError(409, "이미 상담에 붙은 대화다");
    const ex = extract(inboundText(c), today());
    const contact = c.from_contact.trim();
    const mail = (contact.includes("@") ? contact : ex.email?.value ?? "").toLowerCase();
    const tel = digits(contact.includes("@") ? ex.phone?.value ?? "" : contact);
    const branchId = body?.branch_id && body.branch_id !== "all" ? String(body.branch_id) : c.branch_id;
    let party = db.parties.find((p) => (mail && p.email.toLowerCase() === mail) || (tel.length >= 7 && digits(p.phone) === tel));
    const corp = /\(주\)|주식회사|인사팀|총무팀|corp|inc\.|ltd/i.test(c.from_name);
    if (!party) {
      party = {
        id: newId("pt"),
        kind: corp ? "corporation" : "individual",
        name: c.from_name.replace(/\s*(인사팀|총무팀)$/, "").trim() || "이름 미상",
        phone: contact.includes("@") ? ex.phone?.value ?? "" : contact,
        email: mail,
        nationality: /[가-힣]/.test(c.from_name) ? "KR" : "",
        gender: null,
        branch_id: branchId,
        contact_name: corp ? (/(인사팀|총무팀)/.exec(c.from_name)?.[1] ?? null) : null,
        created_at: nowIso(),
        last_activity_at: nowIso(),
        retention_until: null,
        bank_account: null,
      };
      db.parties.push(party);
      logHistory("customer", party.id, "대화로 고객 생성");
    }
    const first = c.messages.find((m) => m.direction === "inbound");
    const at = c.created_at;
    const q: Inquiry = {
      id: newId("iq"),
      branch_id: branchId,
      kind: body?.kind === "life" ? "life" : "inquiry",
      party_id: party.id,
      channel: c.channel,
      source_group: "기타",
      source_detail: c.channel === "email" ? "메일 문의" : "메시지 문의",
      stage: "new",
      lost_reason: null,
      assignee_id: body?.assignee_id || null,
      desired_move_in: ex.move_in?.value ?? null,
      stay_months: ex.months?.value ?? null,
      monthly_budget: ex.budget?.value ?? null,
      rooms: ex.people && ex.people.value > 2 ? ex.people.value : 1,
      message: first?.body ?? "",
      unit_id: null,
      lease_ids: [],
      created_at: at,
      first_reply_at: null,
      last_activity_at: at,
      closed_at: null,
      messages: [],
      tours: [],
      extra_party_ids: [],
    };
    db.inquiries.push(q);
    linkToInquiry(c, q);
    logHistory("inquiry", q.id, `대화로 문의 만듦 · ${c.subject}`);
    return { ok: true, inquiry_id: q.id, party_id: party.id };
  }),

  route("GET /api/leases/conversation-candidates", ({ query }) => {
    const db = getDB();
    const c = findConv(db, String(query.get("conversation_id") ?? ""));
    return candidatesFor(db, c);
  }),
];
