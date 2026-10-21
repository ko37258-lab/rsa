import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/** 테두리 있는 면. 한 덩어리로 읽혀야 하는 곳에만 쓴다 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-md border border-line bg-surface", className)}>{children}</div>;
}

/** 제목 + 동작 + 본문 */
export function Section({
  title,
  hint,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 rounded-md border border-line bg-surface", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 max-w-[68ch] text-xs leading-relaxed text-ink3">{hint}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
