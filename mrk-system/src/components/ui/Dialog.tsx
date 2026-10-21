import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/format";

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

/** 가운데 뜨는 대화상자. footer 에 버튼을 둔다 */
export function Dialog({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx("flex max-h-[92vh] w-full flex-col rounded-t-lg border border-line bg-surface shadow-2xl sm:rounded-lg", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-xs leading-relaxed text-ink3">{description}</p>}
          </div>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-ink3 hover:bg-sunken hover:text-ink">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** 오른쪽에서 열리는 상세 패널(목록에서 행을 누르면 연다) */
export function Sheet({ open, onClose, title, subtitle, actions, children, width = "max-w-xl" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; width?: string }) {
  useEsc(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/25" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        className={cx("flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl", width)}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingRight: "env(safe-area-inset-right, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <div className="mt-1 text-xs text-ink3">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1.5 text-ink3 hover:bg-sunken hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
