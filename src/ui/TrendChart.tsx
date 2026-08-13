export interface TrendSeries {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
}

export default function TrendChart({
  series,
  height = 86,
  formatValue = (value) => value.toFixed(1),
}: {
  series: TrendSeries[];
  height?: number;
  formatValue?: (value: number) => string;
}) {
  const width = 420;
  const padX = 8;
  const padY = 8;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (all.length < 2) return null;
  const min = Math.min(0, ...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const longest = Math.max(...series.map((s) => s.values.length));
  const points = (values: number[]) =>
    values
      .map((value, index) => {
        const x = padX + (index / Math.max(1, longest - 1)) * (width - padX * 2);
        const y = padY + (1 - (value - min) / span) * (height - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={padX} x2={width - padX} y1={height * p} y2={height * p} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            points={points(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.dashed ? '6 5' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-white/45">
            <i className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
            <b className="num font-normal text-white/65">{formatValue(s.values[s.values.length - 1] ?? 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
