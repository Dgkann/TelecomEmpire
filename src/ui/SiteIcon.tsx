import type { NodeKind } from '../game/types';

export const SITE_SIZE: Record<NodeKind, number> = {
  core: 17,
  datacenter: 15,
  pop: 12.5,
  tower: 11.5,
  access: 9,
};

export const SITE_VISUAL: Record<NodeKind, { accent: string; code: string; label: string }> = {
  core: { accent: '#68a5ff', code: 'C', label: 'Core' },
  pop: { accent: '#2dd4bf', code: 'P', label: 'POP' },
  access: { accent: '#aebfd4', code: 'A', label: 'Access' },
  tower: { accent: '#b295ff', code: 'T', label: 'Tower' },
  datacenter: { accent: '#f3b843', code: 'DC', label: 'Data center' },
};

export function SitePlate({
  kind,
  cx,
  cy,
  size,
  fill,
  stroke,
  strokeWidth = 1.8,
}: {
  kind: NodeKind;
  cx: number;
  cy: number;
  size: number;
  fill: string;
  stroke: string;
  strokeWidth?: number;
}) {
  if (kind === 'core') {
    const points = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${cx + Math.cos(angle) * size},${cy + Math.sin(angle) * size}`;
    }).join(' ');
    return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (kind === 'pop') return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  if (kind === 'access') {
    const w = size * 1.25;
    const h = size * 0.82;
    return <rect x={cx - w} y={cy - h} width={w * 2} height={h * 2} rx={h * 0.55} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (kind === 'tower') {
    return <polygon points={`${cx},${cy - size} ${cx + size * 0.92},${cy + size * 0.78} ${cx - size * 0.92},${cy + size * 0.78}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx={2.2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export default function SiteIcon({
  kind,
  className = 'h-7 w-7',
  muted = false,
  title,
}: {
  kind: NodeKind;
  className?: string;
  muted?: boolean;
  title?: string;
}) {
  const visual = SITE_VISUAL[kind];
  const accent = muted ? '#708096' : visual.accent;
  return (
    <svg viewBox="0 0 32 32" className={`overflow-visible ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx={16} cy={16} r={14} fill={accent} opacity={0.08} />
      <SitePlate kind={kind} cx={16} cy={16} size={9.5} fill="#0c1726" stroke={accent} strokeWidth={1.8} />
      <text x={16} y={19} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={kind === 'datacenter' ? 6 : 8.5} fontWeight={800} fill={accent}>
        {visual.code}
      </text>
    </svg>
  );
}
