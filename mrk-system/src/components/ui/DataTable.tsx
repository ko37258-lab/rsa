import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cx } from "@/lib/format";

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** 정렬 값. 있으면 머리글을 눌러 정렬한다 */
  sort?: (row: T) => string | number | null;
  align?: "left" | "right" | "center";
  className?: string;
  /** 좁은 화면에서 숨김 */
  hideOnMobile?: boolean;
}

/**
 * 목록 표. 가로로 넘치면 표 안에서만 스크롤한다(페이지는 안 밀린다).
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty = "표시할 항목이 없다",
  rowClassName,
  footer,
  initialSort,
  dense,
  selectedKey,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
  initialSort?: { id: string; dir: "asc" | "desc" };
  dense?: boolean;
  selectedKey?: string | null;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const r = x < y ? -1 : 1;
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  const pad = dense ? "px-3 py-1.5" : "px-3 py-2.5";

  return (
    <div className="scroll-x rounded-md border border-line bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-sunken/60">
            {columns.map((c) => (
              <th key={c.id} scope="col" className={cx(pad, "whitespace-nowrap text-xs font-semibold text-ink3", alignCls(c.align), c.hideOnMobile && "max-sm:hidden", c.className)}>
                {c.sort ? (
                  <button
                    type="button"
                    className={cx("inline-flex items-center gap-1 hover:text-ink", c.align === "right" && "flex-row-reverse")}
                    onClick={() => setSort((s) => (s?.id === c.id ? (s.dir === "asc" ? { id: c.id, dir: "desc" } : null) : { id: c.id, dir: "asc" }))}
                  >
                    {c.header}
                    {sort?.id === c.id && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-sm text-ink3">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((r) => {
              const k = rowKey(r);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cx(
                    "border-b border-line last:border-0",
                    onRowClick && "cursor-pointer hover:bg-sunken/70",
                    selectedKey === k && "bg-brass/10",
                    rowClassName?.(r),
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.id} className={cx(pad, "num align-middle text-ink", alignCls(c.align), c.hideOnMobile && "max-sm:hidden", c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
        {footer && <tfoot className="border-t border-line bg-sunken/60">{footer}</tfoot>}
      </table>
    </div>
  );
}
