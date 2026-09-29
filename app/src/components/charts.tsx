// 접근성 있는 자체 SVG 차트(서버 렌더링). 모든 차트는 텍스트 대체 표를 함께 제공한다.
import { count, num, percent } from '@/lib/format'
import { shortDate } from '@/lib/dates'

export const PALETTE = ['#087f79', '#397be5', '#cef585', '#9f6321', '#6a3aa6', '#bbcbd2', '#2d7651', '#d06b6b']

interface BarRow {
  date: string
  value: number | null
  series: 'current' | 'previous'
}

export function DailyBars({ id, title, rows, unit = '회', height = 210 }: { id: string; title: string; rows: BarRow[]; unit?: string; height?: number }) {
  const W = 860
  const H = height
  const pad = { l: 34, r: 8, t: 12, b: 26 }
  const values = rows.map((r) => r.value ?? 0)
  const max = Math.max(1, ...values)
  const step = (W - pad.l - pad.r) / Math.max(1, rows.length)
  const bw = Math.max(2, step * 0.72)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, Math.round(max / 2), max]
  const labelEvery = Math.ceil(rows.length / 10)
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>막대마다 날짜와 값을 표시합니다. 같은 내용을 아래 표로도 제공합니다.</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e6edf0" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = pad.l + i * step + (step - bw) / 2
          const v = r.value
          return (
            <g key={r.date}>
              {v === null ? (
                <rect x={x} y={H - pad.b - 3} width={bw} height={3} fill="#e0e7ea">
                  <title>{`${r.date}: 미수집`}</title>
                </rect>
              ) : (
                <rect x={x} y={y(v)} width={bw} height={Math.max(0, H - pad.b - y(v))} rx={1.5} fill={r.series === 'current' ? '#087f79' : '#bbcbd2'}>
                  <title>{`${r.date}: ${num(v)}${unit}`}</title>
                </rect>
              )}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle">
                  {shortDate(r.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <details className="no-print">
        <summary className="note">표로 보기</summary>
        <div className="table-wrap" style={{ maxHeight: 260 }}>
          <table>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">구분</th>
                <th scope="col" className="num">
                  값
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{r.date}</td>
                  <td>{r.series === 'current' ? '현재 기간' : '비교 기간'}</td>
                  <td className="num">{r.value === null ? '미수집' : `${num(r.value)}${unit}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

export interface TrendPoint {
  start: string
  end: string
  value: number | null
}

/** 주간 누적 추이. 없는 주차는 빈 구간(선 끊김)으로 두고 0이나 추정치로 채우지 않는다. */
export function WeeklyTrend({ id, title, points, unit = '회' }: { id: string; title: string; points: TrendPoint[]; unit?: string }) {
  const W = 860
  const H = 200
  const pad = { l: 40, r: 16, t: 14, b: 30 }
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null)
  const max = Math.max(1, ...vals)
  const step = points.length > 1 ? (W - pad.l - pad.r) / (points.length - 1) : 0
  const x = (i: number) => (points.length > 1 ? pad.l + i * step : W / 2)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const segments: string[] = []
  let cur: string[] = []
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur.length) segments.push(cur.join(' '))
      cur = []
    } else cur.push(`${x(i)},${y(p.value)}`)
  })
  if (cur.length) segments.push(cur.join(' '))
  const labelEvery = Math.ceil(points.length / 8)
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>저장된 주간 보고서만 점으로 표시하며, 보고서가 없는 주차는 비워 둡니다.</desc>
        {[0, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e6edf0" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">
              {num(t)}
            </text>
          </g>
        ))}
        {segments.map((s, i) => (
          <polyline key={i} points={s} fill="none" stroke="#087f79" strokeWidth={2.5} />
        ))}
        {points.map((p, i) => (
          <g key={p.start}>
            {p.value === null ? (
              <text x={x(i)} y={H - pad.b - 4} textAnchor="middle" style={{ fill: '#a0b0b6' }}>
                없음
              </text>
            ) : (
              <circle cx={x(i)} cy={y(p.value)} r={5} fill="#087f79" stroke="#fff" strokeWidth={2}>
                <title>{`${p.start}~${p.end}: ${num(p.value)}${unit}`}</title>
              </circle>
            )}
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 10} textAnchor="middle">
                {shortDate(p.start)}~
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <caption className="sr-only">{title} 표</caption>
          <thead>
            <tr>
              <th scope="col">주간</th>
              <th scope="col" className="num">
                값
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.start}>
                <td>
                  {p.start} ~ {p.end}
                </td>
                <td className="num">{p.value === null ? '보고서 없음' : `${num(p.value)}${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

export interface DonutPart {
  label: string
  value: number
  color: string
}

/** 도넛의 도형 비중만 합계로 정규화하고, 표시 숫자는 원 수치를 그대로 쓴다. */
export function Donut({ parts, centerValue, centerLabel, label }: { parts: DonutPart[]; centerValue: string; centerLabel: string; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  let acc = 0
  const stops = parts
    .map((p) => {
      const from = (acc / total) * 360
      acc += p.value
      const to = (acc / total) * 360
      return `${p.color} ${from}deg ${to}deg`
    })
    .join(', ')
  return (
    <div className="traffic-hero">
      <div className="donut" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${percent(p.value)}`).join(', ')}`} style={{ background: `conic-gradient(${stops})` }}>
        <div className="donut-center">
          <b>{centerValue}</b>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div className="group-list">
        {parts.map((p) => (
          <div className="group-line" key={p.label}>
            <i style={{ background: p.color }} aria-hidden="true" />
            <span>{p.label}</span>
            <b>{percent(p.value)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HBars({ rows, unit = '회', max: maxIn }: { rows: { label: string; value: number | null; note?: string }[]; unit?: string; max?: number }) {
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value ?? 0))
  return (
    <div className="hbar">
      {rows.map((r) => (
        <div className="hbar-row" key={r.label}>
          <span>{r.label}</span>
          <span className="hbar-track" aria-hidden="true">
            <span className="hbar-fill" style={{ display: 'block', width: `${r.value === null ? 0 : Math.max(0.5, (r.value / max) * 100)}%` }} />
          </span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>
            {r.value === null ? '미수집' : unit === '%' ? percent(r.value) : count(r.value, unit)}
            {r.note ? <span className="note"> {r.note}</span> : null}
          </b>
        </div>
      ))}
    </div>
  )
}
