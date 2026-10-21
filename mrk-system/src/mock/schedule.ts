/**
 * 청구 일정 계산 — 원본 PMS 의 청구 규칙을 그대로 옮긴 것.
 *
 * - 입주일 기준(anniversary): 입주일부터 한 달씩 끊는다. 선불은 기간 첫날, 후불은 기간 다음 날 청구.
 * - 달력 기준(calendar): 달력 월로 끊고 청구일(bill_day)에 청구한다.
 *   선불은 그 달치를 직전 청구일에, 후불은 지난 달치를 다음 청구일에 청구한다.
 *   청구일이 그 달에 없으면 말일. 첫 달·마지막 달은 그 달 실제 일수로 일할한다(prorate).
 * - 관리비 고지서 청구(mgmt_mode "bill")는 늘 후불이고, 금액은 고지서가 오면 넣는다.
 * - 할인은 깎는 항목(음수)으로 같은 기간에 붙는다.
 * - 납기 = 청구일 + due_days.
 */
import type { Lease } from "@/types";
import { daysBetween, monthDays, monthEnd, monthStart, plusDays, plusMonth, plusMonths, ym } from "@/lib/dates";

export interface ScheduleLine {
  kind: "rent" | "mgmt" | "discount";
  label: string;
  amount: number; // 원(일할 반영, 10원 단위 반올림). 할인은 음수
  period_from: string;
  period_to: string;
  days: number | null; // 일할이면 사용 일수
  month_days: number | null;
  bill_date: string;
  due_date: string;
  needs_amount: boolean;
}

/** 그 달의 청구일(그 달에 없으면 말일) */
export function billDayIn(month: string, day: number): string {
  const last = monthDays(month);
  return `${month}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

interface Period {
  from: string;
  to: string;
  days: number;
  full_days: number; // 일할 분모(달력: 그 달 일수, 입주일 기준: 그 기간 한 달의 일수)
  partial: boolean;
}

function periods(l: Lease): Period[] {
  const end = l.move_out_date && l.move_out_date < l.end_date ? l.move_out_date : l.end_date;
  const out: Period[] = [];
  if (l.cycle === "calendar") {
    let m = ym(l.start_date);
    while (monthStart(m) <= end) {
      const from = l.start_date > monthStart(m) ? l.start_date : monthStart(m);
      const to = end < monthEnd(m) ? end : monthEnd(m);
      const days = daysBetween(from, to) + 1;
      out.push({ from, to, days, full_days: monthDays(m), partial: days < monthDays(m) });
      m = plusMonth(m, 1);
    }
    return out;
  }
  for (let k = 0; k < 600; k++) {
    const from = plusMonths(l.start_date, k);
    if (from > end) break;
    const fullTo = plusDays(plusMonths(l.start_date, k + 1), -1);
    const to = end < fullTo ? end : fullTo;
    const full = daysBetween(from, fullTo) + 1;
    const days = daysBetween(from, to) + 1;
    out.push({ from, to, days, full_days: full, partial: days < full });
  }
  return out;
}

function billDate(l: Lease, p: Period, mode: Lease["billing_mode"]): string {
  if (l.cycle === "calendar") {
    if (mode === "prepaid") {
      const prev = billDayIn(plusMonth(ym(p.from), -1), l.due_day);
      return prev > l.start_date ? prev : l.start_date; // 계약 전 청구일이면 입주일에
    }
    return billDayIn(plusMonth(ym(p.from), 1), l.due_day);
  }
  return mode === "prepaid" ? p.from : plusDays(p.to, 1);
}

const monthLabel = (d: string) => `${Number(d.slice(5, 7))}월`;

/** 계약 전체 기간의 청구 줄(월세·관리비·할인) */
export function scheduleLines(l: Lease): ScheduleLine[] {
  const lines: ScheduleLine[] = [];
  periods(l).forEach((p, i) => {
    const ratio = l.prorate && p.partial ? p.days / p.full_days : 1;
    const prorated = ratio !== 1;
    const meta = { period_from: p.from, period_to: p.to, days: prorated ? p.days : null, month_days: prorated ? p.full_days : null };
    const rentBill = billDate(l, p, l.billing_mode);
    const due = (b: string) => plusDays(b, l.due_days);
    lines.push({ kind: "rent", label: `${monthLabel(p.from)} 월세`, amount: round10(l.rent * ratio), ...meta, bill_date: rentBill, due_date: due(rentBill), needs_amount: false });
    if (l.mgmt_mode === "bill") {
      const b = billDate(l, p, "postpaid");
      lines.push({ kind: "mgmt", label: `${monthLabel(p.from)} 관리비(고지서)`, amount: 0, ...meta, bill_date: b, due_date: due(b), needs_amount: true });
    } else if (l.mgmt_fee > 0) {
      lines.push({ kind: "mgmt", label: `${monthLabel(p.from)} 관리비`, amount: round10(l.mgmt_fee * ratio), ...meta, bill_date: rentBill, due_date: due(rentBill), needs_amount: false });
    }
    for (const d of l.discounts) {
      if (d.months !== null && i >= d.months) continue;
      lines.push({ kind: "discount", label: d.label || "할인", amount: -round10(d.amount * ratio), ...meta, bill_date: rentBill, due_date: due(rentBill), needs_amount: false });
    }
  });
  return lines;
}

/** 청구일이 그 달인 줄만 */
export function linesBilledIn(l: Lease, month: string): ScheduleLine[] {
  return scheduleLines(l).filter((x) => ym(x.bill_date) === month);
}

/** 계약 기간 전체에 낼 월세·관리비 합(남은 총임대료 계산용) */
export function remainingAfter(l: Lease, date: string): { rent: number; mgmt: number } {
  let rent = 0;
  let mgmt = 0;
  for (const x of scheduleLines(l)) {
    if (x.period_from <= date) continue;
    if (x.kind === "mgmt") mgmt += x.amount;
    else rent += x.amount;
  }
  return { rent, mgmt };
}

export interface RentCap {
  /** 지금 월세가 정해진 날(사슬에서 마지막으로 월세가 바뀐 계약의 시작일) */
  rent_since: string;
  renewal_start: string;
  can_raise: boolean;
  raise_from: string; // 이날부터 인상 가능
  cap_rent: number | null; // 5% 상한(천 원 단위 내림)
  prev_rent: number;
  text: string;
}

/**
 * 연장 시 임대료 인상 상한(원본 /api/leases/:id/rent-cap, 주택임대차보호법 5% 상한).
 * prevChain = [직전 계약, 그 전 계약, …] (재계약 사슬을 거꾸로)
 */
export function rentCap(prevChain: Lease[], renewalStart: string): RentCap | null {
  const prev = prevChain[0];
  if (!prev) return null;
  let since = prev.start_date;
  for (let i = 1; i < prevChain.length; i++) {
    if (prevChain[i].rent !== prev.rent) break;
    since = prevChain[i].start_date;
  }
  const raiseFrom = plusMonths(since, 12);
  const can = renewalStart >= raiseFrom;
  const cap = can ? Math.floor((prev.rent * 1.05) / 1000) * 1000 : null;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const d = (s: string) => `${s.slice(2, 4)}.${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
  return {
    rent_since: since,
    renewal_start: renewalStart,
    can_raise: can,
    raise_from: raiseFrom,
    cap_rent: cap,
    prev_rent: prev.rent,
    text: can
      ? `연장 시작 ${d(renewalStart)}은 1년 지남 → 5% 이내 인상 가능 · 상한 ${won(cap as number)}`
      : `연장 시작 ${d(renewalStart)}은 1년 안 됨(인상은 ${d(raiseFrom)}부터) → 인상 불가`,
  };
}
