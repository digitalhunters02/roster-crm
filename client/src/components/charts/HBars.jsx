import { useState } from 'react';

// Horizontal bar list — label + dot, track + fill bar, right-aligned value.
// `data`: [{ label, value, color, display }]
export default function HBars({ data, height = 10, formatValue = (v) => v }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [hover, setHover] = useState(null);

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const widthPct = Math.max((d.value / max) * 100, 2);
        const isHover = hover === i;
        return (
          <div
            key={d.label}
            className="group"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: d.color, flexShrink: 0 }} />
                <span className="text-sm text-ink truncate">{d.label}</span>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${isHover ? 'text-ink' : 'text-muted'}`}>
                {d.display ?? formatValue(d.value)}
              </span>
            </div>
            <div
              className="rounded-full bg-wash overflow-hidden"
              style={{ height }}
              title={`${d.label}: ${d.display ?? formatValue(d.value)}`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${widthPct}%`, background: d.color, opacity: isHover ? 1 : 0.88 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
