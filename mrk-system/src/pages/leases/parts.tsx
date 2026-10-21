import { differenceInCalendarMonths } from "date-fns";
import { Badge, CodeBadge } from "@/components/ui";
import { LEASE_STATUS } from "@/lib/codes";
import { daysBetween, p, plusDays } from "@/lib/dates";
import { fmt } from "@/lib/format";
import type { PartyCard } from "@/types";
import type { LeaseRow } from "./types";

export function LeaseStatusBadge({ status }: { status: LeaseRow["status"] }) {
  return <CodeBadge code={LEASE_STATUS[status]} />;
}

/** 계약 기간을 "6개월" 처럼 */
export function termLabel(start: string, end: string): string {
  const months = differenceInCalendarMonths(p(plusDays(end, 1)), p(start));
  const exact = plusDays(end, 1).slice(8) === start.slice(8);
  if (months >= 1 && exact) return `${months}개월`;
  return `${daysBetween(start, end) + 1}일`;
}

/** 상태 옆에 붙이는 한 줄 설명 — 지금 무엇을 기다리는지 */
export function leaseNote(l: LeaseRow, today: string): string | null {
  const last = l.move_out_date && l.move_out_date < l.end_date ? l.move_out_date : l.end_date;
  switch (l.status) {
    case "draft":
      return "서명 요청 전";
    case "awaiting_signature": {
      const d = daysBetween(l.created_at.slice(0, 10), today);
      return d >= 1 ? `요청 ${d}일째` : "오늘 요청";
    }
    case "concluded":
      if (l.money.overdue > 0) return "계약금·잔금 대기";
      return l.move_in_date ? `${fmt(l.move_in_date, "M.d")} 입주` : "입주 일정 미정";
    case "move_in_confirmed":
      return l.move_in_date && l.move_in_date < today ? "입주일 지남" : `${fmt(l.move_in_date ?? l.start_date, "M.d")} 입주`;
    case "occupied": {
      const left = daysBetween(today, l.end_date);
      if (left < 0) return "만료일 지남";
      if (left <= 30) return `${fmt(l.end_date, "M.d")} 만료 · 연장 확인`;
      return null;
    }
    case "closing":
      return last < today ? "퇴실함 · 정산 중" : `${fmt(last, "M.d")} 퇴실 예정`;
    default:
      return null;
  }
}

/** 이름 + 법인 표시 */
export function PartyName({ party, sub }: { party: PartyCard | null; sub?: string | null }) {
  if (!party) return <span className="text-ink3">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{party.name}</span>
      {party.kind === "corporation" && <Badge tone="navy" dot={false}>법인</Badge>}
      {sub && <span className="truncate text-xs text-ink3">{sub}</span>}
    </span>
  );
}

/** 상태 필터: 원본 목록의 묶음과 같게 */
export const LEASE_FILTERS = [
  { value: "open", label: "진행 중", statuses: ["draft", "awaiting_signature", "concluded", "move_in_confirmed", "occupied", "closing"] },
  { value: "awaiting_signature", label: "서명 대기", statuses: ["draft", "awaiting_signature"] },
  { value: "upcoming", label: "입주 예정", statuses: ["concluded", "move_in_confirmed"] },
  { value: "occupied", label: "거주 중", statuses: ["occupied"] },
  { value: "closing", label: "퇴실·정산", statuses: ["closing"] },
  { value: "ended", label: "끝남", statuses: ["closed", "cancelled"] },
  { value: "all", label: "전체", statuses: [] },
] as const;
export type LeaseFilter = (typeof LEASE_FILTERS)[number]["value"];

export function filterOf(v: string | null): LeaseFilter {
  if (!v) return "open";
  const hit = LEASE_FILTERS.find((f) => f.value === v);
  if (hit) return hit.value;
  // ?status=concluded 처럼 상태 이름이 오면 그 상태가 든 묶음
  const byStatus = LEASE_FILTERS.find((f) => f.value !== "open" && (f.statuses as readonly string[]).includes(v));
  return byStatus?.value ?? "open";
}

export function matchesFilter(status: LeaseRow["status"], f: LeaseFilter): boolean {
  const def = LEASE_FILTERS.find((x) => x.value === f)!;
  return def.statuses.length === 0 || (def.statuses as readonly string[]).includes(status);
}
