import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useApiMutation } from "@/lib/hooks";
import { cx } from "@/lib/format";
import { Button } from "@/components/ui";
import type { UnitRow } from "./model";

type Layout = { col: number; span: number };

/**
 * 배치 편집 — 원본과 같은 동작: 호실마다 왼쪽·오른쪽으로, 좁게·넓게(1~4칸),
 * 여러 개 골라 같이 옮기기, 층마다 «열 비우기(번호순)», 취소·저장.
 * 한 지점의 호실만 받는다.
 */
export function FloorPlanEditor({ branchId, units, onDone }: { branchId: string; units: UnitRow[]; onDone: () => void }) {
  const [lay, setLay] = useState<Map<string, Layout>>(() => new Map(units.map((u) => [u.id, { ...u.layout }])));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const save = useApiMutation({ invalidate: [["units"]], success: "배치를 저장했다", onSuccess: onDone });

  const floors = useMemo(() => {
    const m = new Map<string, UnitRow[]>();
    for (const u of units) {
      const k = u.floor === null ? "미정" : String(u.floor);
      m.set(k, [...(m.get(k) ?? []), u]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "미정" ? 1 : b === "미정" ? -1 : Number(b) - Number(a)));
  }, [units]);

  const maxCol = Math.max(...units.map((u) => lay.get(u.id)!.col + lay.get(u.id)!.span - 1), 1) + 1; // 오른쪽에 빈 칸 하나

  // 같은 층에서 겹치는 호실
  const overlaps = useMemo(() => {
    const bad = new Set<string>();
    for (const [, list] of floors) {
      const sorted = [...list].sort((a, b) => lay.get(a.id)!.col - lay.get(b.id)!.col);
      for (let i = 1; i < sorted.length; i++) {
        const p = lay.get(sorted[i - 1].id)!;
        if (lay.get(sorted[i].id)!.col <= p.col + p.span - 1) {
          bad.add(sorted[i - 1].id);
          bad.add(sorted[i].id);
        }
      }
    }
    return bad;
  }, [floors, lay]);

  const change = (ids: string[], fn: (l: Layout) => Layout) =>
    setLay((prev) => {
      const n = new Map(prev);
      for (const id of ids) n.set(id, fn(n.get(id)!));
      return n;
    });
  const targets = (id: string) => (sel.has(id) ? [...sel] : [id]);

  /** 번호순으로 왼쪽부터 빈틈 없이 다시 채운다 */
  const repack = (list: UnitRow[]) =>
    setLay((prev) => {
      const n = new Map(prev);
      let col = 1;
      for (const u of [...list].sort((a, b) => a.code.localeCompare(b.code, "ko", { numeric: true }))) {
        const span = n.get(u.id)!.span;
        n.set(u.id, { col, span });
        col += span;
      }
      return n;
    });

  const changed = units.filter((u) => {
    const l = lay.get(u.id)!;
    return l.col !== u.layout.col || l.span !== u.layout.span;
  });
  const badCodes = units.filter((u) => overlaps.has(u.id)).map((u) => `${u.code}호`);

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-brass/40 bg-surface px-3 py-2 shadow-sm">
        <span className="text-sm font-semibold">배치 편집</span>
        <span className="text-xs text-ink3">{sel.size ? `${sel.size}개 선택` : "칸을 눌러 여러 개 고르면 같이 옮긴다"}</span>
        {sel.size > 0 && (
          <>
            <Button size="sm" icon={<ChevronLeft className="size-3.5" />} onClick={() => change([...sel], (l) => ({ ...l, col: Math.max(1, l.col - 1) }))}>
              왼쪽으로
            </Button>
            <Button size="sm" icon={<ChevronRight className="size-3.5" />} onClick={() => change([...sel], (l) => ({ ...l, col: l.col + 1 }))}>
              오른쪽으로
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
              선택 해제
            </Button>
          </>
        )}
        <div className="flex-1" />
        {badCodes.length > 0 && <span className="text-xs font-medium text-bad">칸이 겹친다: {badCodes.slice(0, 4).join(", ")}</span>}
        <Button size="sm" onClick={onDone}>
          취소
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!changed.length || overlaps.size > 0}
          loading={save.isPending}
          onClick={() => save.mutate({ path: `/api/branches/${branchId}/unit-views`, method: "PATCH", body: { layouts: changed.map((u) => ({ unit_id: u.id, ...lay.get(u.id)! })) } })}
        >
          저장{changed.length ? ` (${changed.length})` : ""}
        </Button>
      </div>

      <div className="scroll-x rounded-md border border-line bg-surface p-3">
        <div className="flex min-w-max flex-col gap-1.5">
          {floors.map(([f, list]) => (
            <div key={f} className="flex items-stretch gap-2">
              <div className="flex w-[74px] shrink-0 flex-col items-end justify-center gap-1">
                <span className="num text-xs font-semibold text-ink3">{f === "미정" ? "층 미정" : `${f}층`}</span>
                <button type="button" className="text-[11px] text-brass hover:underline" onClick={() => repack(list)}>
                  열 비우기(번호순)
                </button>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${maxCol}, 120px)` }}>
                {list.map((u) => {
                  const l = lay.get(u.id)!;
                  const ids = targets(u.id);
                  return (
                    <div
                      key={u.id}
                      style={{ gridColumn: `${l.col} / span ${l.span}`, gridRow: 1 }}
                      className={cx(
                        "flex min-h-[64px] flex-col justify-between rounded border bg-surface px-2 py-1.5",
                        overlaps.has(u.id) ? "border-bad ring-2 ring-bad/40" : sel.has(u.id) ? "border-brass ring-2 ring-brass" : "border-line",
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={sel.has(u.id)}
                        onClick={() => setSel((s) => (s.has(u.id) ? new Set([...s].filter((x) => x !== u.id)) : new Set([...s, u.id])))}
                        className="flex items-baseline justify-between gap-1 text-left"
                      >
                        <span className="num text-sm font-semibold">{u.code}</span>
                        <span className="truncate text-[10px] text-ink3">{u.type_name ?? "룸타입 미정"}</span>
                      </button>
                      <div className="flex items-center justify-between">
                        <span className="num text-[10px] text-ink3">
                          {l.col}열{l.span > 1 ? ` · ${l.span}칸` : ""}
                        </span>
                        <span className="flex">
                          <EditBtn label={`${u.code}호 왼쪽으로`} disabled={l.col <= 1} onClick={() => change(ids, (x) => ({ ...x, col: Math.max(1, x.col - 1) }))}>
                            <ChevronLeft className="size-3.5" />
                          </EditBtn>
                          <EditBtn label={`${u.code}호 오른쪽으로`} disabled={l.col + l.span > maxCol} onClick={() => change(ids, (x) => ({ ...x, col: x.col + 1 }))}>
                            <ChevronRight className="size-3.5" />
                          </EditBtn>
                          <EditBtn label={`${u.code}호 좁게`} disabled={l.span <= 1} onClick={() => change([u.id], (x) => ({ ...x, span: x.span - 1 }))}>
                            <Minus className="size-3.5" />
                          </EditBtn>
                          <EditBtn label={`${u.code}호 넓게`} disabled={l.span >= 4} onClick={() => change([u.id], (x) => ({ ...x, span: x.span + 1 }))}>
                            <Plus className="size-3.5" />
                          </EditBtn>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded p-0.5 text-ink2 hover:bg-sunken hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}
