import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, Inbox, AlertTriangle } from "lucide-react";
import { cx, fmt } from "@/lib/format";
import { plusMonth } from "@/lib/dates";

/** 화면 제목 줄 */
export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink3">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** 여러 개 중 하나 고르기(보기 전환·필터) */
export function Segmented<T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; count?: number }>; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 font-medium transition-colors",
            size === "sm" ? "h-7 text-xs" : "h-8 text-[13px]",
            value === o.value ? "bg-navy text-navy-fg" : "text-ink2 hover:bg-sunken",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cx("num text-[11px]", value === o.value ? "opacity-80" : "text-ink3")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "찾기", id = "search" }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink3" />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="field pl-8" />
    </div>
  );
}

/** 달 이동 "‹ 2026년 10월 ›" */
export function MonthNav({ month, onChange, current }: { month: string; onChange: (m: string) => void; current?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
      <button type="button" aria-label="이전 달" className="rounded p-1.5 text-ink2 hover:bg-sunken" onClick={() => onChange(plusMonth(month, -1))}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="num min-w-[92px] text-center text-sm font-semibold">{fmt(`${month}-01`, "yyyy년 M월")}</span>
      <button type="button" aria-label="다음 달" className="rounded p-1.5 text-ink2 hover:bg-sunken" onClick={() => onChange(plusMonth(month, 1))}>
        <ChevronRight className="size-4" />
      </button>
      {current && current !== month && (
        <button type="button" className="rounded px-2 py-1 text-xs font-medium text-brass hover:bg-sunken" onClick={() => onChange(current)}>
          이번 달로
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line px-6 py-14 text-center">
      <Inbox className="size-6 text-ink3" />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-xs leading-relaxed text-ink3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink3" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-ink3 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{error instanceof Error ? error.message : "불러오지 못했다. 잠시 뒤 다시 시도한다."}</div>
    </div>
  );
}

/** 이름표-값 목록(상세 화면) */
export function KeyValue({ items, cols = 2 }: { items: Array<[ReactNode, ReactNode]>; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-ink3">{k}</dt>
          <dd className="num mt-0.5 break-words text-sm text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 상세 화면 탭 */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", value === t.value ? "border-brass text-ink" : "border-transparent text-ink3 hover:text-ink")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 금액 표시(음수는 빨강) */
export function Money({ value, strong, muted }: { value: number | null | undefined; strong?: boolean; muted?: boolean }) {
  if (value === null || value === undefined) return <span className="text-ink3">—</span>;
  return <span className={cx("num whitespace-nowrap", strong && "font-semibold", value < 0 ? "text-bad" : muted ? "text-ink3" : undefined)}>{Math.round(value).toLocaleString("ko-KR")}</span>;
}
