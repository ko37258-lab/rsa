import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "@/lib/format";
import type { Tone } from "@/lib/codes";

const valueTone: Partial<Record<Tone, string>> = { bad: "text-bad", warn: "text-warn", good: "text-good", info: "text-info" };

/** 숫자 타일. tone 은 "지금 손봐야 한다" 를 색으로 알린다(0 이면 중립) */
export function StatTile({ label, value, unit, note, tone, to, className }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; tone?: Tone; to?: string; className?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium text-ink3">{label}</div>
      <div className={cx("num mt-1 flex items-baseline gap-1 text-[26px] font-semibold leading-none tracking-tight", tone ? valueTone[tone] ?? "text-ink" : "text-ink")}>
        {value}
        {unit && <span className="text-sm font-medium text-ink3">{unit}</span>}
      </div>
      {note && <div className="mt-1.5 truncate text-xs text-ink3">{note}</div>}
    </>
  );
  const cls = cx("block min-w-0 rounded-md border border-line bg-surface px-4 py-3", to && "transition-colors hover:border-ink3", className);
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
