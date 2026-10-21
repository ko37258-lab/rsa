import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, fmt } from "@/lib/format";
import { daysBetween, monthEnd, monthStart, plusDays, thisMonth } from "@/lib/dates";
import { LinkButton, Loading, ErrorBox, MonthNav } from "@/components/ui";
import type { CalendarData, CalendarSegment } from "./model";
import { newLeaseUrl } from "./shared";

const DAY_W = 28;
const ROW_H = 30;

const BAR: Record<string, string> = {
  occupied: "bg-navy text-navy-fg",
  closing: "bg-brass text-white",
  closed: "bg-ink3 text-surface",
  concluded: "bg-violet text-white",
  move_in_confirmed: "bg-info text-white",
  awaiting_signature: "border border-dashed border-warn bg-warn/15 text-warn",
  hold: "border border-warn bg-warn/20 text-warn",
  suspend: "bg-bad/15 text-bad border border-bad/40",
};
const BAR_LABEL: Record<string, string> = {
  occupied: "거주 중",
  closing: "퇴실·정산",
  closed: "끝남",
  concluded: "체결",
  move_in_confirmed: "입주 예정",
  awaiting_signature: "서명 대기",
  hold: "홀드",
  suspend: "운영중지",
};

/** 달력 — 호실 × 날짜 막대. 빈 칸을 누르면 그날부터 계약을 작성할 수 있다 */
export function UnitCalendar() {
  const { branchId, today } = useBranch();
  const nav = useNavigate();
  const [month, setMonth] = useState(thisMonth(today));
  const [pick, setPick] = useState<{ unitId: string; code: string; date: string } | null>(null);
  const from = monthStart(month);
  const to = monthEnd(month);
  const q = useApi<CalendarData>(["units", "calendar", branchId, month], `/api/branches/${branchId}/calendar?from=${from}&to=${to}`);
  const days = useMemo(() => {
    const n = daysBetween(from, to) + 1;
    return Array.from({ length: n }, (_, i) => plusDays(from, i));
  }, [from, to]);
  const todayIdx = today >= from && today <= to ? daysBetween(from, today) : -1;
  const width = days.length * DAY_W;

  const busy = (segs: CalendarSegment[], d: string) => segs.some((s) => s.from <= d && s.to >= d);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} onChange={setMonth} current={thisMonth(today)} />
        <p className="text-xs text-ink3">빈 칸을 누르면 그날부터 계약 작성. 두 번 누르면 바로 간다.</p>
      </div>
      {pick && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-brass/50 bg-brass/10 px-3 py-2 text-sm">
          <span className="font-medium">
            {pick.code}호 · {fmt(pick.date, "M월 d일 (EEE)")}부터
          </span>
          <LinkButton to={newLeaseUrl(pick.unitId, pick.date)} size="sm" variant="primary" icon={<ArrowRight className="size-3.5" />}>
            계약 작성
          </LinkButton>
          <button type="button" className="text-xs text-ink3 hover:text-ink" onClick={() => setPick(null)}>
            선택 해제
          </button>
        </div>
      )}
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="scroll-x rounded-md border border-line bg-surface">
          <div className="relative" style={{ width: width + 88 }}>
            {/* 날짜 머리 */}
            <div className="sticky top-0 z-10 flex border-b border-line bg-sunken/90">
              <div className="sticky left-0 z-10 w-[88px] shrink-0 border-r border-line bg-sunken px-2 py-1 text-[11px] font-semibold text-ink3">호실</div>
              {days.map((d, i) => {
                const dow = new Date(`${d}T00:00:00`).getDay();
                return (
                  <div key={d} className={cx("num shrink-0 py-1 text-center text-[10px]", i === todayIdx ? "font-bold text-brass" : dow === 0 ? "text-bad" : dow === 6 ? "text-info" : "text-ink3")} style={{ width: DAY_W }}>
                    {Number(d.slice(8))}
                  </div>
                );
              })}
            </div>
            {(q.data?.units ?? []).map((u, ri, arr) => {
              const groupHead = arr.length && (ri === 0 || arr[ri - 1].branch_id !== u.branch_id) && new Set(arr.map((x) => x.branch_id)).size > 1;
              return (
                <div key={u.id}>
                  {groupHead && <div className="sticky left-0 border-b border-line bg-surface px-2 py-1 text-xs font-semibold text-ink2">{u.branch_name}</div>}
                  <div className="flex border-b border-line last:border-0" style={{ height: ROW_H }}>
                    <Link to={`/units/${u.id}`} className="sticky left-0 z-[5] flex w-[88px] shrink-0 items-center gap-1 border-r border-line bg-surface px-2 text-xs hover:text-brass">
                      <span className="num font-semibold">{u.code}</span>
                      <span className="truncate text-[10px] text-ink3">{u.type_name ?? ""}</span>
                    </Link>
                    <div className="relative shrink-0" style={{ width }}>
                      {days.map((d, i) => {
                        const free = u.sale_status === "on_sale" && !busy(u.segments, d) && d >= today;
                        const sel = pick?.unitId === u.id && pick.date === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            tabIndex={free ? 0 : -1}
                            aria-label={free ? `${u.code}호 ${fmt(d, "M월 d일")}부터 계약 작성` : undefined}
                            disabled={!free}
                            onClick={() => setPick({ unitId: u.id, code: u.code, date: d })}
                            onDoubleClick={() => nav(newLeaseUrl(u.id, d))}
                            className={cx("absolute top-0 h-full border-r border-line/60", free ? "hover:bg-brass/15" : "cursor-default", sel && "bg-brass/30", u.sale_status !== "on_sale" && "bg-sunken")}
                            style={{ left: i * DAY_W, width: DAY_W }}
                          />
                        );
                      })}
                      {todayIdx >= 0 && <div className="pointer-events-none absolute top-0 h-full w-px bg-brass" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} />}
                      {u.segments.map((s) => {
                        const a = s.from < from ? from : s.from;
                        const b = s.to > to ? to : s.to;
                        const left = daysBetween(from, a) * DAY_W + 1;
                        const w = (daysBetween(a, b) + 1) * DAY_W - 2;
                        const key = s.kind === "lease" ? s.status : s.kind;
                        const cls = cx("absolute top-[4px] flex items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[11px] font-medium", BAR[key] ?? "bg-ink3 text-surface");
                        const title = `${s.label} · ${BAR_LABEL[key] ?? ""} · ${fmt(s.from, "M.d")}~${fmt(s.to, "M.d")}`;
                        return s.kind === "lease" ? (
                          <Link key={s.id} to={`/leases/${s.id}`} title={title} className={cls} style={{ left, width: w, height: ROW_H - 8 }}>
                            {w > 40 ? s.label : ""}
                          </Link>
                        ) : (
                          <div key={s.id} title={title} className={cls} style={{ left, width: w, height: ROW_H - 8 }}>
                            {w > 40 ? s.label : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-ink2">
        {Object.entries(BAR_LABEL)
          .filter(([k]) => k !== "closed")
          .map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cx("inline-block h-2.5 w-4 rounded-sm", BAR[k])} />
              {label}
            </span>
          ))}
      </div>
    </div>
  );
}
