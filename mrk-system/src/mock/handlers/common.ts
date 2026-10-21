import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, resetDB, today } from "../db";
import { indexDB, inBranch, payerBalances, unitToday } from "../logic";
import { LEASE_STATUS, INQUIRY_STAGE, CHARGE_KIND, CHANNEL, SOURCES, LOST_REASONS, VAT_MODE, NATIONALITY } from "@/lib/codes";
import { daysBetween, plusDays } from "@/lib/dates";
import type { Memo } from "@/types";

/** 모든 화면이 같이 쓰는 API: 로그인 사용자 · 지점 · 코드 · 알림 · 메모 */
export const commonRoutes: Route[] = [
  route("GET /api/me", () => ({ ...getDB().me, today: today() })),

  route("GET /api/staff", () => getDB().staff),

  route("GET /api/branches", () => {
    const db = getDB();
    return db.branches.map((b) => ({ ...b, unit_count: db.units.filter((u) => u.branch_id === b.id).length }));
  }),

  route("GET /api/branches/:id/buildings", ({ params }) => getDB().buildings.filter(inBranch(params.id))),

  route("GET /api/branches/:id/unit-types", ({ params }) => getDB().unit_types.filter(inBranch(params.id))),

  route("GET /api/codes", () => ({
    lease_status: LEASE_STATUS,
    inquiry_stage: INQUIRY_STAGE,
    charge_kind: CHARGE_KIND,
    channel: CHANNEL,
    sources: SOURCES,
    lost_reasons: LOST_REASONS,
    vat_mode: VAT_MODE,
    nationality: NATIONALITY,
  })),

  /** 상단 종 모양 알림: 지금 손이 가야 하는 일 */
  route("GET /api/alerts", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const t = today();
    const b = query.get("branch_id");
    const alerts: Array<{ id: string; tone: "bad" | "warn" | "info"; text: string; to: string }> = [];
    const awaiting = db.inquiries.filter(inBranch(b)).filter((q) => q.closed_at === null && q.messages.length && q.messages[q.messages.length - 1].direction === "inbound");
    if (awaiting.length) alerts.push({ id: "inq", tone: "warn", text: `답장 대기 상담 ${awaiting.length}건`, to: "/inquiries?status=awaiting" });
    const overdue = payerBalances(db, ix, b, t).filter((x) => x.unpaid > 0 && x.overdue_days >= 3);
    if (overdue.length) alerts.push({ id: "overdue", tone: "bad", text: `연체 납부자 ${overdue.length}명`, to: "/collections?filter=overdue" });
    const unmatched = db.payments.filter(inBranch(b)).filter((p) => p.status === "unmatched");
    if (unmatched.length) alerts.push({ id: "bank", tone: "warn", text: `안 맞춘 입금 ${unmatched.length}건`, to: "/collections?view=receipts" });
    const sig = db.leases.filter(inBranch(b)).filter((l) => l.status === "awaiting_signature" && daysBetween(l.created_at.slice(0, 10), t) >= 3);
    if (sig.length) alerts.push({ id: "sig", tone: "info", text: `3일 넘게 서명 안 한 계약 ${sig.length}건`, to: "/leases?status=awaiting_signature" });
    const holds = db.blocks.filter((k) => k.kind === "hold" && k.hold_expires_at && k.hold_expires_at.slice(0, 10) <= plusDays(t, 1));
    const holdUnits = holds.map((h) => ix.unit.get(h.unit_id)).filter((u) => u && inBranch(b)(u));
    if (holdUnits.length) alerts.push({ id: "hold", tone: "info", text: `내일까지 끝나는 홀드 ${holdUnits.length}건`, to: "/units" });
    const free = db.units.filter(inBranch(b)).filter((u) => unitToday(db, ix, u, t).state === "vacant").length;
    return { alerts, units_free: free };
  }),

  /** 메모 — 호실·상담·계약·고객 공통. kinds = units | inquiries | leases | customers */
  route("GET /api/:kinds/:id/memos", ({ params }) => {
    const kind = kindOf(params.kinds);
    return getDB()
      .memos.filter((m) => m.target_kind === kind && m.target_id === params.id)
      .sort((a, b) => b.at.localeCompare(a.at));
  }),
  route("POST /api/:kinds/:id/memos", ({ params, body }) => {
    const db = getDB();
    const text = String(body?.body ?? "").trim();
    if (!text) throw new HttpError(400, "메모 내용을 적는다");
    const memo: Memo = { id: newId("mm"), target_kind: kindOf(params.kinds), target_id: params.id, body: text, author: db.me.name, at: nowIso() };
    db.memos.push(memo);
    return memo;
  }),
  route("DELETE /api/memos/:id", ({ params }) => {
    const db = getDB();
    const i = db.memos.findIndex((m) => m.id === params.id);
    must(i >= 0 ? db.memos[i] : null, "메모");
    db.memos.splice(i, 1);
    return { ok: true };
  }),

  /** 변경 이력 */
  route("GET /api/:kinds/:id/history", ({ params }) => {
    const kind = kindOf(params.kinds);
    return getDB()
      .history.filter((h) => h.target_kind === kind && h.target_id === params.id)
      .sort((a, b) => b.at.localeCompare(a.at));
  }),

  /** 시연 데이터 초기화 */
  route("POST /api/demo/reset", () => {
    resetDB();
    return { ok: true };
  }),
];

function kindOf(kinds: string): Memo["target_kind"] {
  const m: Record<string, Memo["target_kind"]> = { units: "unit", inquiries: "inquiry", leases: "lease", customers: "customer" };
  const k = m[kinds];
  if (!k) throw new HttpError(404, "알 수 없는 대상");
  return k;
}

/** 다른 핸들러에서 이력을 남길 때 쓴다 */
export function logHistory(kind: Memo["target_kind"], targetId: string, text: string): void {
  const db = getDB();
  db.history.push({ id: newId("h"), target_kind: kind, target_id: targetId, at: nowIso(), author: db.me.name, text });
}
