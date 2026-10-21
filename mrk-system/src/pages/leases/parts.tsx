import { useState } from "react";
import { differenceInCalendarMonths } from "date-fns";
import { Copy } from "lucide-react";
import { Badge, Button, CodeBadge, Textarea } from "@/components/ui";
import { LEASE_STATUS } from "@/lib/codes";
import { daysBetween, p, plusDays } from "@/lib/dates";
import { fmt } from "@/lib/format";
import type { Lease, PartyCard } from "@/types";
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

/** "달력 월 · 25일 청구 · 선불 · 일할 · 납기 5일 · 관리비 고지서(후불)" — 서버 billingSummary 와 같은 문구 */
export function billingSummary(l: Pick<Lease, "cycle" | "billing_mode" | "prorate" | "due_day" | "due_days" | "mgmt_mode">): string {
  return [
    l.cycle === "calendar" ? `달력 월 · ${l.due_day}일 청구` : `입주일 기준 · 매월 ${l.due_day}일`,
    l.billing_mode === "prepaid" ? "선불" : "후불",
    l.prorate ? "일할" : "일할 안 함",
    l.due_days ? `납기 ${l.due_days}일` : "청구일이 납기",
    l.mgmt_mode === "bill" ? "관리비 고지서(후불)" : "관리비 고정",
  ].join(" · ");
}

export const ROLE_LABEL = { contractor: "계약자", payer: "납부자", occupant: "입주자" } as const;

/**
 * 글을 복사한다. 클립보드를 못 쓰는 환경이면 글 상자를 보여 줘서 직접 복사하게 한다.
 * 버튼을 누른 그 순간에 navigator.clipboard 를 불러야 한다.
 */
export function useCopy() {
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      return true;
    } catch {
      setFallback(text);
      return false;
    }
  };
  return { copy, fallback, clear: () => setFallback(null) };
}

/** 복사 못 했을 때 보여 주는 상자 */
export function CopyFallback({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-warn/40 bg-warn/5 p-3">
      <p className="text-xs text-warn">이 화면에서는 자동 복사가 안 된다. 아래 글을 길게 눌러 직접 복사한다</p>
      <Textarea id="copy-fallback" rows={5} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex justify-end">
        <Button size="sm" onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "복사", onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const { copy, fallback, clear } = useCopy();
  const [done, setDone] = useState(false);
  return (
    <>
      <Button
        size="sm"
        icon={<Copy className="size-3.5" />}
        onClick={async () => {
          if (await copy(text)) {
            setDone(true);
            onCopied?.();
            setTimeout(() => setDone(false), 1600);
          }
        }}
      >
        {done ? "복사했다" : label}
      </Button>
      {fallback && <CopyFallback text={fallback} onClose={clear} />}
    </>
  );
}
