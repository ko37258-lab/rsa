import { useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * 가벼운 SVG 차트 모음. 색은 모두 테마 토큰(Tailwind fill·stroke 색)이라 라이트·다크 둘 다 읽힌다.
 * 하나의 눈금(scale)으로 막대·선·글자를 같이 놓는다.
 */
export const SERIES = ["navy", "brass", "info", "good", "violet", "bad"] as const;
export type SeriesColor = (typeof SERIES)[number];
const FILL: Record<SeriesColor, string> = { navy: "fill-navy", brass: "fill-brass", info: "fill-info", good: "fill-good", violet: "fill-violet", bad: "fill-bad" };
const STROKE: Record<SeriesColor, string> = { navy: "stroke-navy", brass: "stroke-brass", info: "stroke-info", good: "stroke-good", violet: "stroke-violet", bad: "stroke-bad" };
const BG: Record<SeriesColor, string> = { navy: "bg-navy", brass: "bg-brass", info: "bg-info", good: "bg-good", violet: "bg-violet", bad: "bg-bad" };

export interface Series {
  name: string;
  color: SeriesColor;
  values: Array<number | null>;
  dashed?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

export function Legend({ series }: { series: Array<{ name: string; color: SeriesColor; dashed?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span className={cx("inline-block h-2 w-3 rounded-sm", BG[s.color], s.dashed && "opacity-50")} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** 선 차트. 마지막 점을 강조하고, 첫 계열 아래에 옅은 면을 깐다 */
export function LineChart({
  labels,
  series,
  height = 200,
  format = (v: number) => v.toLocaleString("ko-KR"),
  max,
  min = 0,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  max?: number;
  min?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padL = 48;
  const padR = 14;
  const padT = 12;
  const padB = 26;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const top = max ?? niceMax(Math.max(...all, 0) * 1.08);
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (1 - (v - min) / (top - min || 1)) * (H - padT - padB);
  // 값이 모두 0 이면 눈금을 0 하나만 둔다(같은 글자 "0만" 이 반복되지 않게)
  const flat = all.length === 0 || all.every((v) => v === min);
  const ticks = flat && max === undefined ? [min] : [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (top - min));
  const labelEvery = Math.ceil(n / 8);
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink3 text-[10px]">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-ink3 text-[10px]">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const segs: string[] = [];
          let cur = "";
          pts.forEach((pt) => {
            if (!pt) {
              if (cur) segs.push(cur);
              cur = "";
              return;
            }
            cur += `${cur ? "L" : "M"}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
          });
          if (cur) segs.push(cur);
          const valid = pts.filter(Boolean) as Array<readonly [number, number]>;
          const area = si === 0 && valid.length > 1 ? `M${valid[0][0]},${y(min)} ${valid.map((p) => `L${p[0]},${p[1]}`).join(" ")} L${valid[valid.length - 1][0]},${y(min)} Z` : null;
          const last = valid[valid.length - 1];
          return (
            <g key={s.name}>
              {area && <path d={area} className={FILL[s.color]} fillOpacity={0.08} />}
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" className={STROKE[s.color]} strokeWidth={2} strokeDasharray={s.dashed ? "4 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {last && <circle cx={last[0]} cy={last[1]} r={3.5} className={cx(FILL[s.color], "stroke-surface")} strokeWidth={2} />}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - (W - padL - padR) / Math.max(n - 1, 1) / 2} y={padT} width={(W - padL - padR) / Math.max(n - 1, 1)} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="stroke-ink3" strokeDasharray="2 3" />}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md" style={{ left: `${Math.min(80, (x(hover) / W) * 100)}%` }}>
          <div className="mb-0.5 font-semibold">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="num flex items-center gap-1.5 text-ink2">
              <span className={cx("size-2 rounded-full", BG[s.color])} />
              {s.name} {s.values[hover] === null ? "—" : format(s.values[hover] as number)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 세로 막대(묶음 또는 쌓기) */
export function BarChart({
  labels,
  series,
  height = 200,
  stacked,
  format = (v: number) => v.toLocaleString("ko-KR"),
}: {
  labels: string[];
  series: Series[];
  height?: number;
  stacked?: boolean;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padL = 48;
  const padR = 8;
  const padT = 12;
  const padB = 26;
  const n = labels.length;
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, x) => s + (x.values[i] ?? 0), 0) : Math.max(...series.map((x) => x.values[i] ?? 0))));
  const top = niceMax(Math.max(...totals, 0) * 1.05);
  const band = (W - padL - padR) / Math.max(n, 1);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const ticks = totals.every((t) => t === 0) ? [0] : [0, 0.5, 1].map((t) => t * top);
  const labelEvery = Math.ceil(n / 12);
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-line" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink3 text-[10px]">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const x0 = padL + i * band;
          const inner = band * 0.7;
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x0} y={padT} width={band} height={H - padT - padB} fill="transparent" />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                if (stacked) {
                  const y1 = y(acc + v);
                  const h = y(acc) - y1;
                  acc += v;
                  return <rect key={s.name} x={x0 + (band - inner) / 2} y={y1} width={inner} height={Math.max(0, h)} className={FILL[s.color]} opacity={hover === null || hover === i ? 1 : 0.55} />;
                }
                const w = inner / series.length;
                return <rect key={s.name} x={x0 + (band - inner) / 2 + si * w} y={y(v)} width={w - 1} height={Math.max(0, y(0) - y(v))} rx={1.5} className={FILL[s.color]} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              {(i % labelEvery === 0 || i === n - 1) && (
                <text x={x0 + band / 2} y={H - 8} textAnchor="middle" className="fill-ink3 text-[10px]">
                  {l}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md" style={{ left: `${Math.min(78, ((padL + hover * band) / W) * 100)}%` }}>
          <div className="mb-0.5 font-semibold">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="num flex items-center gap-1.5 text-ink2">
              <span className={cx("size-2 rounded-full", BG[s.color])} />
              {s.name} {format(s.values[hover] ?? 0)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 가로 막대 목록(깔때기·순위) — 값과 비율을 글자로도 보여준다 */
export function HBarList({ items, format = (v: number) => v.toLocaleString("ko-KR"), color = "navy" }: { items: Array<{ label: ReactNode; value: number; note?: ReactNode }>; format?: (v: number) => string; color?: SeriesColor }) {
  const top = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(72px,110px)_1fr_auto] items-center gap-3 text-sm">
          <div className="truncate text-ink2">{it.label}</div>
          <div className="h-5 rounded-sm bg-sunken">
            <div className={cx("h-5 rounded-sm", BG[color])} style={{ width: `${Math.max(1.5, (it.value / top) * 100)}%`, opacity: 1 - i * 0.1 }} />
          </div>
          <div className="num min-w-[88px] text-right text-ink">
            {format(it.value)}
            {it.note && <span className="ml-1.5 text-xs text-ink3">{it.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 요일×시간 열지도 (rows=7, cols=24) */
export function Heatmap({ rows, cols, values, title }: { rows: string[]; cols: string[]; values: number[][]; title?: (r: number, c: number, v: number) => string }) {
  const top = Math.max(...values.flat(), 1);
  return (
    <div className="scroll-x">
      <div className="inline-grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: `28px repeat(${cols.length}, minmax(14px, 1fr))` }}>
        <div />
        {cols.map((c, i) => (
          <div key={i} className="text-center text-[10px] text-ink3">
            {i % 3 === 0 ? c : ""}
          </div>
        ))}
        {rows.map((r, ri) => (
          <div key={r} className="contents">
            <div className="pr-1 text-right text-[11px] leading-[18px] text-ink3">{r}</div>
            {cols.map((_, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              return <div key={ci} title={title?.(ri, ci, v)} className="h-[18px] rounded-[3px] bg-navy" style={{ opacity: v === 0 ? 0.05 : 0.15 + (v / top) * 0.85 }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 작은 추이선 */
export function Sparkline({ values, color = "navy", width = 96, height = 28 }: { values: number[]; color?: SeriesColor; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - mn) / (mx - mn || 1)) * (height - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("")} fill="none" className={STROKE[color]} strokeWidth={1.5} />
      <circle cx={last[0]} cy={last[1]} r={2.5} className={FILL[color]} />
    </svg>
  );
}

/** 비율 막대(0~1) */
export function Meter({ value, color = "navy", className }: { value: number | null; color?: SeriesColor; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full rounded-full bg-sunken", className)}>
      <div className={cx("h-1.5 rounded-full", BG[color])} style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }} />
    </div>
  );
}
