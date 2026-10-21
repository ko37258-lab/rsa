import { useMemo } from "react";
import { useApi } from "@/lib/hooks";
import { plusDays, plusMonths } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { Input, Segmented } from "@/components/ui";
import type { SalesBoard, SalesBoardRow } from "./model";

/** 판매 기간 — 원본 호실 화면의 «기간 없음 · 1개월 · 3개월 · 6개월 · 12개월» */
export const PERIOD_MONTHS = ["0", "1", "3", "6", "12"] as const;
export type PeriodMonths = (typeof PERIOD_MONTHS)[number];

export interface Period {
  months: number;
  from: string;
  until: string | null; // 기간 없음이면 null
}

export function readPeriod(sp: URLSearchParams, today: string): Period {
  const months = Number(sp.get("months") ?? 0);
  const from = sp.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from")!) ? sp.get("from")! : today;
  return { months, from, until: months > 0 ? plusDays(plusMonths(from, months), -1) : null };
}

/** 기간이 있으면 판매 현황판을 읽어 호실별로 돌려준다 */
export function useSalesBoard(branchId: string, p: Period) {
  const q = useApi<SalesBoard>(["units", "sales-board", branchId, p.from, p.until], p.until ? `/api/leases/sales-board?branch_id=${branchId}&on=${p.from}&until=${p.until}` : null);
  const map = useMemo(() => new Map<string, SalesBoardRow>((q.data?.rows ?? []).map((r) => [r.unit_id, r])), [q.data]);
  return { board: p.until ? map : null, loading: q.isLoading && !!p.until };
}

export function PeriodPicker({ p, onChange }: { p: Period; onChange: (months: string | null, from: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<PeriodMonths>
        size="sm"
        value={(PERIOD_MONTHS.includes(String(p.months) as PeriodMonths) ? String(p.months) : "0") as PeriodMonths}
        onChange={(v) => onChange(v === "0" ? null : v, v === "0" ? null : p.from)}
        options={PERIOD_MONTHS.map((m) => ({ value: m, label: m === "0" ? "기간 없음" : `${m}개월` }))}
      />
      {p.months > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-ink3">
          <Input id="period-from" type="date" className="h-8 w-[150px]" value={p.from} onChange={(e) => e.target.value && onChange(String(p.months), e.target.value)} />
          부터 {p.until && `${fmt(p.until, "M.d")}까지`}
        </label>
      )}
    </div>
  );
}
