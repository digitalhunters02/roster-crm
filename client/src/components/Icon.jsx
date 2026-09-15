// Hand-rolled inline-SVG icon set — one <Icon name="..."/> component keyed by
// a small dictionary of original stroke-based shapes. No icon library.

const ICONS = {
  dashboard: [
    ['rect', 3, 3, 8, 8, 2],
    ['rect', 13, 3, 8, 8, 2],
    ['rect', 3, 13, 8, 8, 2],
    ['rect', 13, 13, 8, 8, 2],
  ],
  candidate: [
    ['circle', 12, 8, 3.5],
    ['path', 'M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7'],
  ],
  users: [
    ['circle', 8, 8, 3],
    ['path', 'M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5'],
    ['circle', 16.2, 9, 2.3],
    ['path', 'M14.6 14.3c2.1.4 3.7 2.2 3.9 4.5'],
  ],
  briefcase: [
    ['rect', 3, 7, 18, 12, 2],
    ['path', 'M9 7V5.6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2V7'],
    ['line', 3, 13.5, 21, 13.5],
  ],
  funnel: [
    ['path', 'M4 4h16l-6.2 7.8v6.4l-3.6 1.8v-8.2L4 4Z'],
  ],
  calendarCheck: [
    ['rect', 4, 5, 16, 15, 2],
    ['line', 4, 10, 20, 10],
    ['line', 8, 3, 8, 7],
    ['line', 16, 3, 16, 7],
    ['path', 'M8.3 14.6l2.1 2.1L15.7 12'],
  ],
  building: [
    ['rect', 5, 3, 10, 18, 1],
    ['rect', 15, 10, 4, 11, 1],
    ['line', 8, 7, 8, 7.01],
    ['line', 11.3, 7, 11.3, 7.01],
    ['line', 8, 11, 8, 11.01],
    ['line', 11.3, 11, 11.3, 11.01],
    ['line', 8, 15, 8, 15.01],
    ['line', 11.3, 15, 11.3, 15.01],
    ['line', 17, 14, 17, 14.01],
    ['line', 17, 17.5, 17, 17.5001],
  ],
  badge: [
    ['path', 'M12 2l2.4 1.4L17 3l.5 2.9 2.5 1.4-1 2.7 1 2.7-2.5 1.4L17 17l-2.6-.4L12 18l-2.4-1.4L7 17l-.5-2.9-2.5-1.4 1-2.7-1-2.7L6.5 5.9 7 3l2.6.4L12 2Z'],
    ['path', 'M9 10.3l2 2 4-4'],
  ],
  receipt: [
    ['path', 'M6 3h12v18l-2-1.3L14 21l-2-1.3L10 21l-2-1.3L6 21V3Z'],
    ['line', 8.5, 7.5, 15.5, 7.5],
    ['line', 8.5, 11, 15.5, 11],
    ['line', 8.5, 14.5, 13, 14.5],
  ],
  zap: [
    ['path', 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z'],
  ],
  barChart: [
    ['line', 3, 21, 21, 21],
    ['rect', 6, 13, 3.2, 8, 1],
    ['rect', 10.4, 7.5, 3.2, 13.5, 1],
    ['rect', 14.8, 15, 3.2, 6, 1],
  ],
  sliders: [
    ['line', 4, 6, 20, 6],
    ['circle', 8.5, 6, 2],
    ['line', 4, 12, 20, 12],
    ['circle', 15.5, 12, 2],
    ['line', 4, 18, 20, 18],
    ['circle', 10.5, 18, 2],
  ],
  search: [
    ['circle', 10, 10, 6],
    ['line', 14.6, 14.6, 20, 20],
  ],
  bell: [
    ['path', 'M6 9.5a6 6 0 0 1 12 0c0 4.2 1.7 5.8 1.7 5.8H4.3S6 13.7 6 9.5Z'],
    ['path', 'M10 18a2 2 0 0 0 4 0'],
  ],
  chevronDown: [['path', 'M6 9l6 6 6-6']],
  chevronRight: [['path', 'M9 6l6 6-6 6']],
  plus: [
    ['line', 12, 5, 12, 19],
    ['line', 5, 12, 19, 12],
  ],
  x: [
    ['line', 6, 6, 18, 18],
    ['line', 18, 6, 6, 18],
  ],
  check: [['path', 'M5 12.5 10 17.5 19 7']],
  arrowUpRight: [
    ['line', 7, 17, 17, 7],
    ['path', 'M9 7h8v8'],
  ],
  clock: [
    ['circle', 12, 12, 8.5],
    ['path', 'M12 7.3V12l3.3 2.1'],
  ],
  mail: [
    ['rect', 3, 5, 18, 14, 2],
    ['path', 'M3.5 6 12 13 20.5 6'],
  ],
  phoneCall: [
    ['path', 'M5.3 4h3l1.4 4.3-2 1.5a12 12 0 0 0 5.7 5.7l1.5-2 4.3 1.4v3a1.7 1.7 0 0 1-1.9 1.7A16.3 16.3 0 0 1 3.6 5.9 1.7 1.7 0 0 1 5.3 4Z'],
  ],
  fileText: [
    ['rect', 5, 3, 14, 18, 2],
    ['line', 8, 8, 16, 8],
    ['line', 8, 12, 16, 12],
    ['line', 8, 16, 13, 16],
  ],
  alertTriangle: [
    ['path', 'M12 3.5 21.5 20h-19L12 3.5Z'],
    ['line', 12, 10, 12, 14.2],
    ['line', 12, 17, 12.01, 17],
  ],
  filter: [
    ['path', 'M3.5 5h17L14 13v5.5l-4 2V13L3.5 5Z'],
  ],
  moreHorizontal: [
    ['circle', 5, 12, 1.4],
    ['circle', 12, 12, 1.4],
    ['circle', 19, 12, 1.4],
  ],
  pencil: [
    ['path', 'M4 20h4.3L19 9.3a2.1 2.1 0 0 0 0-3l-2.3-2.3a2.1 2.1 0 0 0-3 0L3 14.7V20Z'],
    ['line', 13.3, 5.3, 18.7, 10.7],
  ],
  download: [
    ['path', 'M12 3v12'],
    ['path', 'M7 10.5 12 15.5 17 10.5'],
    ['path', 'M4 19h16'],
  ],
  camera: [
    ['path', 'M4 8.5h3.2L8.5 6h7L16.8 8.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z'],
    ['circle', 12, 13.2, 3.4],
  ],
  trash: [
    ['line', 4, 7, 20, 7],
    ['path', 'M9 7V4.6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7'],
    ['path', 'M6.2 7l.9 12.4A1.6 1.6 0 0 0 8.7 21h6.6a1.6 1.6 0 0 0 1.6-1.6L17.8 7'],
    ['line', 10, 11, 10, 17],
    ['line', 14, 11, 14, 17],
  ],
  star: [
    ['path', 'M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.4l-5.4 2.9 1-6.1L3.2 10l6.1-.9L12 3.5Z'],
  ],
  target: [
    ['circle', 12, 12, 8.5],
    ['circle', 12, 12, 5],
    ['circle', 12, 12, 1.5],
  ],
  layers: [
    ['path', 'M12 3 3 8l9 5 9-5-9-5Z'],
    ['path', 'M3 13l9 5 9-5'],
  ],
  menu: [
    ['line', 3, 6, 21, 6],
    ['line', 3, 12, 21, 12],
    ['line', 3, 18, 21, 18],
  ],
};

export default function Icon({ name, size = 18, stroke = 'currentColor', strokeWidth = 1.8, className = '' }) {
  const shapes = ICONS[name] || ICONS.dashboard;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {shapes.map((s, i) => {
        if (s[0] === 'path') return <path key={i} d={s[1]} />;
        if (s[0] === 'circle') return <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} />;
        if (s[0] === 'line') return <line key={i} x1={s[1]} y1={s[2]} x2={s[3]} y2={s[4]} />;
        if (s[0] === 'rect') return <rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5] || 0} />;
        return null;
      })}
    </svg>
  );
}
