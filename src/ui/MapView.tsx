import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NODE_SPECS, utilColor, FIBER_COST_PER_UNIT, towerRadius } from '../game/constants';
import { isRoad } from '../game/cityGen';
import { leaderOf } from '../game/competitors';
import { computeRoutes, linkUtil, nodeUtil } from '../game/network';
import { daylight, incidentLocation } from '../game/simulation';
import { useGame } from '../store/gameStore';
import type { Building, District, GameState, NetLink, NetNode, SpectrumHolding, Technician } from '../game/types';
import { FLOOR_H, TILE_H, TILE_W, isoX, isoY, mix, shade, tileDiamond, unIso } from './iso';
import SiteIcon, { SITE_SIZE, SITE_VISUAL, SitePlate } from './SiteIcon';

const COMPANY = '#2dd4bf';

const MAP = {
  ground: '#16253a',
  groundAlt: '#0f1c2d',
  road: '#080f1a',
  roadMark: '#2f4463',
  locked: '#0a121d',
};

// Buildings sit on a single cool ramp. Only their value changes, so a tinted
// building reads as "mine" instantly rather than competing with six other hues.
const SLATE = ['#3c4d63', '#47596f', '#53667d', '#5f7288', '#6b7f95'];

const GroundLayer = memo(function GroundLayer({
  districts,
  night,
}: {
  districts: District[];
  night: number;
}) {
  const tiles: JSX.Element[] = [];
  const marks: JSX.Element[] = [];
  const junctions: JSX.Element[] = [];

  districts.forEach((d, di) => {
    // Alternating value, not hue, so five districts read apart without turning
    // the city into a colour chart.
    const plate = mix(mix(di % 2 === 0 ? MAP.ground : MAP.groundAlt, d.color, 0.1), '#000000', night * 0.3);
    const surface = d.unlocked ? plate : mix(MAP.locked, '#000000', night * 0.3);
    const road = mix(MAP.road, '#000000', night * 0.3);

    for (const c of d.cells) {
      const isJunction = c.gx % 5 === 0 && c.gy % 5 === 0;
      const onRoad = isRoad(c.gx, c.gy);
      tiles.push(
        <polygon
          key={`g${c.gx}_${c.gy}`}
          points={tileDiamond(c.gx, c.gy, onRoad ? 0 : 0.06)}
          fill={onRoad ? road : surface}
        />,
      );

      if (!onRoad || !d.unlocked) continue;
      if (isJunction) {
        junctions.push(
          <circle
            key={`j${c.gx}_${c.gy}`}
            cx={isoX(c.gx, c.gy)}
            cy={isoY(c.gx, c.gy)}
            r={1.8}
            fill={MAP.roadMark}
            opacity={1}
          />,
        );
      } else {
        marks.push(
          <polygon
            key={`m${c.gx}_${c.gy}`}
            points={tileDiamond(c.gx, c.gy, 0.86)}
            fill={MAP.roadMark}
            opacity={0.8}
          />,
        );
      }
    }
  });

  // Boundaries carry the district colour, drawn as the shared edge between two
  // districts rather than a ring around every border tile.
  const outlines = districts.map((d) => {
    const set = new Set(d.cells.map((c) => `${c.gx},${c.gy}`));
    const segments: Array<[number, number, number, number]> = [];

    for (const c of d.cells) {
      const cx = isoX(c.gx, c.gy);
      const cy = isoY(c.gx, c.gy);
      const hw = TILE_W / 2;
      const hh = TILE_H / 2;
      // Each grid neighbour maps to one side of the diamond.
      const sides: Array<[number, boolean]> = [
        [0, !set.has(`${c.gx + 1},${c.gy}`)],
        [1, !set.has(`${c.gx},${c.gy + 1}`)],
        [2, !set.has(`${c.gx - 1},${c.gy}`)],
        [3, !set.has(`${c.gx},${c.gy - 1}`)],
      ];
      const corners: Array<[number, number]> = [
        [cx + hw, cy],
        [cx, cy + hh],
        [cx - hw, cy],
        [cx, cy - hh],
      ];
      for (const [i, open] of sides) {
        if (!open) continue;
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        segments.push([a[0], a[1], b[0], b[1]]);
      }
    }

    return (
      <g key={`o${d.id}`}>
        {segments.map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={d.color}
            strokeWidth={d.unlocked ? 1 : 0.7}
            opacity={d.unlocked ? 0.3 : 0.16}
          />
        ))}
      </g>
    );
  });

  return (
    <g>
      {tiles}
      {marks}
      {junctions}
      {outlines}
    </g>
  );
});

const KIND_TONE: Record<Building['kind'], number> = {
  house: 0,
  apartment: 2,
  office: 4,
  shop: 1,
  industrial: 0,
  hospital: 3,
  university: 3,
  park: 0,
};

function BuildingGlyph({
  b,
  night,
  dim,
  justConnected,
}: {
  b: Building;
  night: number;
  dim: boolean;
  justConnected: boolean;
}) {
  const cx = isoX(b.gx, b.gy);
  const cy = isoY(b.gx, b.gy);
  const hw = TILE_W / 2 - 3;
  const hh = TILE_H / 2 - 1.5;

  if (b.kind === 'park') {
    return (
      <g>
        <polygon points={tileDiamond(b.gx, b.gy, 0.08)} fill={mix('#1c3a2c', '#0a1712', night * 0.55)} />
        <circle cx={cx - 5} cy={cy - 1} r={3} fill={mix('#2f6047', '#0f2318', night * 0.5)} />
        <circle cx={cx + 4} cy={cy + 1} r={3.6} fill={mix('#2f6047', '#0f2318', night * 0.5)} />
      </g>
    );
  }

  const h = Math.max(4, b.floors * FLOOR_H);
  const base = shade(SLATE[KIND_TONE[b.kind]], ((b.seed >> 11) % 5) * 5 - 10);
  const connected = b.connected;
  const tinted = connected > 0.02 ? mix(base, COMPANY, Math.min(0.26, connected * 0.3)) : base;
  const body = dim ? mix(tinted, '#0d1119', 0.6) : tinted;

  const top = shade(mix(body, '#1a2b41', night * 0.26), 10);
  const left = shade(mix(body, '#1a2b41', night * 0.3), -18);
  const right = shade(mix(body, '#1a2b41', night * 0.3), -34);

  const topPts = `${cx},${cy - hh - h} ${cx + hw},${cy - h} ${cx},${cy + hh - h} ${cx - hw},${cy - h}`;
  const leftPts = `${cx - hw},${cy - h} ${cx},${cy + hh - h} ${cx},${cy + hh} ${cx - hw},${cy}`;
  const rightPts = `${cx + hw},${cy - h} ${cx},${cy + hh - h} ${cx},${cy + hh} ${cx + hw},${cy}`;

  // Windows only appear after dark, and only on buildings tall enough to show them.
  const windows: JSX.Element[] = [];
  if (night > 0.35 && b.floors >= 2) {
    const rows = Math.min(4, b.floors - 1);
    for (let r = 0; r < rows; r++) {
      if ((b.seed >> r) % 3 === 0) continue;
      const wy = cy - 4 - r * FLOOR_H;
      const warm = b.connected > 0.15 ? '#7ff0e4' : '#ffd694';
      windows.push(
        <rect key={`l${r}`} x={cx - hw + 4} y={wy} width={4} height={3} fill={warm} opacity={0.75 * night} />,
        <rect key={`r${r}`} x={cx + hw - 8} y={wy} width={4} height={3} fill={warm} opacity={0.55 * night} />,
      );
    }
  }

  return (
    <g>
      <polygon points={rightPts} fill={right} />
      <polygon points={leftPts} fill={left} />
      <polygon
        points={topPts}
        fill={top}
        stroke={connected > 0.5 ? COMPANY : 'rgba(255,255,255,0.06)'}
        strokeOpacity={connected > 0.5 ? 0.4 : 1}
        strokeWidth={0.6}
      />
      {windows}
      {connected > 0.02 && (
        <circle cx={cx} cy={cy - h - hh - 2} r={0.9 + connected * 0.7} fill={COMPANY} opacity={0.3 + connected * 0.28} />
      )}
      {justConnected && (
        <circle cx={cx} cy={cy - h} r={16} fill="none" stroke={COMPANY} strokeWidth={1.5} opacity={0.9}>
          <animate attributeName="r" from="4" to="22" dur="0.9s" fill="freeze" />
          <animate attributeName="opacity" from="0.9" to="0" dur="0.9s" fill="freeze" />
        </circle>
      )}
    </g>
  );
}

const MemoBuilding = memo(BuildingGlyph);

const BuildingsLayer = memo(function BuildingsLayer({
  buildings,
  night,
  dim,
  minutes,
}: {
  buildings: Building[];
  night: number;
  dim: boolean;
  minutes: number;
}) {
  const sorted = useMemo(() => [...buildings].sort((a, b) => a.gx + a.gy - (b.gx + b.gy)), [buildings]);
  return (
    <g>
      {sorted.map((b) => (
        <MemoBuilding key={b.id} b={b} night={night} dim={dim} justConnected={minutes - b.lastConnectedAt < 25} />
      ))}
    </g>
  );
});

const COVERAGE_RADIUS: Record<NetNode['kind'], number> = {
  core: 3,
  pop: 6.5,
  access: 3.4,
  tower: 8.5,
  datacenter: 2,
};

// Tints each district by whoever currently leads it, so a rival creeping into
// your city is visible without opening a screen.
const RivalsLayer = memo(function RivalsLayer({ game }: { game: GameState }) {
  return (
    <g>
      {game.districts.map((d) => {
        const leader = leaderOf(game, d);
        return (
          <g key={`rv${d.id}`}>
            {d.cells.map((c) => (
              <polygon
                key={`rv${c.gx}_${c.gy}`}
                points={tileDiamond(c.gx, c.gy, 0.02)}
                fill={leader.color}
                opacity={0.1 + Math.min(0.4, leader.share * 0.6)}
              />
            ))}
            <text
              x={isoX(d.center.gx, d.center.gy)}
              y={isoY(d.center.gx, d.center.gy) - 52}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={leader.color}
              style={{ pointerEvents: 'none' }}
            >
              {leader.name} {Math.round(leader.share * 100)}%
            </text>
          </g>
        );
      })}
    </g>
  );
});

const CoverageLayer = memo(function CoverageLayer({
  nodes,
  districts,
  spectrum,
}: {
  nodes: NetNode[];
  districts: District[];
  spectrum: SpectrumHolding[];
}) {
  const serving = nodes.filter((n) => n.kind === 'pop' || n.kind === 'access' || n.kind === 'tower');
  const radiusOf = (n: NetNode) =>
    n.kind === 'tower' ? towerRadius(spectrum, n.tier) : COVERAGE_RADIUS[n.kind] * (1 + (n.tier - 1) * 0.16);

  const tiles: JSX.Element[] = [];
  for (const d of districts) {
    for (const c of d.cells) {
      let best = 0;
      for (const n of serving) {
        if (n.down) continue;
        const r = radiusOf(n);
        if (r <= 0) continue;
        best = Math.max(best, Math.max(0, 1 - Math.hypot(n.gx - c.gx, n.gy - c.gy) / r));
      }
      if (best <= 0.02) continue;
      const color = best > 0.66 ? '#4ade80' : best > 0.38 ? '#facc15' : '#fb923c';
      tiles.push(
        <polygon key={`c${c.gx}_${c.gy}`} points={tileDiamond(c.gx, c.gy, 0.02)} fill={color} opacity={0.14 + best * 0.3} />,
      );
    }
  }

  // Radio footprints get an explicit outline so the reach of a band is obvious.
  const footprints = nodes
    .filter((n) => n.kind === 'tower' && !n.down)
    .map((n) => {
      const r = towerRadius(spectrum, n.tier);
      if (r <= 0) return null;
      return (
        <ellipse
          key={`fp${n.id}`}
          cx={isoX(n.gx, n.gy)}
          cy={isoY(n.gx, n.gy)}
          rx={r * TILE_W}
          ry={r * TILE_H}
          fill="#3ee6d6"
          fillOpacity={0.05}
          stroke="#3ee6d6"
          strokeOpacity={0.4}
          strokeWidth={1.2}
          strokeDasharray="6 5"
        />
      );
    });

  return (
    <g>
      {tiles}
      {footprints}
    </g>
  );
});

const CustomersLayer = memo(function CustomersLayer({ game }: { game: GameState }) {
  const contracts = new Map(game.contracts.map((c) => [c.buildingId, c]));
  return (
    <g style={{ pointerEvents: 'none' }}>
      {game.buildings.map((b) => {
        if (b.kind === 'park') return null;
        const contract = contracts.get(b.id);
        const intensity = contract ? 1 : b.segment === 'residential' ? b.connected : 0;
        if (intensity <= 0.01) return null;
        const color = contract ? '#ffc857' : b.segment === 'business' ? '#68a5ff' : '#2dd4bf';
        return (
          <g key={`customer-${b.id}`}>
            <polygon
              points={tileDiamond(b.gx, b.gy, 0.06)}
              fill={color}
              fillOpacity={0.12 + intensity * 0.22}
              stroke={color}
              strokeOpacity={contract ? 0.95 : 0.35 + intensity * 0.35}
              strokeWidth={contract ? 2 : 0.8}
            />
            {contract && (
              <g className="contract-beacon">
                <circle cx={isoX(b.gx, b.gy)} cy={isoY(b.gx, b.gy) - b.floors * FLOOR_H - 10} r={7} fill="#07101c" stroke={color} strokeWidth={2} />
                <path d={`M ${isoX(b.gx, b.gy) - 3} ${isoY(b.gx, b.gy) - b.floors * FLOOR_H - 10} h 6`} stroke={color} strokeWidth={1.5} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});

function LinkGlyph({
  link,
  a,
  b,
  selected,
  onSelect,
  highlight,
  traced,
  bottleneck,
}: {
  link: NetLink;
  a: NetNode;
  b: NetNode;
  selected: boolean;
  onSelect: () => void;
  highlight: boolean;
  traced: boolean;
  bottleneck: boolean;
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
    <g onClick={(e) => (e.stopPropagation(), onSelect())} style={{ cursor: 'pointer' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={width + 6}
        opacity={0.12}
        strokeLinecap="round"
        filter="url(#fibreBloom)"
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
        className={link.down ? 'alert-blink' : traced ? 'network-route' : undefined}
      />
      {!link.down && (
        <>
          <circle cx={x1} cy={y1} r={width * 0.75} fill={color} opacity={0.9} />
          <circle cx={x2} cy={y2} r={width * 0.75} fill={color} opacity={0.9} />
        </>
      )}
      {!link.down && util > 0.02 && (
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
      {selected && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={width + 5} opacity={0.15} />
      )}
    </g>
  );
}

// Shape identifies the site type, its own accent identifies its family, and the
// outer arc reports load. These channels stay independent, so a busy POP never
// becomes visually interchangeable with a busy core.
function NodeGlyph({
  node,
  selected,
  onSelect,
  hasIncident,
  linking,
}: {
  node: NetNode;
  selected: boolean;
  onSelect: () => void;
  hasIncident: boolean;
  linking: boolean;
}) {
  const cx = isoX(node.gx, node.gy);
  const cy = isoY(node.gx, node.gy);
  const util = Math.min(1, nodeUtil(node));
  const statusColor = node.down ? '#ff6577' : utilColor(util);
  const visual = SITE_VISUAL[node.kind];

  const r = SITE_SIZE[node.kind];
  const mast = node.kind === 'tower' ? 26 + node.tier * 3 : 0;
  const my = cy - (mast ? mast * 0.5 : 10);

  // Utilisation arc around the plate. Drawn as a dashed circle so no path maths
  // is needed and it animates cleanly.
  const ringR = r + 3.5;
  const circumference = 2 * Math.PI * ringR;

  return (
    <g onClick={(e) => (e.stopPropagation(), onSelect())} style={{ cursor: 'pointer' }}>
      <title>{`${node.name} · ${visual.label} · Tier ${node.tier} · ${Math.round(util * 100)}% load`}</title>
      {node.kind === 'tower' && (
        <>
          <line x1={cx} y1={cy} x2={cx} y2={cy - mast} stroke={visual.accent} strokeWidth={1.8} strokeOpacity={0.72} />
          <line x1={cx - 5} y1={cy} x2={cx} y2={cy - mast} stroke="#2a3c53" strokeWidth={1} />
          <line x1={cx + 5} y1={cy} x2={cx} y2={cy - mast} stroke="#2a3c53" strokeWidth={1} />
          <circle cx={cx} cy={cy - mast - 2} r={2.2} fill="#ff6577" className="tower-blink" />
        </>
      )}

      {/* Footprint on the ground, so the marker is anchored to a place. */}
      <ellipse cx={cx} cy={cy + 1} rx={r + 5} ry={(r + 5) * 0.38} fill="#02060c" opacity={0.58} />
      <line x1={cx} y1={cy} x2={cx} y2={my + r * 0.7} stroke={visual.accent} strokeWidth={0.8} strokeOpacity={0.42} />

      {/* The plate itself */}
      <circle cx={cx} cy={my} r={r + 7} fill={visual.accent} opacity={selected || linking ? 0.17 : 0.08} className="pulse-soft" />
      <SitePlate kind={node.kind} cx={cx} cy={my} size={r} fill={node.down ? '#32131b' : mix('#0c1726', visual.accent, 0.1)} stroke={node.down ? '#ff6577' : visual.accent} />

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

      {/* Tier pips, so an upgraded site is readable without opening a panel. */}
      {node.tier > 1 && (
        <g>
          {Array.from({ length: Math.min(4, node.tier - 1) }, (_, i) => (
            <circle key={i} cx={cx - 4.5 + i * 3} cy={my + r + 4.5} r={1.1} fill={visual.accent} opacity={0.9} />
          ))}
        </g>
      )}

      {(selected || linking) && (
        <>
          <SitePlate kind={node.kind} cx={cx} cy={my} size={r + 6} fill="none" stroke={linking ? COMPANY : '#e8eef7'} strokeWidth={1.2} />
          <g transform={`translate(${cx} ${my - r - 18})`} style={{ pointerEvents: 'none' }}>
            <rect x={-33} y={-8} width={66} height={15} rx={3} fill="#07111d" stroke={visual.accent} strokeWidth={0.7} strokeOpacity={0.78} />
            <text y={2.5} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={6.8} fontWeight={700} letterSpacing={0.5} fill="#e8eef7">
              {visual.label.toUpperCase()}
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
}

function TechnicianGlyph({ t }: { t: Technician }) {
  const cx = isoX(t.gx, t.gy);
  const cy = isoY(t.gx, t.gy);
  return (
    <g>
      <ellipse cx={cx} cy={cy + 3} rx={7} ry={3} fill="#000" opacity={0.35} />
      <rect x={cx - 7} y={cy - 9} width={14} height={8} rx={2} fill="#ffc857" />
      <rect x={cx - 7} y={cy - 12} width={8} height={4} rx={1.5} fill="#ffdc8f" />
      <circle cx={cx - 4} cy={cy - 1} r={2} fill="#1b2330" />
      <circle cx={cx + 4} cy={cy - 1} r={2} fill="#1b2330" />
      {t.state === 'working' && (
        <circle cx={cx} cy={cy - 18} r={4} fill="#ffc857" className="alert-blink" />
      )}
    </g>
  );
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export default function MapView() {
  const game = useGame((s) => s.game) as GameState;
  const overlay = useGame((s) => s.overlay);
  const tool = useGame((s) => s.tool);
  const linkFrom = useGame((s) => s.linkFrom);
  const selection = useGame((s) => s.selection);
  const focusOn = useGame((s) => s.focusOn);
  const placeNode = useGame((s) => s.placeNode);
  const clickNodeForLink = useGame((s) => s.clickNodeForLink);
  const select = useGame((s) => s.select);
  const openIncident = useGame((s) => s.openIncident);
  const toasts = useGame((s) => s.toasts);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: -60, zoom: 1 });
  const [hover, setHover] = useState<{ gx: number; gy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; camX: number; camY: number; moved: boolean } | null>(null);
  const didInitialFit = useRef(false);

  const worldBounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const include = (x: number, y: number, padX = 0, padY = padX) => {
      minX = Math.min(minX, x - padX);
      maxX = Math.max(maxX, x + padX);
      minY = Math.min(minY, y - padY);
      maxY = Math.max(maxY, y + padY);
    };
    for (const district of game.districts) {
      for (const cell of district.cells) include(isoX(cell.gx, cell.gy), isoY(cell.gx, cell.gy), TILE_W / 2, TILE_H / 2);
      include(isoX(district.center.gx, district.center.gy), isoY(district.center.gx, district.center.gy) - 78, 60, 18);
    }
    for (const building of game.buildings) {
      include(isoX(building.gx, building.gy), isoY(building.gx, building.gy) - building.floors * FLOOR_H, TILE_W / 2, 24);
    }
    for (const node of game.nodes) {
      const mast = node.kind === 'tower' ? 26 + node.tier * 3 : 0;
      include(isoX(node.gx, node.gy), isoY(node.gx, node.gy) - mast, 28, 28);
    }
    if (!Number.isFinite(minX)) return { minX: -400, maxX: 400, minY: -220, maxY: 220 };
    return { minX, maxX, minY, maxY };
  }, [game.districts, game.buildings, game.nodes]);

  const fitCamera = useCallback(() => {
    const safe = { left: 24, right: 24, top: 30, bottom: 142 };
    const worldW = Math.max(1, worldBounds.maxX - worldBounds.minX);
    const worldH = Math.max(1, worldBounds.maxY - worldBounds.minY);
    const availableW = Math.max(240, size.w - safe.left - safe.right);
    const availableH = Math.max(180, size.h - safe.top - safe.bottom);
    const zoom = Math.min(1.25, Math.max(0.4, Math.min(availableW / worldW, availableH / worldH)));
    const worldCx = (worldBounds.minX + worldBounds.maxX) / 2;
    const worldCy = (worldBounds.minY + worldBounds.maxY) / 2;
    const safeCx = safe.left + availableW / 2;
    const safeCy = safe.top + availableH / 2;
    setCam({
      zoom,
      x: (safeCx - size.w / 2) / zoom - worldCx,
      y: (safeCy - size.h / 2) / zoom - worldCy,
    });
  }, [size, worldBounds]);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
      }
    };

    // Measure before the first paint, then keep it in step. The observer alone
    // was not enough: any layout change it missed left the map centred on the
    // wrong point, which is what made zooming and clicking feel off.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    if (didInitialFit.current || size.w <= 0 || size.h <= 0) return;
    didInitialFit.current = true;
    fitCamera();
  }, [fitCamera, size]);

  useEffect(() => {
    if (!focusOn) return;
    setCam((c) => ({ ...c, x: -isoX(focusOn.gx, focusOn.gy), y: -isoY(focusOn.gx, focusOn.gy), zoom: Math.max(c.zoom, 1.1) }));
  }, [focusOn]);

  // Quantised so the day/night value only changes a few dozen times per game
  // day, otherwise every building in the city re-renders on every tick.
  const night = Math.round((1 - daylight(game.minutes)) * 16) / 16;
  const nodeById = useMemo(() => {
    const m: Record<string, NetNode> = {};
    for (const n of game.nodes) m[n.id] = n;
    return m;
  }, [game.nodes]);

  const districtGrid = useMemo(() => {
    const m = new Map<string, District>();
    for (const d of game.districts) for (const c of d.cells) m.set(`${c.gx},${c.gy}`, d);
    return m;
  }, [game.districts]);

  const incidentByTarget = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of game.incidents) if (!i.resolved) m[i.targetId] = i.id;
    return m;
  }, [game.incidents]);

  const selectedRoute = useMemo(() => {
    if (selection?.type !== 'node') return null;
    const route = computeRoutes(game)[selection.id];
    if (!route) return { route: null, links: new Set<string>(), bottleneck: null as string | null };
    const links = new Set(route.path);
    const bottleneck = route.path
      .map((id) => game.links.find((l) => l.id === id))
      .filter((l): l is NetLink => Boolean(l))
      .sort((a, b) => linkUtil(b) - linkUtil(a))[0]?.id ?? null;
    return { route, links, bottleneck };
  }, [game, selection]);

  const toGrid = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      // size, not rect, because that is what the render transform is centred on.
      const sx = (clientX - rect.left - size.w / 2) / cam.zoom - cam.x;
      const sy = (clientY - rect.top - size.h / 2) / cam.zoom - cam.y;
      const { gx, gy } = unIso(sx, sy);
      const rx = Math.round(gx);
      const ry = Math.round(gy);
      if (rx < 0 || ry < 0 || rx >= game.gridSize || ry >= game.gridSize) return null;
      return { gx: rx, gy: ry };
    },
    [cam, size, game.gridSize],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is a nicety for smooth dragging, never a requirement.
    }
    drag.current = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        d.moved = true;
        setCam((c) => ({ ...c, x: d.camX + dx / c.zoom, y: d.camY + dy / c.zoom }));
      }
    } else if (tool) {
      setHover(toGrid(e.clientX, e.clientY));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const cell = toGrid(e.clientX, e.clientY);
    if (!cell) return;

    if (tool && tool !== 'fiber') {
      placeNode(tool, cell.gx, cell.gy);
      return;
    }
    if (tool === 'fiber') return; // fibre is drawn by clicking nodes

    const district = districtGrid.get(`${cell.gx},${cell.gy}`);
    if (district) select({ type: 'district', id: district.id });
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setCam((c) => {
      const zoom = Math.min(2.6, Math.max(0.4, c.zoom * factor));
      if (!rect || zoom === c.zoom) return { ...c, zoom };
      // Hold whatever is under the pointer still while the scale changes.
      const px = e.clientX - rect.left - size.w / 2;
      const py = e.clientY - rect.top - size.h / 2;
      return {
        zoom,
        x: px / zoom - px / c.zoom + c.x,
        y: py / zoom - py / c.zoom + c.y,
      };
    });
  };

  const ghostCost = useMemo(() => {
    if (!tool || tool === 'fiber') return null;
    return NODE_SPECS[tool].baseCost;
  }, [tool]);

  const linkFromNode = linkFrom ? nodeById[linkFrom] : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-900">
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-1000"
        style={{
          background: `linear-gradient(180deg, ${mix('#16243a', '#05070c', night)} 0%, ${mix(
            '#0d1524',
            '#04060a',
            night,
          )} 100%)`,
        }}
      />
      <svg
        ref={svgRef}
        className={`map-surface relative h-full w-full ${drag.current ? 'dragging' : ''} ${tool ? 'building' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (drag.current = null)}
        onWheel={onWheel}
      >
        <defs>
          <filter id="fibreBloom" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${cam.zoom}) translate(${cam.x} ${cam.y})`}>
          <GroundLayer districts={game.districts} night={night} />

          {overlay === 'coverage' && (
            <CoverageLayer nodes={game.nodes} districts={game.districts} spectrum={game.spectrum} />
          )}

          {overlay === 'rivals' && <RivalsLayer game={game} />}

          <BuildingsLayer
            buildings={game.buildings}
            night={night}
            dim={overlay === 'load' || overlay === 'rivals' || overlay === 'customers'}
            minutes={game.minutes}
          />

          {overlay === 'customers' && <CustomersLayer game={game} />}

          {tool && tool !== 'fiber' && hover && (
            <g opacity={0.85} style={{ pointerEvents: 'none' }}>
              <polygon points={tileDiamond(hover.gx, hover.gy, 0)} fill={COMPANY} opacity={0.25} />
              <circle cx={isoX(hover.gx, hover.gy)} cy={isoY(hover.gx, hover.gy) - 8} r={11} fill="#0f1622" stroke={COMPANY} strokeWidth={2} />
              <text
                x={isoX(hover.gx, hover.gy)}
                y={isoY(hover.gx, hover.gy) - 26}
                textAnchor="middle"
                fontSize={11}
                fill={COMPANY}
                className="num"
              >
                ${ghostCost?.toLocaleString()}
              </text>
            </g>
          )}

          {tool === 'fiber' && linkFromNode && hover && (
            <g style={{ pointerEvents: 'none' }}>
              <line
                x1={isoX(linkFromNode.gx, linkFromNode.gy)}
                y1={isoY(linkFromNode.gx, linkFromNode.gy) - 6}
                x2={isoX(hover.gx, hover.gy)}
                y2={isoY(hover.gx, hover.gy) - 6}
                stroke={COMPANY}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.8}
              />
              <text
                x={(isoX(linkFromNode.gx, linkFromNode.gy) + isoX(hover.gx, hover.gy)) / 2}
                y={(isoY(linkFromNode.gx, linkFromNode.gy) + isoY(hover.gx, hover.gy)) / 2 - 14}
                textAnchor="middle"
                fontSize={11}
                fill={COMPANY}
                className="num"
              >
                $
                {Math.round(
                  Math.hypot(linkFromNode.gx - hover.gx, linkFromNode.gy - hover.gy) * FIBER_COST_PER_UNIT,
                ).toLocaleString()}
              </text>
            </g>
          )}

          {game.links.map((l) => {
            const a = nodeById[l.aId];
            const b = nodeById[l.bId];
            if (!a || !b) return null;
            return (
              <LinkGlyph
                key={l.id}
                link={l}
                a={a}
                b={b}
                selected={selection?.type === 'link' && selection.id === l.id}
                highlight={overlay === 'load'}
                traced={selectedRoute?.links.has(l.id) ?? false}
                bottleneck={selectedRoute?.bottleneck === l.id}
                onSelect={() =>
                  incidentByTarget[l.id] ? openIncident(incidentByTarget[l.id]) : select({ type: 'link', id: l.id })
                }
              />
            );
          })}

          {[...game.nodes]
            .sort((a, b) => a.gx + a.gy - (b.gx + b.gy))
            .map((n) => (
              <NodeGlyph
                key={n.id}
                node={n}
                selected={selection?.type === 'node' && selection.id === n.id}
                linking={tool === 'fiber' && linkFrom === n.id}
                hasIncident={!!incidentByTarget[n.id]}
                onSelect={() => {
                  if (tool === 'fiber') clickNodeForLink(n.id);
                  else if (incidentByTarget[n.id]) openIncident(incidentByTarget[n.id]);
                  else select({ type: 'node', id: n.id });
                }}
              />
            ))}

          {game.technicians.filter((t) => t.state !== 'idle').map((t) => (
            <TechnicianGlyph key={t.id} t={t} />
          ))}

          {game.incidents
            .filter((i) => !i.resolved && i.targetType === 'link')
            .map((i) => {
              const p = incidentLocation(game, i);
              return (
                <g
                  key={i.id}
                  className="alert-blink"
                  onClick={(e) => (e.stopPropagation(), openIncident(i.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={isoX(p.gx, p.gy)} cy={isoY(p.gx, p.gy) - 14} r={9} fill="#ff5c68" />
                  <text
                    x={isoX(p.gx, p.gy)}
                    y={isoY(p.gx, p.gy) - 10}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#0b0e14"
                  >
                    !
                  </text>
                </g>
              );
            })}

          {game.districts.map((d) => {
            const lx = isoX(d.center.gx, d.center.gy);
            const ly = isoY(d.center.gx, d.center.gy) - 104;
            return (
              <g key={`lbl${d.id}`} style={{ pointerEvents: 'none' }}>
                <rect
                  x={lx - 62}
                  y={ly - 13}
                  width={124}
                  height={d.unlocked ? 20 : 34}
                  rx={3}
                  fill="#050b14"
                  opacity={0.6}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  className="font-display"
                  fontSize={13}
                  fontWeight={600}
                  letterSpacing="0.22em"
                  fill={d.unlocked ? '#eaf1fa' : '#9fb2c9'}
                  opacity={d.unlocked ? 0.95 : 0.7}
                >
                  {d.name.toUpperCase()}
                </text>
                <line
                  x1={lx - 22}
                  y1={ly + 5}
                  x2={lx + 22}
                  y2={ly + 5}
                  stroke={d.color}
                  strokeWidth={1}
                  opacity={d.unlocked ? 0.5 : 0.25}
                />
                {!d.unlocked && (
                  <text
                    x={lx}
                    y={ly + 19}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={10}
                    fill="#8ea0b8"
                    opacity={0.75}
                  >
                    LICENCE ${d.entryCost.toLocaleString()}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Vignette pulls the eye to the middle of the board. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(135% 110% at 50% 46%, transparent 52%, rgba(4,9,17,0.16) 80%, rgba(3,7,13,0.38) 100%)',
        }}
      />

      {/* Fine grain, so the flat fills do not read as plastic. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="pointer-events-none absolute inset-0">
        <AnimatePresence>
          {toasts
            .filter((t) => t.gx !== undefined)
            .map((t) => {
              const x = size.w / 2 + (isoX(t.gx!, t.gy!) + cam.x) * cam.zoom;
              const y = size.h / 2 + (isoY(t.gx!, t.gy!) + cam.y) * cam.zoom;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 0, scale: 0.8 }}
                  animate={{ opacity: 1, y: -34, scale: 1 }}
                  exit={{ opacity: 0, y: -52 }}
                  transition={{ duration: 0.5 }}
                  className={`absolute -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg ${
                    t.tone === 'good'
                      ? 'bg-neon-cyan/90 text-ink-900'
                      : t.tone === 'bad'
                        ? 'bg-neon-red/90 text-ink-900'
                        : 'bg-white/85 text-ink-900'
                  }`}
                  style={{ left: x, top: y }}
                >
                  {t.text}
                </motion.div>
              );
            })}
        </AnimatePresence>
      </div>

      {selection?.type === 'node' && selectedRoute && (
        <div className="panel pointer-events-none absolute bottom-[92px] right-4 w-[230px] p-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-neon-cyan">Route trace</span>
            <span className={`h-2 w-2 rounded-full ${selectedRoute.route ? 'bg-neon-lime shadow-[0_0_9px_#7ee787]' : 'bg-neon-red shadow-[0_0_9px_#ff5d73]'}`} />
          </div>
          {selectedRoute.route ? (
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div><div className="num text-sm text-white">{selectedRoute.route.path.length}</div><div className="stat-label">Hops</div></div>
              <div><div className="num text-sm text-white">{selectedRoute.route.distance.toFixed(1)}</div><div className="stat-label">Distance</div></div>
              <div><div className="num text-sm text-neon-amber">{selectedRoute.bottleneck ? Math.round(linkUtil(game.links.find((l) => l.id === selectedRoute.bottleneck)!) * 100) : 0}%</div><div className="stat-label">Peak</div></div>
              <div className="col-span-3 border-t border-white/[0.07] pt-2 text-left text-[10px] text-white/45">
                Cyan spans show the active path. Amber-red marks its tightest link.
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-neon-red">No live path to a core router.</div>
          )}
        </div>
      )}

      <div className="panel pointer-events-none absolute bottom-4 left-4 hidden items-center gap-3 px-3 py-2 lg:flex">
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Site key</span>
        <div className="h-5 w-px bg-white/10" />
        {(['core', 'pop', 'access', 'tower', 'datacenter'] as NetNode['kind'][]).map((kind) => {
          const visual = SITE_VISUAL[kind];
          return (
            <span key={kind} className="flex items-center gap-1.5 font-mono text-[9px] text-white/55">
              <SiteIcon kind={kind} className="h-4 w-4" />
              {visual.label}
            </span>
          );
        })}
      </div>

      <div className="absolute bottom-24 right-4 flex flex-col gap-1">
        <button
          className="panel h-8 w-8 text-lg leading-none hover:bg-white/10"
          onClick={() => setCam((c) => ({ ...c, zoom: Math.min(2.6, c.zoom * 1.2) }))}
        >
          +
        </button>
        <button
          className="panel h-8 w-8 text-lg leading-none hover:bg-white/10"
          onClick={() => setCam((c) => ({ ...c, zoom: Math.max(0.4, c.zoom / 1.2) }))}
        >
          −
        </button>
        <button
          className="panel h-8 w-8 text-[10px] leading-none hover:bg-white/10"
          onClick={fitCamera}
          title="Fit city inside the usable map area"
        >
          fit
        </button>
      </div>
    </div>
  );
}
