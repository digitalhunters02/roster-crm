import { useState } from 'react';

// Inline SVG vertical bar chart with an x-axis baseline and a hover highlight.
// `data`: [{ label, value, color }]
export default function ColBars({ data, width = 520, height = 200, formatValue = (v) => v, highlightIndex }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [hover, setHover] = useState(highlightIndex ?? null);
  const padTop = 24;
  const padBottom = 38;
  const padSide = 12;
  const plotH = height - padTop - padBottom;
  const gap = 14;
  const barW = (width - padSide * 2 - gap * (data.length - 1)) / data.length;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <line x1={padSide} y1={height - padBottom} x2={width - padSide} y2={height - padBottom} stroke="#E4E1F5" strokeWidth={1} />
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * plotH, 3);
        const x = padSide + i * (barW + gap);
        const y = height - padBottom - barH;
        const isHover = hover === i;
        return (
          <g
            key={d.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(highlightIndex ?? null)}
            style={{ cursor: 'default' }}
          >
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            <text x={x + barW / 2} y={y - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill={isHover ? '#181A2A' : '#5B5F7A'}>
              {formatValue(d.value)}
            </text>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={d.color} opacity={isHover ? 1 : 0.85} />
            {(() => {
              const words = String(d.label).split(' ');
              const lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [d.label];
              return lines.map((line, li) => (
                <text
                  key={li}
                  x={x + barW / 2}
                  y={height - padBottom + 16 + li * 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#5B5F7A"
                >
                  {line}
                </text>
              ));
            })()}
          </g>
        );
      })}
    </svg>
  );
}
