"use client";

import { useState, type ReactNode } from "react";
import type { FillT } from "@/lib/design/schema";
import { FONTS, FONT_KEYS, type FontKey } from "@/lib/design/fonts";
import { cx } from "@/components/ui";

export function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex items-center justify-between gap-3 py-1", className)}>
      <span className="shrink-0 text-[12px] font-semibold text-ink-2">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </label>
  );
}

export function Group({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold tracking-wide text-ink-3">{title}</h3>
        {right}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** #RRGGBB(AA) 색상 입력: 스포이드 + 텍스트. 올바른 hex 일 때만 onChange 를 호출합니다. */
export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    // 외부에서 값이 바뀌면 입력창도 맞춤 (렌더 중 상태 조정 패턴)
    setSynced(value);
    setDraft(value);
  }
  const base = value.slice(0, 7);
  const alpha = value.length === 9 ? value.slice(7) : "";
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        value={HEX6.test(base) ? base : "#000000"}
        onChange={(e) => onChange((e.target.value + alpha).toUpperCase())}
        className="size-7 cursor-pointer rounded border border-line-2 bg-card p-0.5"
        aria-label="색 고르기"
      />
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value.trim();
          setDraft(v);
          if (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(v)) onChange(v.toUpperCase());
        }}
        onBlur={() => setDraft(value)}
        className="h-7 w-[84px] rounded border border-line-2 bg-card px-1.5 font-mono text-[11px] uppercase"
        spellCheck={false}
        aria-label="색 코드"
      />
    </span>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, w = "w-[72px]" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; w?: string }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
      className={cx("h-7 rounded border border-line-2 bg-card px-1.5 text-right text-[12px] tabular-nums", w)}
    />
  );
}

export function Slider({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <span className="flex items-center gap-2">
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} className="w-24 accent-[#e5532d]" />
      <span className="w-9 text-right text-[11px] tabular-nums text-ink-3">{Math.round(value * 100) / 100}</span>
    </span>
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-7 max-w-[170px] rounded border border-line-2 bg-card px-1.5 text-[12px]">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const fontOptions = FONT_KEYS.map((k) => ({ value: k, label: FONTS[k].label }));

export function FontSelect({ value, onChange }: { value: FontKey; onChange: (v: FontKey) => void }) {
  return <Select value={value} onChange={onChange} options={fontOptions} />;
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx("relative h-5 w-9 rounded-full transition", checked ? "bg-ink" : "bg-line-2")}
    >
      <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

/** 단색 / 2색 그라디언트 채우기 편집 */
export function FillEditor({ value, onChange }: { value: FillT; onChange: (f: FillT) => void }) {
  const isLinear = value.type === "linear";
  const first = value.type === "solid" ? value.color : value.stops[0]?.color ?? "#FFFFFF";
  return (
    <div className="space-y-1">
      <Row label="채우기">
        <Select
          value={value.type}
          onChange={(t) =>
            onChange(
              t === "solid"
                ? { type: "solid", color: first }
                : { type: "linear", angle: 90, stops: [{ at: 0, color: first }, { at: 1, color: first }] },
            )
          }
          options={[
            { value: "solid", label: "단색" },
            { value: "linear", label: "그라디언트" },
          ]}
        />
      </Row>
      {!isLinear && <Row label="색"><ColorInput value={value.color} onChange={(c) => onChange({ type: "solid", color: c })} /></Row>}
      {isLinear && (
        <>
          {value.stops.map((s, i) => (
            <Row key={i} label={i === 0 ? "시작 색" : i === value.stops.length - 1 ? "끝 색" : `중간 색 ${i}`}>
              <ColorInput value={s.color} onChange={(c) => onChange({ ...value, stops: value.stops.map((x, j) => (j === i ? { ...x, color: c } : x)) })} />
            </Row>
          ))}
          <Row label="방향(도)">
            <Slider value={value.angle} min={0} max={359} onChange={(a) => onChange({ ...value, angle: a })} />
          </Row>
        </>
      )}
    </div>
  );
}
