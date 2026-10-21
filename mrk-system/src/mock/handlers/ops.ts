/**
 * 운영 영역 Mock API: 대시보드 · 분석 · 인사이트 · 운영 준비 · 정합성 · Q&A · 운영정책 · 응대 자료.
 * 숫자는 모두 Mock DB 에서 바로 계산한다(다른 영역 API 를 부르지 않는다).
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, nowIso, today } from "../db";
import {
  indexDB, inBranch, occupancy, payerBalances, unitToday, revenueByMonth, isSigned, leaseLastDay, holdsUnitOn, chargePaid, isBilled,
  operatedUnits, type Index,
} from "../logic";
import { logHistory } from "./common";
import { LOST_REASONS } from "@/lib/codes";
import { daysBetween, monthDays, monthEnd, monthStart, overlapDays, plusDays, plusMonth, thisMonth } from "@/lib/dates";
import type { DB, Inquiry, Lease, Policy, PreparedFile, QaItem, ReplyTemplate, Signature, Unit } from "@/types";
import type {
  AnalyticsRes, BranchCompare, DashboardRes, FunnelStep, HeatCell, Insight, IntegrityCheck, IntegrityRes, IntegrityRun, MonthStat,
  MoveRow, PolicyRow, QaRes, QaRow, ReadinessRes, ReadinessRow, ReplyBucket, SourceRow, TileId, Tile, TypeLoss,
} from "@/pages/dashboard/ops-api";

// ── 공통 도우미 ──────────────────────────────────────────
const branchName = (db: DB, id: string | null) => db.branches.find((b) => b.id === id)?.name ?? "지점 미정";
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pctText = (r: number) => `${(r * 100).toFixed(1)}%`;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 열린 상담(아직 체결·결렬로 닫히지 않음) */
const isOpenInquiry = (q: Inquiry) => q.closed_at === null && q.stage !== "lost" && q.stage !== "concluded";
/** 고객이 마지막으로 말한 상담 = 답장 대기 */
const isAwaiting = (q: Inquiry) => q.closed_at === null && q.messages.length > 0 && q.messages[q.messages.length - 1].direction === "inbound";

/** ISO 시각 → 한국 시간 기준 요일(0=월)·시·날짜 */
function kst(iso: string): { weekday: number; hour: number; date: string } {
  const d = new Date(Date.parse(iso) + 9 * 3600_000);
  return { weekday: (d.getUTCDay() + 6) % 7, hour: d.getUTCHours(), date: d.toISOString().slice(0, 10) };
}
const kstDate = (iso: string) => kst(iso).date;

/** 계약 기간(개월, 반올림) */
const termMonths = (l: Lease) => Math.max(1, Math.round((daysBetween(l.start_date, l.end_date) + 1) / 30.44));

/** 재계약으로 이어진(다음 계약이 있는) 계약 id */
function renewedIds(db: DB): Set<string> {
  return new Set(db.leases.filter((l) => l.renewal_of && l.status !== "cancelled").map((l) => l.renewal_of as string));
}

/** 호실의 [from,to] 중 계약이 덮은 날수 (include: 어떤 계약을 셀지) */
function coveredDays(ix: Index, unitId: string, from: string, to: string, include: (l: Lease) => boolean): number {
  if (from > to) return 0;
  let n = 0;
  for (const l of ix.leasesByUnit.get(unitId) ?? []) {
    if (!include(l)) continue;
    n += overlapDays(l.start_date, leaseLastDay(l), from, to);
  }
  return Math.min(n, daysBetween(from, to) + 1);
}

const listRentOf = (ix: Index, u: Unit) => (u.unit_type_id ? ix.type.get(u.unit_type_id)?.list_rent : undefined) ?? u.asking_price?.rent ?? 0;

/** 상담 하나가 거친 단계 */
function reached(ix: Index, q: Inquiry) {
  const leases = q.lease_ids.map((id) => ix.lease.get(id)).filter((l): l is Lease => !!l);
  const concluded = q.stage === "concluded" || leases.some((l) => isSigned(l));
  const signing = concluded || q.stage === "signing" || leases.some((l) => l.status !== "draft");
  const drafting = signing || q.stage === "drafting" || leases.length > 0;
  const tour = q.tours.length > 0 || q.stage === "tour";
  return { tour, drafting, signing, concluded, leases };
}

const replyMinutes = (q: Inquiry) => (q.first_reply_at ? Math.max(0, (Date.parse(q.first_reply_at) - Date.parse(q.created_at)) / 60000) : null);

// ── 대시보드 ────────────────────────────────────────────
function dashboard(db: DB, b: string | null): DashboardRes {
  const ix = indexDB(db);
  const t = today();
  const m = thisMonth(t);
  const week = plusDays(t, 6);
  const units = db.units.filter(inBranch(b));
  const operated = operatedUnits(db, b);
  const leases = db.leases.filter(inBranch(b)).filter((l) => l.status !== "cancelled" && l.status !== "draft");
  const inquiries = db.inquiries.filter(inBranch(b));
  const unitCode = (id: string) => ix.unit.get(id)?.code ?? "?";

  const states = units.map((u) => unitToday(db, ix, u, t));
  const vacant = states.filter((s) => s.state === "vacant").length;
  const moveInsWeek = leases.filter((l) => !l.renewal_of && l.start_date >= t && l.start_date <= week);
  const expiringWeek = leases.filter((l) => (l.status === "occupied" || l.status === "closing") && leaseLastDay(l) >= t && leaseLastDay(l) <= week);
  const openInq = inquiries.filter(isOpenInquiry);
  const awaiting = inquiries.filter(isAwaiting);
  const unassigned = openInq.filter((q) => !q.assignee_id);
  const sig = leases.filter((l) => l.status === "awaiting_signature");
  const unscheduled = leases.filter((l) => l.status === "concluded" && !l.move_in_date);
  const late = leases.filter((l) => (l.status === "concluded" || l.status === "move_in_confirmed") && l.start_date < t);
  const draftCharges = db.charges.filter(inBranch(b)).filter((c) => c.status === "draft" && c.month === m);
  const invoices = new Set(draftCharges.map((c) => c.payer_id));
  const balances = payerBalances(db, ix, b, t);
  // 상단 알림과 같은 기준: 납기 3일 지난 미납
  const overdue = balances.filter((x) => x.unpaid > 0 && x.overdue_days >= 3);
  const bank = db.payments.filter(inBranch(b)).filter((p) => p.status === "unmatched");

  const tiles: Record<TileId, Tile> = {
    units_free: { value: vacant, note: `운영 ${operated.length}실 중` },
    move_ins_week: { value: moveInsWeek.length, note: `오늘 ${moveInsWeek.filter((l) => l.start_date === t).length}건` },
    expiring_week: { value: expiringWeek.length, note: "만료일 7일 안" },
    inquiries_awaiting: { value: awaiting.length, note: "고객이 마지막으로 말함" },
    inquiries_unassigned: { value: unassigned.length, note: "진행 중 상담 중" },
    inquiries_open: { value: openInq.filter((q) => q.kind === "inquiry").length, note: `생활문의 ${openInq.filter((q) => q.kind === "life").length}건 별도` },
    awaiting_signature: { value: sig.length, note: sig.length ? `가장 오래 ${Math.max(...sig.map((l) => daysBetween(kstDate(l.created_at), t)))}일` : "보낸 계약서 없음" },
    unscheduled: { value: unscheduled.length, note: "체결 후" },
    move_ins_late: { value: late.length, note: "아직 입주 예정" },
    invoices_to_send: { value: invoices.size, note: `${Number(m.slice(5))}월 청구 ${draftCharges.length}줄` },
    overdue: { value: overdue.length, note: overdue.length ? won(overdue.reduce((s, x) => s + x.unpaid, 0)) : "납기 3일 지난 미납 없음" },
    bank_open: { value: bank.length, note: bank.length ? won(bank.reduce((s, p) => s + p.amount, 0)) : "모두 맞춤" },
  };

  const renewed = renewedIds(db);
  const moveRow = (l: Lease, kind: "in" | "out"): MoveRow => ({
    kind,
    lease_id: l.id,
    unit_id: l.unit_id,
    unit_code: unitCode(l.unit_id),
    branch_name: branchName(db, l.branch_id),
    name: ix.party.get(l.contractor_id)?.name ?? "—",
    date: kind === "in" ? l.start_date : leaseLastDay(l),
    status: l.status,
  });
  const ins = leases.filter((l) => !l.renewal_of && l.start_date >= t && l.start_date <= week).map((l) => moveRow(l, "in"));
  const outs = leases
    .filter((l) => !renewed.has(l.id) && (l.status === "occupied" || l.status === "closing") && leaseLastDay(l) >= t && leaseLastDay(l) <= week)
    .map((l) => moveRow(l, "out"));
  const moves = [...ins, ...outs].sort((a, c) => a.date.localeCompare(c.date) || a.unit_code.localeCompare(c.unit_code));

  let branches: BranchCompare[] | null = null;
  if (!b || b === "all") {
    branches = db.branches.map((br) => {
      const op = operatedUnits(db, br.id);
      const st = db.units.filter((u) => u.branch_id === br.id).map((u) => unitToday(db, ix, u, t));
      const occ = st.filter((s) => s.state === "occupied").length;
      const ov = balances.filter((x) => x.unpaid > 0 && x.overdue_days >= 3 && x.lease_ids.some((id) => ix.lease.get(id)?.branch_id === br.id));
      return {
        id: br.id,
        name: br.name,
        units: op.length,
        occupancy_today: op.length ? occ / op.length : null,
        contract_rate_month: occupancy(db, br.id, monthStart(m), monthEnd(m), t).contract_rate,
        vacant: st.filter((s) => s.state === "vacant").length,
        overdue: ov.length,
        overdue_amount: ov.reduce((s, x) => s + x.unpaid, 0),
        awaiting: db.inquiries.filter((q) => q.branch_id === br.id).filter(isAwaiting).length,
      };
    });
  }

  return {
    as_of: t,
    month: m,
    operated_units: operated.length,
    tiles,
    moves_today: moves.filter((x) => x.date === t),
    moves_week: moves.filter((x) => x.date !== t),
    branches,
  };
}

// ── 분석 ──────────────────────────────────────────────
function monthStats(db: DB, ix: Index, b: string | null, t: string): MonthStat[] {
  const cur = thisMonth(t);
  const months = Array.from({ length: 12 }, (_, i) => plusMonth(cur, i - 11));
  const operated = operatedUnits(db, b);
  const rev = revenueByMonth(db, b);
  const renewed = renewedIds(db);
  const leases = db.leases.filter(inBranch(b));
  const inquiries = db.inquiries.filter(inBranch(b)).filter((q) => q.kind === "inquiry");
  const charges = db.charges.filter(inBranch(b)).filter(isBilled);
  const payments = db.payments.filter(inBranch(b)).filter((p) => p.status !== "skipped");
  const leaseIdsInBranch = new Set(leases.map((l) => l.id));
  const settlements = db.settlements.filter((s) => leaseIdsInBranch.has(s.lease_id));

  return months.map((m) => {
    const from = monthStart(m);
    const to = monthEnd(m);
    const realizedTo = to < t ? to : t;
    const occ = occupancy(db, b, from, to, t);
    const r = rev.get(m) ?? { rent: 0, other: 0 };

    // 공실 손실: 운영 중인데 체결 계약 없는 호실-일 × 룸타입 정가 ÷ 그 달 일수 (오늘까지)
    let loss = 0;
    if (from <= realizedTo) {
      for (const u of operated) {
        const days = daysBetween(from, realizedTo) + 1;
        const vacantDays = days - coveredDays(ix, u.id, from, realizedTo, isSigned);
        loss += (vacantDays * listRentOf(ix, u)) / monthDays(m);
      }
    }
    // AMR: 그 달 계약 호실의 정가 월세 평균(겹친 날수 가중)
    let amrNum = 0;
    let amrDen = 0;
    for (const l of leases) {
      if (!isSigned(l)) continue;
      const d = overlapDays(l.start_date, leaseLastDay(l), from, to);
      if (!d) continue;
      amrNum += l.list_rent * d;
      amrDen += d;
    }
    const inqMonth = inquiries.filter((q) => kstDate(q.created_at).slice(0, 7) === m);
    const outs = leases.filter((l) => (l.status === "closing" || l.status === "closed") && !renewed.has(l.id) && leaseLastDay(l).slice(0, 7) === m && leaseLastDay(l) <= t);
    const stayDays = outs.map((l) => {
      // 재계약 사슬 처음부터 센다
      let first: Lease = l;
      let guard = 0;
      while (first.renewal_of && guard++ < 10) {
        const prev = ix.lease.get(first.renewal_of);
        if (!prev) break;
        first = prev;
      }
      return daysBetween(first.start_date, leaseLastDay(l)) + 1;
    });
    return {
      month: m,
      operated_units: operated.length,
      occupancy: occ.occupancy,
      contract_rate: occ.contract_rate,
      rent_revenue: r.rent,
      other_revenue: r.other,
      revpar: operated.length ? r.rent / operated.length : null,
      amr: amrDen ? amrNum / amrDen : null,
      vacancy_loss: Math.round(loss),
      inquiries: inqMonth.length,
      concluded: inqMonth.filter((q) => reached(ix, q).concluded).length,
      move_ins: leases.filter((l) => !l.renewal_of && l.start_date.slice(0, 7) === m && l.start_date <= t && (l.status === "occupied" || l.status === "closing" || l.status === "closed")).length,
      move_outs: outs.length,
      deposits_billed: charges.filter((c) => (c.kind === "deposit" || c.kind === "contract_fee") && c.due_date.slice(0, 7) === m).reduce((s, c) => s + c.amount, 0),
      received: payments.filter((p) => kstDate(p.received_at).slice(0, 7) === m).reduce((s, p) => s + p.amount, 0),
      refunded: settlements.filter((s) => s.refunded_at && kstDate(s.refunded_at).slice(0, 7) === m).reduce((s, x) => s + x.refund_amount, 0),
      overdue_now: charges.filter((c) => c.due_date.slice(0, 7) === m && c.due_date <= t).reduce((s, c) => s + Math.max(0, c.amount - chargePaid(ix, c)), 0),
      stay_days_avg: stayDays.length ? stayDays.reduce((s, x) => s + x, 0) / stayDays.length : null,
    };
  });
}

function forward(db: DB, ix: Index, b: string | null, t: string): AnalyticsRes["forward"] {
  const operated = operatedUnits(db, b);
  const daily: Array<{ date: string; rate: number }> = [];
  for (let d = 0; d < 90; d++) {
    const date = plusDays(t, d);
    let held = 0;
    for (const u of operated) if ((ix.leasesByUnit.get(u.id) ?? []).some((l) => holdsUnitOn(l, date))) held++;
    daily.push({ date, rate: operated.length ? held / operated.length : 0 });
  }
  const buckets = [0, 30, 60].map((s) => {
    const part = daily.slice(s, s + 30);
    return { start: part[0].date, end: part[part.length - 1].date, rate: part.length ? part.reduce((x, p) => x + p.rate, 0) / part.length : null };
  });
  return { daily, buckets };
}

function typeLoss(db: DB, ix: Index, b: string | null, t: string): TypeLoss[] {
  const operated = operatedUnits(db, b);
  const groups = new Map<string, Unit[]>();
  for (const u of operated) {
    const k = u.unit_type_id ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  const past1 = plusDays(t, -90);
  const past2 = plusDays(t, -1);
  const next2 = plusDays(t, 29);
  const anyHold = (l: Lease) => l.status !== "cancelled" && l.status !== "draft";
  const rows: TypeLoss[] = [];
  for (const [k, us] of groups) {
    const type = k === "none" ? null : ix.type.get(k);
    const rents = us.map((u) => listRentOf(ix, u));
    const med = median(rents) ?? 0;
    let past = 0;
    let next = 0;
    let vacantNow = 0;
    for (const u of us) {
      past += 90 - coveredDays(ix, u.id, past1, past2, isSigned);
      next += 30 - coveredDays(ix, u.id, t, next2, anyHold);
      const s = unitToday(db, ix, u, t).state;
      if (s === "vacant" || s === "hold") vacantNow++;
    }
    rows.push({
      unit_type_id: type?.id ?? null,
      name: type?.name ?? "룸타입 없음",
      branch_name: type ? branchName(db, type.branch_id) : null,
      units: us.length,
      list_rent: med,
      vacant_now: vacantNow,
      loss_past_90: Math.round((past * med) / 30),
      loss_next_30: Math.round((next * med) / 30),
    });
  }
  return rows.sort((a, c) => c.loss_next_30 - a.loss_next_30 || c.loss_past_90 - a.loss_past_90);
}

function inquiryAnalytics(db: DB, ix: Index, b: string | null, t: string, since: string) {
  const inqs = db.inquiries.filter(inBranch(b)).filter((q) => q.kind === "inquiry" && kstDate(q.created_at) >= since);
  const reach = inqs.map((q) => ({ q, r: reached(ix, q), min: replyMinutes(q) }));

  const counts = {
    new: reach.length,
    tour: reach.filter((x) => x.r.tour).length,
    drafting: reach.filter((x) => x.r.drafting).length,
    signing: reach.filter((x) => x.r.signing).length,
    concluded: reach.filter((x) => x.r.concluded).length,
  };
  const ratio = (a: number, c: number) => (c ? a / c : null);
  const funnel: FunnelStep[] = [
    { stage: "new", label: "문의", count: counts.new, rate_from_prev: null },
    { stage: "tour", label: "투어", count: counts.tour, rate_from_prev: ratio(counts.tour, counts.new) },
    { stage: "drafting", label: "계약 작성", count: counts.drafting, rate_from_prev: ratio(counts.drafting, counts.new) },
    { stage: "signing", label: "서명 요청", count: counts.signing, rate_from_prev: ratio(counts.signing, counts.drafting) },
    { stage: "concluded", label: "체결", count: counts.concluded, rate_from_prev: ratio(counts.concluded, counts.signing) },
  ];

  const bucketDefs: Array<[ReplyBucket["id"], string, (m: number | null) => boolean]> = [
    ["lt1h", "1시간 안", (m) => m !== null && m <= 60],
    ["lt24h", "1~24시간", (m) => m !== null && m > 60 && m <= 1440],
    ["gt24h", "24시간 넘음", (m) => m !== null && m > 1440],
    ["none", "답장 기록 없음", (m) => m === null],
  ];
  const buckets: ReplyBucket[] = bucketDefs.map(([id, label, f]) => {
    const xs = reach.filter((x) => f(x.min));
    const c = xs.filter((x) => x.r.concluded).length;
    return { id, label, inquiries: xs.length, concluded: c, rate: xs.length ? c / xs.length : null };
  });
  const medianReply = median(reach.map((x) => x.min).filter((m): m is number => m !== null));

  // 결렬 사유 · 결렬한 달 (최근 6개월)
  const cur = thisMonth(t);
  const lostMonths = Array.from({ length: 6 }, (_, i) => plusMonth(cur, i - 5));
  const lostAll = db.inquiries.filter(inBranch(b)).filter((q) => q.kind === "inquiry" && q.stage === "lost");
  const reasons = [...LOST_REASONS];
  for (const q of lostAll) if (q.lost_reason && !reasons.includes(q.lost_reason)) reasons.push(q.lost_reason);
  const lost = {
    reasons,
    months: lostMonths.map((m) => {
      const xs = lostAll.filter((q) => kstDate(q.closed_at ?? q.last_activity_at).slice(0, 7) === m);
      return { month: m, counts: reasons.map((r) => xs.filter((q) => (q.lost_reason ?? "기타") === r).length) };
    }),
  };

  // 유입경로
  const srcRow = (group: string, xs: typeof reach): SourceRow => {
    const concluded = xs.filter((x) => x.r.concluded);
    const leases = concluded.flatMap((x) => x.r.leases.filter(isSigned));
    const value = leases.reduce((s, l) => s + l.list_rent * termMonths(l), 0);
    const toConclude = concluded
      .map((x) => {
        const first = x.r.leases.filter(isSigned).sort((a, c) => (a.signed_at ?? a.created_at).localeCompare(c.signed_at ?? c.created_at))[0];
        return first ? Math.max(0, daysBetween(kstDate(x.q.created_at), kstDate(first.signed_at ?? first.created_at))) : null;
      })
      .filter((d): d is number => d !== null);
    return {
      group,
      inquiries: xs.length,
      concluded: leases.length,
      contract_value: value,
      term_months_avg: leases.length ? leases.reduce((s, l) => s + termMonths(l), 0) / leases.length : null,
      days_to_conclude: median(toConclude),
      per_inquiry: xs.length ? value / xs.length : null,
    };
  };
  const groupsSeen = [...new Set(reach.map((x) => x.q.source_group))];
  const sources = groupsSeen.map((g) => srcRow(g, reach.filter((x) => x.q.source_group === g))).sort((a, c) => c.inquiries - a.inquiries);
  const sources_total = srcRow("전체", reach);

  // 요일·시간 열지도
  const cell = (): { n: number; c: number; mins: number[] } => ({ n: 0, c: 0, mins: [] });
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, cell));
  const inH = cell();
  const outH = cell();
  for (const x of reach) {
    const k = kst(x.q.created_at);
    const g = grid[k.weekday][k.hour];
    const target = k.weekday < 5 && k.hour >= 9 && k.hour < 18 ? inH : outH;
    for (const c of [g, target]) {
      c.n++;
      if (x.r.concluded) c.c++;
      if (x.min !== null) c.mins.push(x.min);
    }
  }
  const toCell = (c: { n: number; c: number; mins: number[] }): HeatCell => ({ inquiries: c.n, concluded: c.c, median_minutes: median(c.mins) });

  return {
    funnel,
    reply: { buckets, median_minutes: medianReply },
    lost,
    sources,
    sources_total,
    heat: { cells: grid.map((row) => row.map(toCell)), in_hours: toCell(inH), out_hours: toCell(outH) },
  };
}

function analytics(db: DB, b: string | null): AnalyticsRes {
  const ix = indexDB(db);
  const t = today();
  const since = plusDays(t, -182);
  return {
    as_of: t,
    since,
    months: monthStats(db, ix, b, t),
    forward: forward(db, ix, b, t),
    type_loss: typeLoss(db, ix, b, t),
    ...inquiryAnalytics(db, ix, b, t, since),
  };
}

// ── MR.K 인사이트 ─────────────────────────────────────────
function insights(db: DB, b: string | null): Insight[] {
  const ix = indexDB(db);
  const t = today();
  const out: Insight[] = [];

  // 1. 앞으로 30일 공실 손실이 가장 큰 룸타입
  const tl = typeLoss(db, ix, b, t);
  const worst = tl[0];
  if (worst && worst.loss_next_30 > 0) {
    out.push({
      id: "type_loss",
      tone: worst.loss_next_30 >= 1_500_000 ? "bad" : "warn",
      title: `앞으로 30일 공실 손실이 가장 큰 룸타입은 ${(!b || b === "all") && worst.branch_name ? `${worst.branch_name.replace("MR.K ", "")} ` : ""}${worst.name}`,
      body: `${worst.units}실 중 지금 빈 방 ${worst.vacant_now}실. 이대로면 30일 동안 약 ${won(worst.loss_next_30)}을 못 번다. 모집가를 낮추거나 단기 계약을 열어 본다.`,
      metric: won(worst.loss_next_30),
      to: "/units",
    });
  }

  // 2. 오래 기다린 답장 — 첫 답장 속도별 체결률을 같이 보여준다
  const awaiting = db.inquiries.filter(inBranch(b)).filter(isAwaiting);
  const since = plusDays(t, -182);
  const ia = inquiryAnalytics(db, ix, b, t, since);
  const fast = ia.reply.buckets.find((x) => x.id === "lt1h");
  const slow = ia.reply.buckets.find((x) => x.id === "gt24h");
  const speedNote =
    fast?.rate != null && slow?.rate != null ? ` 최근 6개월 첫 답장 1시간 안 체결률 ${pctText(fast.rate)}, 24시간 넘으면 ${pctText(slow.rate)}.` : "";
  if (awaiting.length) {
    const waits = awaiting.map((q) => (Date.now() - Date.parse(q.messages[q.messages.length - 1].at)) / 3600_000);
    const longest = Math.max(...waits);
    const over24 = waits.filter((h) => h >= 24).length;
    out.push({
      id: "awaiting",
      tone: over24 ? "bad" : "warn",
      title: over24 ? `24시간 넘게 답장 못 한 상담 ${over24}건` : `답장 기다리는 상담 ${awaiting.length}건`,
      body: `가장 오래 기다린 고객은 ${longest >= 24 ? `${Math.floor(longest / 24)}일` : `${Math.max(1, Math.round(longest))}시간`}째다.${speedNote}`,
      metric: `${awaiting.length}건`,
      to: "/inquiries?status=awaiting",
    });
  }

  // 3. 연체 30일 + 보증금 대비 위험
  const bal = payerBalances(db, ix, b, t).filter((x) => x.unpaid > 0);
  const long = bal.filter((x) => x.overdue_days > 30);
  const risky = bal.filter((x) => x.unpaid > x.deposit_held);
  if (long.length || risky.length) {
    out.push({
      id: "overdue",
      tone: risky.length ? "bad" : "warn",
      title: risky.length ? `보증금보다 미납이 많은 납부자 ${risky.length}명` : `30일 넘게 연체한 납부자 ${long.length}명`,
      body: `30일 넘은 연체 ${long.length}명, 미납 합계 ${won(long.reduce((s, x) => s + x.unpaid, 0))}. 보증금으로 덮지 못하는 금액은 ${won(risky.reduce((s, x) => s + x.unpaid - x.deposit_held, 0))}이다.`,
      metric: won(bal.reduce((s, x) => s + x.unpaid, 0)),
      to: "/collections?filter=overdue",
    });
  }

  // 4. 만료 30일 안인데 연장·퇴실 미정
  const undecided = undecidedLeases(db, ix, b, t);
  if (undecided.length) {
    out.push({
      id: "renewal",
      tone: "warn",
      title: `만료 30일 안, 연장·퇴실을 정하지 않은 계약 ${undecided.length}건`,
      body: `가장 빠른 만료는 ${ix.unit.get(undecided[0].unit_id)?.code}호 ${undecided[0].end_date.slice(5).replace("-", ".")}. 지금 연장 의사를 물어야 빈 날 없이 다음 계약을 잡는다.`,
      metric: `${undecided.length}건`,
      to: "/leases",
    });
  }

  // 5. 점유율 전월 대비
  const cur = thisMonth(t);
  const now = occupancy(db, b, monthStart(cur), monthEnd(cur), t).occupancy;
  const prevM = plusMonth(cur, -1);
  const prev = occupancy(db, b, monthStart(prevM), monthEnd(prevM), t).occupancy;
  if (now !== null && prev !== null) {
    const diff = (now - prev) * 100;
    out.push({
      id: "occupancy",
      tone: diff >= 0.5 ? "good" : diff <= -1 ? "warn" : "info",
      title: `이번 달 점유율 ${pctText(now)} · 전월 대비 ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%p`,
      body:
        diff >= 0.5
          ? "빈 방이 줄고 있다. 다음 달 만료 호실의 연장률을 지키면 흐름이 이어진다."
          : diff <= -1
            ? "빈 방이 늘었다. 공실 손실이 큰 룸타입부터 모집가와 노출 채널을 점검한다."
            : `지난달(${pctText(prev)})과 거의 같다. 앞으로 90일 계약율로 다음 달 흐름을 미리 본다.`,
      metric: pctText(now),
      to: "/dashboard#occupancy",
    });
  }

  // 6. 문의 1건의 값이 가장 높은 유입경로
  const best = ia.sources.filter((s) => s.inquiries >= 5 && s.per_inquiry).sort((a, c) => (c.per_inquiry ?? 0) - (a.per_inquiry ?? 0))[0];
  if (best) {
    out.push({
      id: "source",
      tone: "good",
      title: `문의 1건의 값이 가장 높은 유입경로는 ${best.group}`,
      body: `최근 6개월 문의 ${best.inquiries}건에서 체결 ${best.concluded}건, 문의 1건당 ${won(best.per_inquiry ?? 0)}. 광고·노출 예산을 이 경로에 더 싣는 것을 검토한다.`,
      metric: won(best.per_inquiry ?? 0),
    });
  }

  // 7. 끝나 가는 홀드
  const holds = db.blocks.filter((k) => k.kind === "hold" && k.hold_expires_at && kstDate(k.hold_expires_at) >= t && kstDate(k.hold_expires_at) <= plusDays(t, 1));
  const holdInBranch = holds.filter((h) => {
    const u = ix.unit.get(h.unit_id);
    return u && inBranch(b)(u);
  });
  if (holdInBranch.length) {
    out.push({
      id: "hold",
      tone: "info",
      title: `내일까지 끝나는 홀드 ${holdInBranch.length}건`,
      body: `${holdInBranch.map((h) => `${ix.unit.get(h.unit_id)?.code}호`).join(", ")}. 고객 결정이 없으면 홀드가 풀려 다시 판매된다.`,
      metric: `${holdInBranch.length}건`,
      to: "/units",
    });
  }

  // 8. 서명 지연
  const sig = db.leases.filter(inBranch(b)).filter((l) => l.status === "awaiting_signature" && daysBetween(kstDate(l.created_at), t) >= 3);
  if (sig.length) {
    out.push({
      id: "signature",
      tone: "info",
      title: `3일 넘게 서명하지 않은 계약 ${sig.length}건`,
      body: "서명 요청 메일을 다시 보내거나 전화로 확인한다. 서명 대기 계약도 방을 잡고 있다.",
      metric: `${sig.length}건`,
      to: "/leases?status=awaiting_signature",
    });
  }

  const order = { bad: 0, warn: 1, info: 2, good: 3 } as const;
  return out.sort((a, c) => order[a.tone] - order[c.tone]).slice(0, 8);
}

/** 만료 30일 안인데 연장·퇴실을 정하지 않은 거주 중 계약(만료 빠른 순) */
function undecidedLeases(db: DB, ix: Index, b: string | null, t: string): Lease[] {
  const renewed = renewedIds(db);
  return db.leases
    .filter(inBranch(b))
    .filter((l) => {
      if (l.status !== "occupied" || l.move_out_date) return false;
      if (l.end_date < t || l.end_date > plusDays(t, 30)) return false;
      if (renewed.has(l.id)) return false;
      const next = (ix.leasesByUnit.get(l.unit_id) ?? []).some((x) => x.id !== l.id && x.status !== "cancelled" && x.start_date > l.end_date);
      return !next;
    })
    .sort((a, c) => a.end_date.localeCompare(c.end_date));
}

// ── 운영 준비 ─────────────────────────────────────────
const DEPOSIT_KINDS = ["deposit", "contract_fee"];

function readiness(db: DB, b: string | null): ReadinessRes {
  const ix = indexDB(db);
  const t = today();
  const until = monthEnd(thisMonth(t));
  const units = db.units.filter(inBranch(b));
  const renewed = renewedIds(db);
  const rows: ReadinessRow[] = [];
  const counts = { deposit_short: 0, unpaid: 0, qa: 0, renewal: 0 };

  for (const u of units) {
    const ls = (ix.leasesByUnit.get(u.id) ?? []).filter(
      (l) => ["concluded", "move_in_confirmed", "occupied", "closing"].includes(l.status) && l.start_date <= until && leaseLastDay(l) >= t,
    );
    if (!ls.length) continue;
    const lease = ls.find((l) => l.start_date <= t) ?? ls[0];

    // 보증금·계약금 미수: 재계약이면 보증금을 받은 원 계약까지 거슬러 본다
    let depShort = 0;
    let cur: Lease | undefined = lease;
    let guard = 0;
    while (cur && guard++ < 10) {
      const deps = (ix.chargesByLease.get(cur.id) ?? []).filter((c) => DEPOSIT_KINDS.includes(c.kind) && isBilled(c));
      if (deps.length) {
        depShort = deps.filter((c) => c.due_date <= t).reduce((s, c) => s + Math.max(0, c.amount - chargePaid(ix, c)), 0);
        break;
      }
      cur = cur.renewal_of ? ix.lease.get(cur.renewal_of) : undefined;
    }

    // 월세·관리비 미납
    let unpaid = 0;
    let unpaidDays = 0;
    for (const c of ix.chargesByLease.get(lease.id) ?? []) {
      if (!isBilled(c) || DEPOSIT_KINDS.includes(c.kind) || c.due_date > t) continue;
      const left = c.amount - chargePaid(ix, c);
      if (left > 0) {
        unpaid += left;
        unpaidDays = Math.max(unpaidDays, daysBetween(c.due_date, t));
      }
    }

    const confirm = (kind: "deposit_short" | "unpaid", amount: number) => db.readiness_confirms.find((r) => r.lease_id === lease.id && r.kind === kind && r.amount === amount) ?? null;
    const depConf = depShort > 0 ? confirm("deposit_short", depShort) : null;
    const unpConf = unpaid > 0 ? confirm("unpaid", unpaid) : null;
    const qas = db.qa.filter((q) => q.lease_id === lease.id && (q.state === "open" || q.state === "answered"));
    const renewal =
      lease.status === "occupied" && !lease.move_out_date && lease.end_date >= t && lease.end_date <= plusDays(t, 30) && !renewed.has(lease.id) &&
      !(ix.leasesByUnit.get(u.id) ?? []).some((x) => x.id !== lease.id && x.status !== "cancelled" && x.start_date > lease.end_date)
        ? { end_date: lease.end_date, days_left: daysBetween(t, lease.end_date) }
        : null;

    const left: string[] = [];
    if (depShort > 0 && !depConf) left.push(`보증금 미수 ${won(depShort)}`);
    if (unpaid > 0 && !unpConf) left.push(`미납 ${won(unpaid)}`);
    if (qas.length) left.push(`질문 ${qas.length}`);
    if (renewal) left.push("연장·퇴실 미정");
    if (depShort > 0 && !depConf) counts.deposit_short++;
    if (unpaid > 0 && !unpConf) counts.unpaid++;
    if (qas.length) counts.qa++;
    if (renewal) counts.renewal++;

    rows.push({
      unit_id: u.id,
      unit_code: u.code,
      branch_id: u.branch_id,
      branch_name: branchName(db, u.branch_id),
      lease_id: lease.id,
      lease_status: lease.status,
      contractor_name: ix.party.get(lease.contractor_id)?.name ?? "—",
      start_date: lease.start_date,
      end_date: lease.end_date,
      deposit_short: { amount: depShort, confirmed: !!depConf, reason: depConf?.reason ?? null },
      unpaid: { amount: unpaid, confirmed: !!unpConf, reason: unpConf?.reason ?? null, days: unpaidDays },
      qa: { count: qas.length, blocks_invoice: qas.some((q) => q.blocks_invoice) },
      renewal,
      hold: qas.some((q) => q.blocks_invoice),
      ready: left.length === 0,
      left,
    });
  }
  rows.sort((a, c) => Number(a.ready) - Number(c.ready) || a.branch_name.localeCompare(c.branch_name) || a.unit_code.localeCompare(c.unit_code));
  return {
    as_of: t,
    until,
    total_units: units.length,
    contracted_units: rows.length,
    ready_count: rows.filter((r) => r.ready).length,
    counts,
    rows,
  };
}

// ── 정합성 ─────────────────────────────────────────────
const integrityRuns: IntegrityRun[] = [];

interface CheckDef {
  id: string;
  label: string;
  description: string;
  severity: "critical" | "warning";
  run: (db: DB, ix: Index, t: string) => Array<{ text: string; to?: string }>;
}

const CHECKS: CheckDef[] = [
  {
    id: "lease_overlap",
    label: "한 호실에 겹치는 계약",
    description: "같은 호실에 서명 대기 이후 계약 둘이 같은 날을 잡고 있다.",
    severity: "critical",
    run: (_db, ix) => {
      const out: Array<{ text: string; to?: string }> = [];
      for (const [uid, ls] of ix.leasesByUnit) {
        const act = ls.filter((l) => l.status !== "cancelled" && l.status !== "draft");
        for (let i = 0; i < act.length; i++)
          for (let j = i + 1; j < act.length; j++)
            if (overlapDays(act[i].start_date, leaseLastDay(act[i]), act[j].start_date, leaseLastDay(act[j])) > 0)
              out.push({ text: `${ix.unit.get(uid)?.code}호 · ${act[i].start_date}~${leaseLastDay(act[i])} ↔ ${act[j].start_date}~${leaseLastDay(act[j])}`, to: `/leases/${act[j].id}` });
      }
      return out;
    },
  },
  {
    id: "signed_no_charge",
    label: "체결했는데 청구가 없는 계약",
    description: "첫 청구 달이 된(시작일이 이번 달 이전인) 진행 중 계약에 청구 줄이 하나도 없다.",
    severity: "critical",
    run: (db, ix, t) =>
      db.leases
        .filter((l) => ["concluded", "move_in_confirmed", "occupied", "closing"].includes(l.status) && l.start_date.slice(0, 7) <= t.slice(0, 7))
        .filter((l) => !(ix.chargesByLease.get(l.id) ?? []).length)
        .map((l) => ({ text: `${ix.unit.get(l.unit_id)?.code}호 · ${ix.party.get(l.contractor_id)?.name ?? "—"} (${l.start_date} 시작)`, to: `/leases/${l.id}` })),
  },
  {
    id: "alloc_over_charge",
    label: "청구 금액보다 많이 배분",
    description: "한 청구에 배분된 입금 합이 청구 금액을 넘는다.",
    severity: "critical",
    run: (db, ix) =>
      db.charges
        .filter((c) => chargePaid(ix, c) > c.amount)
        .map((c) => ({ text: `${c.label} · 청구 ${won(c.amount)} / 배분 ${won(chargePaid(ix, c))}`, to: c.lease_id ? `/leases/${c.lease_id}` : undefined })),
  },
  {
    id: "alloc_over_payment",
    label: "입금보다 많이 배분",
    description: "한 입금에서 나간 배분 합이 입금액을 넘는다.",
    severity: "critical",
    run: (db) => {
      const used = new Map<string, number>();
      for (const a of db.allocations) used.set(a.payment_id, (used.get(a.payment_id) ?? 0) + a.amount);
      return db.payments.filter((p) => (used.get(p.id) ?? 0) > p.amount).map((p) => ({ text: `${p.depositor_name} · 입금 ${won(p.amount)} / 배분 ${won(used.get(p.id) ?? 0)}`, to: "/collections?view=receipts" }));
    },
  },
  {
    id: "charge_no_payer",
    label: "납부자 없는 청구",
    description: "청구의 납부자가 고객 목록에 없다.",
    severity: "critical",
    run: (db, ix) => db.charges.filter((c) => !ix.party.has(c.payer_id)).map((c) => ({ text: `${c.label} ${won(c.amount)} (${c.due_date})` })),
  },
  {
    id: "occupied_no_movein",
    label: "거주 중인데 입주일 없음",
    description: "계약 상태는 거주 중인데 입주일이 비어 있다.",
    severity: "warning",
    run: (db, ix) => db.leases.filter((l) => l.status === "occupied" && !l.move_in_date).map((l) => ({ text: `${ix.unit.get(l.unit_id)?.code}호 · ${ix.party.get(l.contractor_id)?.name ?? "—"}`, to: `/leases/${l.id}` })),
  },
  {
    id: "occupied_expired",
    label: "만료됐는데 거주 중",
    description: "만료일이 지났는데 퇴실 처리가 안 된 계약.",
    severity: "warning",
    run: (db, ix, t) => db.leases.filter((l) => l.status === "occupied" && l.end_date < t).map((l) => ({ text: `${ix.unit.get(l.unit_id)?.code}호 · ${l.end_date} 만료`, to: `/leases/${l.id}` })),
  },
  {
    id: "closed_no_settlement",
    label: "보증금을 받았는데 정산 없이 끝난 계약",
    description: "보증금·계약금을 받은 계약이 재계약 없이 끝났는데 정산 기록이 없다.",
    severity: "warning",
    run: (db, ix) => {
      const renewed = renewedIds(db);
      const settled = new Set(db.settlements.map((s) => s.lease_id));
      return db.leases
        .filter((l) => l.status === "closed" && !renewed.has(l.id) && !settled.has(l.id))
        .filter((l) => (ix.chargesByLease.get(l.id) ?? []).some((c) => DEPOSIT_KINDS.includes(c.kind) && chargePaid(ix, c) > 0))
        .map((l) => ({ text: `${ix.unit.get(l.unit_id)?.code}호 · ${ix.party.get(l.contractor_id)?.name ?? "—"} (${l.end_date} 끝)`, to: `/leases/${l.id}` }));
    },
  },
  {
    id: "closed_unpaid",
    label: "끝났는데 미납이 남은 계약",
    description: "계약은 끝났는데 납기 지난 청구가 다 안 들어왔다.",
    severity: "warning",
    run: (db, ix, t) =>
      db.leases
        .filter((l) => l.status === "closed")
        .map((l) => ({ l, left: (ix.chargesByLease.get(l.id) ?? []).filter((c) => isBilled(c) && c.due_date <= t && c.kind !== "cleaning").reduce((s, c) => s + Math.max(0, c.amount - chargePaid(ix, c)), 0) }))
        .filter((x) => x.left > 0)
        .map((x) => ({ text: `${ix.unit.get(x.l.unit_id)?.code}호 · ${ix.party.get(x.l.contractor_id)?.name ?? "—"} 미납 ${won(x.left)}`, to: `/leases/${x.l.id}` })),
  },
  {
    id: "unit_no_type",
    label: "룸타입 없는 호실",
    description: "룸타입이 없으면 공실 손실·정가 계산에서 빠진다.",
    severity: "warning",
    run: (db) => db.units.filter((u) => !u.unit_type_id).map((u) => ({ text: `${u.code}호`, to: `/units/${u.id}` })),
  },
  {
    id: "on_sale_no_price",
    label: "모집가 없는 판매 호실",
    description: "판매 중인데 모집가가 비어 있어 문의 고객에게 가격을 안내할 수 없다.",
    severity: "warning",
    run: (db) => db.units.filter((u) => u.sale_status === "on_sale" && !u.asking_price).map((u) => ({ text: `${branchName(db, u.branch_id)} ${u.code}호`, to: `/units/${u.id}` })),
  },
  {
    id: "stale_unmatched",
    label: "7일 넘게 안 맞춘 입금",
    description: "받은 지 7일이 넘었는데 납부자를 맞추지 않은 입금.",
    severity: "warning",
    run: (db, _ix, t) =>
      db.payments.filter((p) => p.status === "unmatched" && daysBetween(kstDate(p.received_at), t) > 7).map((p) => ({ text: `${p.depositor_name} ${won(p.amount)} (${kstDate(p.received_at)})`, to: "/collections?view=receipts" })),
  },
];

function runIntegrity(db: DB): IntegrityCheck[] {
  const ix = indexDB(db);
  const t = today();
  return CHECKS.map((c) => {
    try {
      const rows = c.run(db, ix, t);
      return { id: c.id, label: c.label, description: c.description, severity: c.severity, violations: rows.length, samples: rows.slice(0, 8) };
    } catch (e) {
      return { id: c.id, label: c.label, description: c.description, severity: c.severity, violations: 0, samples: [], error: e instanceof Error ? e.message : "검사 실패" };
    }
  }).sort((a, c) => Number(c.violations > 0) - Number(a.violations > 0) || (a.severity === c.severity ? 0 : a.severity === "critical" ? -1 : 1) || c.violations - a.violations);
}

function recordRun(checks: IntegrityCheck[]): IntegrityRun {
  const run: IntegrityRun = {
    at: nowIso(),
    total: checks.reduce((s, c) => s + c.violations, 0),
    failing: checks.filter((c) => c.violations > 0).length,
    by: Object.fromEntries(checks.map((c) => [c.id, c.violations])),
  };
  integrityRuns.unshift(run);
  integrityRuns.splice(30);
  return run;
}

// ── Q&A ─────────────────────────────────────────────
function qaRow(db: DB, ix: Index, q: QaItem): QaRow {
  const l = q.lease_id ? ix.lease.get(q.lease_id) : undefined;
  return {
    ...q,
    branch_name: branchName(db, q.branch_id),
    unit_id: l?.unit_id ?? null,
    lease_status: l?.status ?? null,
    contractor_name: l ? ix.party.get(l.contractor_id)?.name ?? null : null,
  };
}

// ── 정책 코드 ───────────────────────────────────────────
const CATEGORY_PREFIX: Record<string, string> = { 계약: "LEASE", 청구: "BILL", 수납: "PAY", 정산: "SETTLE", 운영: "OPS" };
function nextPolicyCode(db: DB, scope: Policy["scope"], branchId: string | null, category: string): string {
  const prefix = scope === "지점" ? db.branches.find((b) => b.id === branchId)?.code ?? "BR" : CATEGORY_PREFIX[category] ?? "ETC";
  const nums = db.policies.filter((p) => p.code.startsWith(`${prefix}-`)).map((p) => Number(p.code.split("-")[1]) || 0);
  return `${prefix}-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}

/** 지점 자료: "all"·빈 값이면 전부, 아니면 공통(null) + 그 지점 */
const forBranch = (b: string | null) => (x: { branch_id: string | null }) => !b || b === "all" || x.branch_id === null || x.branch_id === b;

const text = (v: unknown, what: string, max = 4000): string => {
  const s = String(v ?? "").trim();
  if (!s) throw new HttpError(400, `${what}을(를) 적는다`);
  if (s.length > max) throw new HttpError(400, `${what}이(가) 너무 길다`);
  return s;
};
const optBranch = (db: DB, v: unknown): string | null => {
  if (v === null || v === undefined || v === "" || v === "all") return null;
  must(db.branches.find((b) => b.id === v), "지점");
  return String(v);
};

// ── 경로 ──────────────────────────────────────────────
export const opsRoutes: Route[] = [
  route("GET /api/dashboard", ({ query }) => dashboard(getDB(), query.get("branch_id"))),
  route("GET /api/analytics", ({ query }) => analytics(getDB(), query.get("branch_id"))),
  route("GET /api/insights", ({ query }) => insights(getDB(), query.get("branch_id"))),

  route("GET /api/readiness", ({ query }) => readiness(getDB(), query.get("branch_id"))),
  route("POST /api/readiness/confirm", ({ body }) => {
    const db = getDB();
    const lease = must(db.leases.find((l) => l.id === body?.lease_id), "계약");
    const kind = body?.kind;
    if (kind !== "deposit_short" && kind !== "unpaid") throw new HttpError(400, "확정할 항목이 잘못됐다");
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "확정할 금액이 없다");
    const reason = text(body?.reason, "근거", 500);
    db.readiness_confirms = db.readiness_confirms.filter((r) => !(r.lease_id === lease.id && r.kind === kind));
    const rec = { id: newId("rc"), lease_id: lease.id, kind, amount, reason, at: nowIso() } as const;
    db.readiness_confirms.push({ ...rec });
    logHistory("lease", lease.id, `${kind === "unpaid" ? "월세·관리비 미납" : "보증금·선납 미수"} ${won(amount)}을 받지 못한 돈으로 확정 — ${reason}`);
    return rec;
  }),

  route("GET /api/integrity", () => {
    const db = getDB();
    const checks = runIntegrity(db);
    if (!integrityRuns.length) recordRun(checks);
    const res: IntegrityRes = { ran_at: integrityRuns[0].at, checks, runs: integrityRuns };
    return res;
  }),
  route("POST /api/integrity/run", () => {
    const checks = runIntegrity(getDB());
    const run = recordRun(checks);
    const res: IntegrityRes = { ran_at: run.at, checks, runs: integrityRuns };
    return res;
  }),

  // Q&A
  route("GET /api/qa", ({ query }) => {
    const db = getDB();
    const ix = indexDB(db);
    const b = query.get("branch_id");
    const state = query.get("state");
    const all = db.qa.filter(inBranch(b));
    const counts = {
      open: all.filter((q) => q.state === "open").length,
      answered: all.filter((q) => q.state === "answered").length,
      resolved: all.filter((q) => q.state === "confirmed" || q.state === "auto_closed").length,
    };
    const pick = state === "open" ? ["open"] : state === "answered" ? ["answered"] : state === "resolved" ? ["confirmed", "auto_closed"] : null;
    const rows = all
      .filter((q) => !pick || pick.includes(q.state))
      .map((q) => qaRow(db, ix, q))
      .sort((a, c) => c.created_at.localeCompare(a.created_at));
    const res: QaRes = { rows, counts };
    return res;
  }),
  route("POST /api/qa", ({ body }) => {
    const db = getDB();
    const lease = body?.lease_id ? must(db.leases.find((l) => l.id === body.lease_id), "계약") : null;
    const branchId = lease?.branch_id ?? optBranch(db, body?.branch_id);
    if (!branchId) throw new HttpError(400, "지점을 고른다");
    const item: QaItem = {
      id: newId("qa"),
      branch_id: branchId,
      lease_id: lease?.id ?? null,
      unit_code: lease ? db.units.find((u) => u.id === lease.unit_id)?.code ?? null : null,
      topic: text(body?.topic ?? "운영", "주제", 20),
      question: text(body?.question, "질문", 2000),
      answer: null,
      state: "open",
      created_at: nowIso(),
      answered_at: null,
      blocks_invoice: !!body?.blocks_invoice,
    };
    db.qa.push(item);
    if (lease) logHistory("lease", lease.id, `Q&A 질문: ${item.question.slice(0, 40)}`);
    return item;
  }),
  route("POST /api/qa/:id/answer", ({ params, body }) => {
    const db = getDB();
    const q = must(db.qa.find((x) => x.id === params.id), "질문");
    const answer = text(body?.answer, "답", 4000);
    q.answer = answer;
    q.answered_at = nowIso();
    q.state = body?.confirm ? "confirmed" : "answered";
    if (body?.confirm) q.blocks_invoice = false;
    if (q.lease_id && body?.confirm) logHistory("lease", q.lease_id, `Q&A 답 확정: ${answer.slice(0, 40)}`);
    return q;
  }),
  route("POST /api/qa/:id/reopen", ({ params }) => {
    const q = must(getDB().qa.find((x) => x.id === params.id), "질문");
    q.state = q.answer ? "answered" : "open";
    return q;
  }),

  // 운영정책
  ...["GET /api/qa/policies", "GET /api/policies"].map((spec) =>
    route(spec, ({ query }) => {
      const db = getDB();
      const b = query.get("branch_id");
      const rows: PolicyRow[] = db.policies
        .filter(forBranch(b))
        .map((p) => ({ ...p, branch_name: p.branch_id ? branchName(db, p.branch_id) : null }))
        .sort((a, c) => a.code.localeCompare(c.code));
      return rows;
    }),
  ),
  route("POST /api/policies", ({ body }) => {
    const db = getDB();
    const scope: Policy["scope"] = body?.scope === "지점" ? "지점" : "공통";
    const branch_id = scope === "지점" ? optBranch(db, body?.branch_id) : null;
    if (scope === "지점" && !branch_id) throw new HttpError(400, "지점 정책은 지점을 고른다");
    const category = text(body?.category ?? "운영", "분류", 20);
    const code = String(body?.code ?? "").trim() || nextPolicyCode(db, scope, branch_id, category);
    if (db.policies.some((p) => p.code === code)) throw new HttpError(409, `${code} 는 이미 있는 정책 ID`);
    const p: Policy = {
      id: newId("po"),
      code,
      scope,
      branch_id,
      category,
      title: text(body?.title, "제목", 120),
      body: text(body?.body, "정책 내용"),
      basis: String(body?.basis ?? "").trim(),
      state: body?.state === "confirmed" ? "confirmed" : "draft",
      version: 1,
      updated_at: nowIso(),
    };
    db.policies.push(p);
    return p;
  }),
  route("PATCH /api/policies/:id", ({ params, body }) => {
    const db = getDB();
    const p = must(db.policies.find((x) => x.id === params.id), "정책");
    const nextTitle = body?.title !== undefined ? text(body.title, "제목", 120) : p.title;
    const nextBody = body?.body !== undefined ? text(body.body, "정책 내용") : p.body;
    if (nextTitle !== p.title || nextBody !== p.body) p.version += 1;
    p.title = nextTitle;
    p.body = nextBody;
    if (body?.basis !== undefined) p.basis = String(body.basis).trim();
    if (body?.category !== undefined) p.category = text(body.category, "분류", 20);
    if (body?.state === "confirmed" || body?.state === "draft") p.state = body.state;
    p.updated_at = nowIso();
    return p;
  }),

  // 응대 자료: 정형 답변
  route("GET /api/reply-templates", ({ query }) =>
    getDB()
      .templates.filter(forBranch(query.get("branch_id")))
      .sort((a, c) => Number(a.branch_id !== null) - Number(c.branch_id !== null) || a.title.localeCompare(c.title)),
  ),
  route("POST /api/reply-templates", ({ body }) => {
    const db = getDB();
    const tp: ReplyTemplate = {
      id: newId("tp"),
      branch_id: optBranch(db, body?.branch_id),
      title: text(body?.title, "제목", 80),
      shortcut: String(body?.shortcut ?? "").trim().replace(/^\//, "").slice(0, 20),
      body: text(body?.body, "본문"),
      updated_at: nowIso(),
    };
    db.templates.push(tp);
    return tp;
  }),
  route("PATCH /api/reply-templates/:id", ({ params, body }) => {
    const db = getDB();
    const tp = must(db.templates.find((x) => x.id === params.id), "정형 답변");
    if (body?.title !== undefined) tp.title = text(body.title, "제목", 80);
    if (body?.body !== undefined) tp.body = text(body.body, "본문");
    if (body?.shortcut !== undefined) tp.shortcut = String(body.shortcut).trim().replace(/^\//, "").slice(0, 20);
    if (body?.branch_id !== undefined) tp.branch_id = optBranch(db, body.branch_id);
    tp.updated_at = nowIso();
    return tp;
  }),
  route("DELETE /api/reply-templates/:id", ({ params }) => {
    const db = getDB();
    const i = db.templates.findIndex((x) => x.id === params.id);
    if (i < 0) throw new HttpError(404, "정형 답변을 찾지 못했다");
    db.templates.splice(i, 1);
    return { ok: true };
  }),

  // 응대 자료: 준비된 파일(이름·크기만 기록)
  route("GET /api/prepared-files", ({ query }) =>
    getDB()
      .files.filter(forBranch(query.get("branch_id")))
      .sort((a, c) => c.updated_at.localeCompare(a.updated_at)),
  ),
  route("POST /api/prepared-files", ({ body }) => {
    const db = getDB();
    const name = text(body?.name, "파일 이름", 200);
    const kind: PreparedFile["kind"] = body?.kind === "image" || body?.kind === "doc" ? body.kind : /\.(png|jpe?g|gif|webp|zip)$/i.test(name) ? "image" : /\.pdf$/i.test(name) ? "pdf" : "doc";
    const f: PreparedFile = { id: newId("f"), branch_id: optBranch(db, body?.branch_id), name, size: Math.max(0, Number(body?.size) || 0), kind, updated_at: nowIso() };
    db.files.push(f);
    return f;
  }),
  route("DELETE /api/prepared-files/:id", ({ params }) => {
    const db = getDB();
    const i = db.files.findIndex((x) => x.id === params.id);
    if (i < 0) throw new HttpError(404, "파일을 찾지 못했다");
    db.files.splice(i, 1);
    return { ok: true };
  }),

  // 응대 자료: 서명
  route("GET /api/reply-signatures", ({ query }) =>
    getDB()
      .signatures.filter(forBranch(query.get("branch_id")))
      .sort((a, c) => Number(a.branch_id !== null) - Number(c.branch_id !== null)),
  ),
  route("POST /api/reply-signatures", ({ body }) => {
    const db = getDB();
    const branch_id = optBranch(db, body?.branch_id);
    const body_ko = text(body?.body_ko, "한국어 서명", 1000);
    const body_en = String(body?.body_en ?? "").trim() || null;
    const existing = db.signatures.find((s) => s.branch_id === branch_id);
    if (existing) {
      existing.body_ko = body_ko;
      existing.body_en = body_en;
      return existing;
    }
    const sg: Signature = { id: newId("sg"), branch_id, body_ko, body_en };
    db.signatures.push(sg);
    return sg;
  }),
  route("PATCH /api/reply-signatures/:id", ({ params, body }) => {
    const sg = must(getDB().signatures.find((x) => x.id === params.id), "서명");
    if (body?.body_ko !== undefined) sg.body_ko = text(body.body_ko, "한국어 서명", 1000);
    if (body?.body_en !== undefined) sg.body_en = String(body.body_en ?? "").trim() || null;
    return sg;
  }),
  route("DELETE /api/reply-signatures/:id", ({ params }) => {
    const db = getDB();
    const i = db.signatures.findIndex((x) => x.id === params.id);
    if (i < 0) throw new HttpError(404, "서명을 찾지 못했다");
    if (db.signatures[i].branch_id === null) throw new HttpError(400, "공통 서명은 지우지 못한다. 내용을 고친다");
    db.signatures.splice(i, 1);
    return { ok: true };
  }),
];

