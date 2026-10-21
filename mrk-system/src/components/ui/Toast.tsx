import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

type ToastTone = "good" | "bad" | "info";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}
const Ctx = createContext<{ show: (text: string, tone?: ToastTone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-0 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-md px-4 py-2.5 text-sm font-medium shadow-lg",
              t.tone === "bad" ? "bg-bad text-white" : "bg-navy text-navy-fg",
            )}
          >
            {t.tone === "good" && <span className="mr-1.5 text-brass">●</span>}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ToastProvider 밖");
  return v;
}
