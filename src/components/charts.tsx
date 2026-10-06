import { useEffect, useRef, useState } from 'react';
import { money0 } from '../logic';

export interface Series {
  name: string;
  color: string; // CSS color / var()
  values: number[];
}

/** Round tick step (1/2/2.5/5 × 10^n) giving about four gridlines. */
function niceScale(v: number) {
  const raw = Math.max(v, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw)!;
  const max = Math.max(step, Math.ceil(v / step) * step);
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

const short = (v: number) => (v >= 100000 ? `₹${+(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${+(v / 1000).toFixed(1)}k` : `₹${v}`);

/** Grouped vertical bars, one group per label, with a per-group hover tooltip. */
export function GroupedBars({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real pixel width so text and bars keep their size.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 44, r: 8, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const { max, ticks } = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const gw = iw / labels.length;
  const gap = 2;
  const bw = Math.min(22, (gw * 0.7 - gap * (series.length - 1)) / series.length);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  // Bar with 4px rounded top, square base anchored on the baseline.
  const bar = (x: number, v: number, w: number) => {
    const h = Math.max(0, (v / max) * ih);
    if (h < 0.5) return '';
    const r = Math.min(4, h, w / 2);
    const top = pad.t + ih - h;
    const base = pad.t + ih;
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
  };

  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name} style={{ ['--c' as string]: s.color }}>{s.name}</span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.name).join(' and ') + ' by month'}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'gridline'} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{short(t)}</text>
            </g>
          ))}
          {labels.map((lab, i) => {
            const gx = pad.l + i * gw;
            const start = gx + (gw - (bw * series.length + gap * (series.length - 1))) / 2;
            return (
              <g key={lab + i}>
                <rect className="hit" x={gx} y={pad.t} width={gw} height={ih} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} />
                {series.map((s, si) => (
                  <path key={s.name} d={bar(start + si * (bw + gap), s.values[i], bw)} fill={s.color} pointerEvents="none" />
                ))}
                <text className="tick" x={gx + gw / 2} y={height - 6} textAnchor="middle">{lab}</text>
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div
            className="tooltip"
            style={{
              left: pad.l + (hover + 0.5) * gw,
              top: pad.t + 30,
              // keep the tooltip inside the chart at the edges
              transform: `translate(${hover < labels.length / 4 ? '-15%' : hover > (labels.length * 3) / 4 ? '-85%' : '-50%'}, -100%)`,
            }}
          >
            <strong>{labels[hover]}</strong>
            {series.map((s) => (
              <div key={s.name}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
                {s.name}: {money0(s.values[hover])}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Ranked horizontal bars (single series) with value labels. */
export function HBars({ rows, format = money0 }: { rows: { label: string; value: number; title?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="empty">Nothing yet</div>;
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar" key={r.label} title={r.title ?? `${r.label}: ${format(r.value)}`}>
          <span className="name">{r.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
          </div>
          <span className="num">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
