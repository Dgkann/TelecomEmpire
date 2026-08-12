import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NODE_SPECS, utilColor, FIBER_COST_PER_UNIT, towerRadius } from '../game/constants';
import { isRoad } from '../game/cityGen';
import { leaderOf } from '../game/competitors';
import { linkUtil, nodeUtil } from '../game/network';
import { daylight, incidentLocation } from '../game/simulation';
import { useGame } from '../store/gameStore';
import type { Building, District, GameState, NetLink, NetNode, SpectrumHolding, Technician } from '../game/types';
import { FLOOR_H, TILE_H, TILE_W, isoX, isoY, mix, shade, tileDiamond, unIso } from './iso';

const COMPANY = '#3ee6d6';

const GroundLayer = memo(function GroundLayer({
  districts,
  grid,
  night,
}: {
  districts: District[];
  grid: number;
  night: number;
}) {
  const tiles: JSX.Element[] = [];
  const roadColor = mix('#1b2330', '#2a3546', 1 - night);

  for (const d of districts) {
    const base = mix(d.color, '#0e1420', 0.78);
    const lit = d.unlocked ? base : mix(base, '#0a0d14', 0.55);
    for (const c of d.cells) {
      const road = isRoad(c.gx, c.gy);
      tiles.push(
        <polygon
          key={`g${c.gx}_${c.gy}`}
          points={tileDiamond(c.gx, c.gy, road ? 0 : 0.05)}
          fill={road ? roadColor : lit}
        />,
      );
    }
  }

  const outlines = districts.map((d) => {
    const set = new Set(d.cells.map((c) => `${c.gx},${c.gy}`));
    const edges: string[] = [];
    for (const c of d.cells) {
      const n = [
        [c.gx + 1, c.gy],
        [c.gx - 1, c.gy],
        [c.gx, c.gy + 1],
        [c.gx, c.gy - 1],
      ];
      const isEdge =
        n.some(([x, y]) => !set.has(`${x},${y}`)) || c.gx === 0 || c.gy === 0 || c.gx === grid - 1 || c.gy === grid - 1;
      if (isEdge) edges.push(tileDiamond(c.gx, c.gy, 0.05));
    }
    return (
      <g key={`o${d.id}`} opacity={d.unlocked ? 0.35 : 0.5}>
        {edges.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke={d.color} strokeWidth={0.7} opacity={0.5} />
        ))}
      </g>
    );
  });

  return (
    <g>
      {tiles}
      {outlines}
    </g>
  );
});

const KIND_COLOR: Record<Building['kind'], string> = {
  house: '#6b7a90',
  apartment: '#7c88a3',
  office: '#8894b0',
  shop: '#8d7f9c',
  industrial: '#6f7480',
  hospital: '#9aa7b8',
  university: '#93a0b6',
  park: '#2f5c43',
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
        <polygon points={tileDiamond(b.gx, b.gy, 0.08)} fill={mix('#2f5c43', '#0b1a12', night * 0.6)} />
        <circle cx={cx} cy={cy - 3} r={4} fill={mix('#3f7d59', '#12281c', night * 0.5)} />
      </g>
    );
  }

  const h = Math.max(4, b.floors * FLOOR_H);
  const base = KIND_COLOR[b.kind];
  const connected = b.connected;
  const tinted = connected > 0.02 ? mix(base, COMPANY, Math.min(0.62, connected * 0.75)) : base;
  const body = dim ? mix(tinted, '#0d1119', 0.6) : tinted;

  const top = mix(body, '#0a0e15', night * 0.45);
  const left = shade(mix(body, '#0a0e15', night * 0.5), -26);
  const right = shade(mix(body, '#0a0e15', night * 0.5), -48);

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
      <polygon points={topPts} fill={top} stroke={connected > 0.5 ? COMPANY : 'none'} strokeOpacity={0.35} strokeWidth={0.6} />
      {windows}
      {connected > 0.02 && (
        <circle cx={cx} cy={cy - h - hh - 3} r={1.8 + connected * 1.6} fill={COMPANY} opacity={0.5 + connected * 0.4} />
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

function LinkGlyph({
  link,
  a,
  b,
  selected,
  onSelect,
  highlight,
}: {
  link: NetLink;
  a: NetNode;
  b: NetNode;
  selected: boolean;
  onSelect: () => void;
  highlight: boolean;
}) {
  const x1 = isoX(a.gx, a.gy);
  const y1 = isoY(a.gx, a.gy) - 6;
  const x2 = isoX(b.gx, b.gy);
  const y2 = isoY(b.gx, b.gy) - 6;
  const util = linkUtil(link);
  const color = link.down ? '#ff5c68' : utilColor(util);
  const width = 1.6 + Math.min(2.6, link.tier * 0.8);
  // Busier spans animate faster; idle spans barely move.
  const dur = Math.max(0.6, 5 - util * 4.2);

  return (
    <g onClick={(e) => (e.stopPropagation(), onSelect())} style={{ cursor: 'pointer' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width + 3} opacity={0.16} />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={selected || highlight ? width + 1.4 : width}
        opacity={link.down ? 0.9 : 0.75}
        strokeDasharray={link.down ? '5 5' : undefined}
        className={link.down ? 'alert-blink' : undefined}
      />
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
  const util = nodeUtil(node);
  const color = node.down ? '#ff5c68' : utilColor(util);
  const spec = NODE_SPECS[node.kind];
  const size = node.kind === 'core' ? 13 : node.kind === 'datacenter' ? 12 : node.kind === 'pop' ? 10 : 8;
  const mast = node.kind === 'tower' ? 30 + node.tier * 4 : 0;

  return (
    <g onClick={(e) => (e.stopPropagation(), onSelect())} style={{ cursor: 'pointer' }}>
      {node.kind === 'tower' && (
        <>
          <line x1={cx} y1={cy} x2={cx} y2={cy - mast} stroke="#9fb0c6" strokeWidth={2} />
          <line x1={cx - 6} y1={cy} x2={cx} y2={cy - mast} stroke="#7f8ea3" strokeWidth={1} />
          <line x1={cx + 6} y1={cy} x2={cx} y2={cy - mast} stroke="#7f8ea3" strokeWidth={1} />
          <circle cx={cx} cy={cy - mast - 3} r={2.6} fill="#ff5c68" className="tower-blink" />
        </>
      )}
      <ellipse cx={cx} cy={cy + 2} rx={size + 5} ry={(size + 5) / 2.4} fill="#000" opacity={0.35} />
      <circle cx={cx} cy={cy - (mast ? mast * 0.35 : 8)} r={size + 6} fill={color} opacity={0.12} className="pulse-soft" />
      <circle cx={cx} cy={cy - (mast ? mast * 0.35 : 8)} r={size} fill="#0f1622" stroke={color} strokeWidth={2} />
      <text
        x={cx}
        y={cy - (mast ? mast * 0.35 : 8) + size * 0.36}
        textAnchor="middle"
        fontSize={size * 0.95}
        fill={color}
        style={{ pointerEvents: 'none' }}
      >
        {spec.icon}
      </text>
      {(selected || linking) && (
        <circle
          cx={cx}
          cy={cy - (mast ? mast * 0.35 : 8)}
          r={size + 9}
          fill="none"
          stroke={linking ? COMPANY : '#fff'}
          strokeWidth={1.6}
          strokeDasharray="4 3"
          opacity={0.9}
        />
      )}
      {hasIncident && (
        <g className="alert-blink">
          <circle cx={cx + size + 4} cy={cy - size - 10} r={7} fill="#ff5c68" />
          <text x={cx + size + 4} y={cy - size - 6.5} textAnchor="middle" fontSize={9} fill="#0b0e14" fontWeight={700}>
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
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: -60, zoom: 1 });
  const [hover, setHover] = useState<{ gx: number; gy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; camX: number; camY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const toGrid = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const sx = (clientX - rect.left - rect.width / 2) / cam.zoom - cam.x;
      const sy = (clientY - rect.top - rect.height / 2) / cam.zoom - cam.y;
      const { gx, gy } = unIso(sx, sy);
      const rx = Math.round(gx);
      const ry = Math.round(gy);
      if (rx < 0 || ry < 0 || rx >= game.gridSize || ry >= game.gridSize) return null;
      return { gx: rx, gy: ry };
    },
    [cam, game.gridSize],
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
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setCam((c) => ({ ...c, zoom: Math.min(2.6, Math.max(0.4, c.zoom * factor)) }));
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
        <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${cam.zoom}) translate(${cam.x} ${cam.y})`}>
          <GroundLayer districts={game.districts} grid={game.gridSize} night={night} />

          {overlay === 'coverage' && (
            <CoverageLayer nodes={game.nodes} districts={game.districts} spectrum={game.spectrum} />
          )}

          {overlay === 'rivals' && <RivalsLayer game={game} />}

          <BuildingsLayer
            buildings={game.buildings}
            night={night}
            dim={overlay === 'load' || overlay === 'rivals'}
            minutes={game.minutes}
          />

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

          {game.districts.map((d) => (
            <g key={`lbl${d.id}`} style={{ pointerEvents: 'none' }} opacity={cam.zoom < 0.75 ? 1 : 0.55}>
              <text
                x={isoX(d.center.gx, d.center.gy)}
                y={isoY(d.center.gx, d.center.gy) - 70}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill={d.unlocked ? '#dfe8f4' : '#7c8aa0'}
                opacity={0.75}
              >
                {d.name}
              </text>
              {!d.unlocked && (
                <text
                  x={isoX(d.center.gx, d.center.gy)}
                  y={isoY(d.center.gx, d.center.gy) - 56}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#8ea0b8"
                  className="num"
                >
                  Licence ${d.entryCost.toLocaleString()}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>

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
          onClick={() => setCam({ x: 0, y: -60, zoom: 1 })}
        >
          fit
        </button>
      </div>
    </div>
  );
}
