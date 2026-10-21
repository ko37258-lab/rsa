import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ko } from "date-fns/locale";

/** 1234000 → "1,234,000원" */
export function won(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 1234000 → "123.4만" (표·타일용 짧은 금액) */
export function man(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = n / 10000;
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2).replace(/\.?0+$/, "")}억`;
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`;
}

/** 숫자에 천 단위 쉼표 */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("ko-KR");
}

/** 0.873 → "87.3%" */
export function pct(r: number | null | undefined, digits = 1): string {
  if (r === null || r === undefined || Number.isNaN(r) || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(digits)}%`;
}

function toDate(d: string | Date): Date {
  return typeof d === "string" ? parseISO(d) : d;
}

/** 날짜 포맷(한국어 로케일). 기본 "yyyy.M.d" */
export function fmt(d: string | Date | null | undefined, pattern = "yyyy.M.d"): string {
  if (!d) return "—";
  return format(toDate(d), pattern, { locale: ko });
}

/** "2026-10-21" → "10.21 (화)" */
export function dayLabel(d: string | null | undefined): string {
  return fmt(d, "M.d (EEE)");
}

/** 오늘 기준 "D-3", "D+5", "오늘" */
export function dDay(d: string | null | undefined, today: string): string {
  if (!d) return "—";
  const n = differenceInCalendarDays(parseISO(d), parseISO(today));
  if (n === 0) return "오늘";
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

/** 분 → "35분", "3시간 10분", "2일" */
export function minutes(m: number | null | undefined): string {
  if (m === null || m === undefined || Number.isNaN(m)) return "—";
  if (m < 60) return `${Math.round(m)}분`;
  if (m < 60 * 24) {
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return r ? `${h}시간 ${r}분` : `${h}시간`;
  }
  return `${(m / 60 / 24).toFixed(1)}일`;
}

/** 시각 "10.21 14:05" */
export function timeLabel(iso: string | null | undefined): string {
  return fmt(iso, "M.d HH:mm");
}

/** "010-1234-5678" → "010-****-5678" */
export function maskPhone(p: string): string {
  return p.replace(/(\d{2,3})-(\d{3,4})-(\d{4})/, "$1-****-$3");
}

/** "홍길동" → "홍*동" */
export function maskName(n: string): string {
  if (n.length <= 1) return n;
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** CSV 문자열로 내려받기(엑셀에서 한글 깨짐 방지용 BOM 포함) */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null>>): void {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
