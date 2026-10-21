import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui";
import { fmt } from "@/lib/format";
import { UNIT_STATE, type UnitRow, type UnitState } from "./model";

/** 오늘 상태 아래 붙는 짧은 설명 — "10.31까지 빔", "11.3부터 판매" */
export function stateNote(u: Pick<UnitRow, "today" | "current" | "next">): string {
  const t = u.today;
  switch (t.state) {
    case "vacant":
      return t.free_until ? `${fmt(t.free_until, "M.d")}까지 빔` : "계속 빔";
    case "occupied":
      return u.next ? `${fmt(u.next.start_date, "M.d")} 다음 계약` : t.free_from ? `${fmt(t.free_from, "M.d")}부터 판매` : "";
    case "reserved":
      return u.current ? `${fmt(u.current.start_date, "M.d")} 입주 예정` : "";
    case "hold":
      return t.block?.hold_expires_at ? `${fmt(t.block.hold_expires_at, "M.d HH:mm")}까지 홀드` : "홀드";
    case "suspended":
      return t.block?.until ? `${fmt(t.block.until, "M.d")}까지 운영중지` : t.block?.reason ?? "";
    case "off_sale":
      return "판매하지 않음";
  }
}

export function UnitStateBadge({ state }: { state: UnitState }) {
  const c = UNIT_STATE[state];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

/** 계약 작성 화면으로 가는 주소(재무 영역의 계약 작성 대화상자) */
export function newLeaseUrl(unitId: string, start?: string | null, inquiryId?: string | null): string {
  const p = new URLSearchParams({ new: "1", unit: unitId });
  if (start) p.set("start", start);
  if (inquiryId) p.set("inquiry", inquiryId);
  return `/leases?${p.toString()}`;
}

/** 계약을 새로 잡을 수 있는 가장 이른 날 */
export function earliestStart(u: Pick<UnitRow, "today">, today: string): string {
  const f = u.today.free_from;
  return f && f > today ? f : today;
}

/**
 * 주소창 검색값 바꾸기(나머지는 그대로). 여러 칸은 객체로 한 번에 바꾼다 —
 * react-router 의 setSearchParams 는 한 렌더 안에서 두 번 부르면 앞의 것을 덮어쓴다.
 */
export function useParam(): [URLSearchParams, (k: string | Record<string, string | null>, v?: string | null) => void] {
  const [sp, setSp] = useSearchParams();
  const set = (k: string | Record<string, string | null>, v: string | null = null) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        const changes = typeof k === "string" ? { [k]: v } : k;
        for (const [key, val] of Object.entries(changes)) {
          if (val === null || val === "") n.delete(key);
          else n.set(key, val);
        }
        return n;
      },
      { replace: true },
    );
  return [sp, set];
}

/** 타일·막대 색(상태별). Tailwind 기본 투명도 단계만 쓴다 */
export const STATE_TILE: Record<UnitState, string> = {
  vacant: "border-good/50 bg-good/10",
  occupied: "border-line bg-surface",
  reserved: "border-info/50 bg-info/10",
  hold: "border-warn/60 bg-warn/10",
  suspended: "border-bad/40 bg-bad/5",
  off_sale: "border-dashed border-line bg-sunken text-ink3",
};

export const pyeong = (m2: number) => (m2 / 3.3058).toFixed(1);
