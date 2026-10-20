import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
}

interface Props<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** tabs: 메뉴 탭 / chips: 글 형식 고르기 */
  variant: "tabs" | "chips";
  ariaLabel: string;
  /** 탭일 때 각 버튼이 가리키는 패널 id */
  panelId?: (id: T) => string;
}

/** 고른 항목 아래의 바탕이 미끄러지듯 따라 움직이는 선택 막대 */
export function Segmented<T extends string>({ options, value, onChange, variant, ariaLabel, panelId }: Props<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const el = wrap?.querySelector<HTMLElement>(`[data-id="${value}"]`);
    if (!wrap || !el) return;
    setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, options.length]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    // 글꼴이 늦게 불러와지면 너비가 바뀝니다.
    document.fonts?.ready.then(() => measure()).catch(() => undefined);
    return () => ro.disconnect();
  }, [measure]);

  const isTabs = variant === "tabs";
  return (
    <div ref={wrapRef} className={`seg seg--${variant}`} role={isTabs ? "tablist" : "radiogroup"} aria-label={ariaLabel}>
      {pill && (
        <span
          className="seg__pill"
          aria-hidden="true"
          style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h }}
        />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            data-id={o.id}
            className={`seg__opt${on ? " is-on" : ""}`}
            role={isTabs ? "tab" : "radio"}
            id={isTabs ? `tab-${o.id}` : undefined}
            aria-selected={isTabs ? on : undefined}
            aria-checked={isTabs ? undefined : on}
            aria-controls={isTabs && panelId ? panelId(o.id) : undefined}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
