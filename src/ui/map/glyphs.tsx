import { memo } from 'react';
import { utilColor } from '../../game/constants';
import { linkUtil, nodeUtil } from '../../game/network';
import type { NetLink, NetNode, Technician } from '../../game/types';
import { isoX, isoY, mix } from '../iso';
import { SITE_SIZE, SITE_VISUAL, SitePlate } from '../SiteIcon';
import { COMPANY } from './palette';

export const LinkGlyph = memo(function LinkGlyph({
  link,
  a,
  b,
  selected,
  onSelect,
  highlight,
  traced,
  bottleneck,
  ghost,
}: {
  link: NetLink;
  a: NetNode;
  b: NetNode;
  selected: boolean;
  onSelect: (id: string) => void;
  highlight: boolean;
  traced: boolean;
  bottleneck: boolean;
  ghost: boolean;
}) {
  const x1 = isoX(a.gx, a.gy);
  const y1 = isoY(a.gx, a.gy) - 6;
  const x2 = isoX(b.gx, b.gy);
  const y2 = isoY(b.gx, b.gy) - 6;
  const util = linkUtil(link);
  const color = link.down ? '#ff5c68' : bottleneck ? '#ff7a66' : traced ? '#3ee6d6' : utilColor(util);
  const width = 1.6 + Math.min(2.6, link.tier * 0.8);
  // Busier spans animate faster; idle spans barely move.
  const dur = Math.max(0.6, 5 - util * 4.2);

  return (
    <g
      className={`map-interactive site-arrival${ghost ? ' blueprint-ghost' : ''}`}
      data-map-placement-blocker="true"
      role="button"
      tabIndex={0}
      aria-label={`${a.name} to ${b.name} fibre, tier ${link.tier}, ${Math.round(util * 100)} percent load${link.down ? ', down' : ''}`}
      onClick={(e) => (e.stopPropagation(), onSelect(link.id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect(link.id);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
      <line
        className="map-focus-ring"
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#f4f8ff"
        strokeWidth={width + 6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={width + 6}
        opacity={0.12}
        strokeLinecap="round"
        filter={selected || traced ? 'url(#fibreBloom)' : undefined}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={selected || highlight || traced ? width + 1.4 : width}
        opacity={link.down ? 0.9 : 0.75}
        strokeLinecap="round"
        strokeDasharray={link.down ? '5 5' : undefined}
        className={link.down ? 'alert-blink' : bottleneck ? 'capacity-pulse' : traced ? 'network-route' : undefined}
      />
      {!link.down && (
        <>
          <circle cx={x1} cy={y1} r={width * 0.75} fill={color} opacity={0.9} />
          <circle cx={x2} cy={y2} r={width * 0.75} fill={color} opacity={0.9} />
        </>
      )}
      {!link.down && util > 0.02 && (selected || traced || highlight) && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#ffffff"
          strokeWidth={width * 0.5}
          opacity={0.5}
          strokeDasharray="2 16"
          strokeLinecap="round"
          className="fiber-flow"
          style={{ animationDuration: `${dur}s` }}
        />
      )}
      {(highlight || bottleneck) && (
        <g transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2 - 9})`}>
          <rect x={-24} y={-10} width={48} height={18} rx={5} fill="#10222d" stroke={color} strokeOpacity={0.7} />
          <text y={2} textAnchor="middle" fill={color} fontSize={10} fontWeight={700}>
            {link.down ? 'DOWN' : `${Math.round(util * 100)}%`}
          </text>
        </g>
      )}
      {selected && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#fff"
          strokeWidth={width + 5}
          strokeLinecap="round"
          opacity={0.15}
        />
      )}
    </g>
  );
});

// Shape identifies the site type, its own accent identifies its family, and the outer arc reports load.
export const NodeGlyph = memo(function NodeGlyph({
  node,
  selected,
  onSelect,
  hasIncident,
  fiberState,
  ghost,
  isolated,
}: {
  node: NetNode;
  selected: boolean;
  onSelect: (id: string) => void;
  hasIncident: boolean;
  fiberState: 'source' | 'eligible' | 'blocked' | null;
  isolated: boolean;
  ghost: boolean;
}) {
  const cx = isoX(node.gx, node.gy);
  const cy = isoY(node.gx, node.gy);
  const util = Math.min(1, nodeUtil(node));
  const statusColor = node.down ? '#ff6577' : isolated ? '#ffc857' : utilColor(util);
  const visual = SITE_VISUAL[node.kind];
  const linking = fiberState === 'source';

  // Capacity is the whole point of a tier, so the site simply gets bigger.
  const r = SITE_SIZE[node.kind] * (1 + (node.tier - 1) * 0.15);
  const mast = node.kind === 'tower' ? 26 + node.tier * 3 : 0;
  const my = cy - (mast ? mast * 0.5 : 10);

  // Utilisation arc around the plate.
  const ringR = r + 3.5;
  const circumference = 2 * Math.PI * ringR;

  return (
    <g
      className={`map-interactive site-arrival${ghost ? ' blueprint-ghost' : ''}`}
      data-map-placement-blocker="true"
      role="button"
      tabIndex={0}
      aria-label={`${node.name}, ${visual.label}, tier ${node.tier}, ${Math.round(util * 100)} percent load${node.down ? ', down' : ''}`}
      onClick={(e) => (e.stopPropagation(), onSelect(node.id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect(node.id);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <title>{`${node.name} · ${visual.label} · Tier ${node.tier} · ${Math.round(util * 100)}% load`}</title>
      <g className="map-focus-ring" aria-hidden="true">
        <SitePlate kind={node.kind} cx={cx} cy={my} size={r + 10} fill="none" stroke="#f4f8ff" strokeWidth={2.2} />
      </g>
      {node.kind === 'tower' && (
        <>
          <line x1={cx} y1={cy} x2={cx} y2={cy - mast} stroke={visual.accent} strokeWidth={1.8} strokeOpacity={0.72} />
          <line x1={cx - 5} y1={cy} x2={cx} y2={cy - mast} stroke="#2a3c53" strokeWidth={1} />
          <line x1={cx + 5} y1={cy} x2={cx} y2={cy - mast} stroke="#2a3c53" strokeWidth={1} />
          <circle cx={cx} cy={cy - mast - 2} r={2.2} fill="#ff6577" className="tower-blink" />
        </>
      )}

      {(isolated || node.down) && !fiberState && (
        <g transform={`translate(${cx} ${my - r - 20})`}>
          <rect x={-39} y={-10} width={78} height={17} rx={4} fill="#121f2b" stroke={statusColor} />
          <text textAnchor="middle" y={2} fontSize={8} fontWeight={700} fill={statusColor}>
            {node.down ? 'OFFLINE' : 'NO BACKHAUL'}
          </text>
        </g>
      )}
      {/* Footprint on the ground, so the marker is anchored to a place. */}
      <ellipse cx={cx} cy={cy + 1} rx={r + 5} ry={(r + 5) * 0.38} fill="#02060c" opacity={0.58} />
      <line x1={cx} y1={cy} x2={cx} y2={my + r * 0.7} stroke={visual.accent} strokeWidth={0.8} strokeOpacity={0.42} />

      {/* The plate itself */}
      <circle
        cx={cx}
        cy={my}
        r={r + 7}
        fill={visual.accent}
        opacity={(selected || linking ? 0.17 : 0.08) + (node.tier - 1) * 0.022}
        className={selected || linking ? 'pulse-soft' : undefined}
      />
      {fiberState && (
        <circle
          cx={cx}
          cy={my}
          r={r + 9.5}
          fill="none"
          stroke={fiberState === 'blocked' ? '#ff6577' : COMPANY}
          strokeWidth={fiberState === 'source' ? 2.2 : 1.2}
          strokeDasharray={fiberState === 'source' ? undefined : '3 3'}
          opacity={fiberState === 'blocked' ? 0.34 : fiberState === 'source' ? 0.95 : 0.58}
        />
      )}
      <SitePlate
        kind={node.kind}
        cx={cx}
        cy={my}
        size={r}
        fill={node.down ? '#32131b' : mix('#0c1726', visual.accent, 0.1)}
        stroke={node.down ? '#ff6577' : visual.accent}
      />

      <circle cx={cx} cy={my} r={ringR} fill="none" stroke="#1d2c40" strokeWidth={2.4} opacity={0.9} />
      <circle
        cx={cx}
        cy={my}
        r={ringR}
        fill="none"
        stroke={statusColor}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeDasharray={`${circumference * util} ${circumference}`}
        transform={`rotate(-90 ${cx} ${my})`}
        opacity={node.down ? 0.35 : 0.95}
      />

      <text
        x={cx}
        y={my + r * 0.34}
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize={node.kind === 'datacenter' ? r * 0.54 : r * 0.78}
        fontWeight={800}
        letterSpacing={node.kind === 'datacenter' ? -0.5 : 0}
        fill={node.down ? '#ff6577' : visual.accent}
        style={{ pointerEvents: 'none' }}
      >
        {visual.code}
      </text>

      <g transform={`translate(${cx + r * 0.42} ${my + r * 0.48})`} style={{ pointerEvents: 'none' }}>
        <rect width={17} height={9} rx={2.4} fill="#050b14" stroke={visual.accent} strokeWidth={0.8} />
        <text
          x={8.5}
          y={6.4}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={5.7}
          fontWeight={800}
          fill={visual.accent}
        >
          T{node.tier}
        </text>
      </g>

      {(selected || linking) && (
        <>
          <SitePlate
            kind={node.kind}
            cx={cx}
            cy={my}
            size={r + 6}
            fill="none"
            stroke={linking ? COMPANY : '#e8eef7'}
            strokeWidth={1.2}
          />
          <g transform={`translate(${cx} ${my - r - 18})`} style={{ pointerEvents: 'none' }}>
            <rect
              x={-33}
              y={-8}
              width={66}
              height={15}
              rx={3}
              fill="#07111d"
              stroke={visual.accent}
              strokeWidth={0.7}
              strokeOpacity={0.78}
            />
            <text
              y={2.5}
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={6.8}
              fontWeight={700}
              letterSpacing={0.5}
              fill="#e8eef7"
            >
              {visual.label.toUpperCase()} · T{node.tier}
            </text>
          </g>
        </>
      )}
      {hasIncident && (
        <g className="alert-blink">
          <circle cx={cx + r + 2} cy={my - r} r={6.5} fill="#ff6577" />
          <text x={cx + r + 2} y={my - r + 3.4} textAnchor="middle" fontSize={9} fill="#09111f" fontWeight={700}>
            !
          </text>
        </g>
      )}
    </g>
  );
});

export function TechnicianGlyph({ t }: { t: Technician }) {
  const cx = isoX(t.gx, t.gy);
  const cy = isoY(t.gx, t.gy);
  return (
    <g data-map-placement-blocker="true">
      <ellipse cx={cx} cy={cy + 3} rx={7} ry={3} fill="#000" opacity={0.35} />
      <rect x={cx - 7} y={cy - 9} width={14} height={8} rx={2} fill="#ffc857" />
      <rect x={cx - 7} y={cy - 12} width={8} height={4} rx={1.5} fill="#ffdc8f" />
      <circle cx={cx - 4} cy={cy - 1} r={2} fill="#1b2330" />
      <circle cx={cx + 4} cy={cy - 1} r={2} fill="#1b2330" />
      {t.state === 'working' && <circle cx={cx} cy={cy - 18} r={4} fill="#ffc857" className="alert-blink" />}
    </g>
  );
}
