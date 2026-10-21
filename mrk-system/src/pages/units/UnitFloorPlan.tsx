import { cx, man } from "@/lib/format";
import { UNIT_STATE, type UnitRow } from "./model";
import { STATE_TILE, stateNote } from "./shared";

/**
 * 배치도 — 층을 줄로, 호실을 칸으로. 칸 위치·넓이는 호실의 layout(col, span)을 따른다.
 * 맨 위층이 위에 오게 그린다(건물 단면처럼).
 */
export function UnitFloorPlan({ units, onPick, selected }: { units: UnitRow[]; onPick: (u: UnitRow) => void; selected?: string | null }) {
  const byBranch = new Map<string, UnitRow[]>();
  for (const u of units) byBranch.set(u.branch_id, [...(byBranch.get(u.branch_id) ?? []), u]);

  return (
    <div className="flex flex-col gap-6">
      {[...byBranch.entries()].map(([bid, list]) => {
        const cols = Math.max(...list.map((u) => u.layout.col + u.layout.span - 1), 1);
        const floors = new Map<string, UnitRow[]>();
        for (const u of list) {
          const k = u.floor === null ? "미정" : String(u.floor);
          floors.set(k, [...(floors.get(k) ?? []), u]);
        }
        const order = [...floors.keys()].sort((a, b) => (a === "미정" ? 1 : b === "미정" ? -1 : Number(b) - Number(a)));
        return (
          <section key={bid} className="min-w-0">
            {byBranch.size > 1 && <h3 className="mb-2 text-sm font-semibold text-ink2">{list[0].branch_name}</h3>}
            <div className="scroll-x rounded-md border border-line bg-surface p-3">
              <div className="flex min-w-max flex-col gap-1.5">
                {order.map((f) => (
                  <div key={f} className="flex items-stretch gap-2">
                    <div className="num flex w-10 shrink-0 items-center justify-end text-xs font-semibold text-ink3">{f === "미정" ? "층 미정" : `${f}층`}</div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 112px)` }}>
                      {floors.get(f)!.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => onPick(u)}
                          title={`${u.code}호 · ${UNIT_STATE[u.today.state].label} · ${stateNote(u)}`}
                          style={{ gridColumn: `${u.layout.col} / span ${u.layout.span}` }}
                          className={cx(
                            "flex min-h-[64px] flex-col items-start justify-between rounded border px-2 py-1.5 text-left transition-shadow hover:shadow-md",
                            STATE_TILE[u.today.state],
                            selected === u.id && "ring-2 ring-brass",
                          )}
                        >
                          <span className="flex w-full items-baseline justify-between gap-1">
                            <span className="num text-sm font-semibold">{u.code}</span>
                            <span className="truncate text-[10px] text-ink3">{u.type_name ?? "룸타입 미정"}</span>
                          </span>
                          <span className="w-full truncate text-[11px] text-ink2">{u.current ? u.current.contractor_name : UNIT_STATE[u.today.state].label}</span>
                          <span className="num flex w-full justify-between text-[11px]">
                            <span className="text-ink3">{u.asking_price ? `월 ${man(u.asking_price.rent)}` : "모집가 없음"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap gap-3 text-xs text-ink2">
        {(["vacant", "occupied", "reserved", "hold", "suspended", "off_sale"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cx("inline-block size-3 rounded-sm border", STATE_TILE[s])} />
            {UNIT_STATE[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
