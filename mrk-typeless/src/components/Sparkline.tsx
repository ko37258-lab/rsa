/** June식 작은 선 그래프: 보라 선 + 옅은 면 + 마지막 점 강조 */
export function Sparkline({ values, labels, width = 220, height = 56 }: { values: number[]; labels?: string[]; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const pad = 4;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${height - pad} L ${pad} ${height - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={labels ? labels.map((l, i) => `${l} ${values[i]}`).join(", ") : undefined}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path className="spark__line" d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.5 : 2.5} fill="#fff" stroke="var(--primary)" strokeWidth="1.5" />
      ))}
      <circle cx={last[0]} cy={last[1]} r="7" fill="var(--primary)" opacity="0.15" />
    </svg>
  );
}
