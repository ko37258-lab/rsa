import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import type { DateStr, MonthStr } from "@/types";

/** 날짜 문자열 다루기 — 모든 날짜는 "yyyy-MM-dd" 로 오간다 */
export const ymd = (d: Date): DateStr => format(d, "yyyy-MM-dd");
export const ym = (d: Date | DateStr): MonthStr => (typeof d === "string" ? d.slice(0, 7) : format(d, "yyyy-MM"));
export const p = (d: DateStr): Date => parseISO(d);

export const plusDays = (d: DateStr, n: number): DateStr => ymd(addDays(p(d), n));
export const plusMonths = (d: DateStr, n: number): DateStr => ymd(addMonths(p(d), n));
export const daysBetween = (a: DateStr, b: DateStr): number => differenceInCalendarDays(p(b), p(a));

export const monthStart = (m: MonthStr): DateStr => `${m}-01`;
export const monthEnd = (m: MonthStr): DateStr => ymd(endOfMonth(p(`${m}-01`)));
export const monthDays = (m: MonthStr): number => daysBetween(monthStart(m), monthEnd(m)) + 1;
export const plusMonth = (m: MonthStr, n: number): MonthStr => ym(addMonths(p(`${m}-01`), n));
export const thisMonth = (today: DateStr): MonthStr => ym(startOfMonth(p(today)));

/** [a1,a2] 와 [b1,b2] 가 하루라도 겹치는 일수 (끝 포함) */
export function overlapDays(a1: DateStr, a2: DateStr, b1: DateStr, b2: DateStr): number {
  const s = a1 > b1 ? a1 : b1;
  const e = a2 < b2 ? a2 : b2;
  return s > e ? 0 : daysBetween(s, e) + 1;
}

/** 오늘 날짜(브라우저 시간대) */
export const todayStr = (): DateStr => ymd(new Date());
