import { buildingPaint } from '../cityCanvas';
import { sameDistrictMap, sameIds, visualConnection } from '../mapVisuals';
import CityFoundation from '../CityFoundation';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { towerRadius } from '../../game/constants';
import { isRoad } from '../../game/cityGen';
import { leaderOf } from '../../game/competitors';
import type { Building, District, GameState, NetNode, SpectrumHolding } from '../../game/types';
import { FLOOR_H, TILE_H, TILE_W, isoX, isoY, mix, tileDiamond } from '../iso';
import { COMPANY, MAP, COVERAGE_RADIUS } from './palette';

export const GroundLayer = memo(
  function GroundLayer({
    districts,
    night,
    selectedId,
    outageIds,
    obligationIds,
  }: {
    districts: District[];
    night: number;
    selectedId: string | null;
    outageIds: string[];
    obligationIds: string[];
  }) {
    const tiles: JSX.Element[] = [];
    const marks: JSX.Element[] = [];
    const junctions: JSX.Element[] = [];
    const outages = new Set(outageIds);
    const obligations = new Set(obligationIds);

    districts.forEach((d, di) => {
      // Alternating value, not hue, so five districts read apart without turning the city into a colour chart.
      const plate = mix(mix(di % 2 === 0 ? MAP.ground : MAP.groundAlt, d.color, 0.1), '#000000', night * 0.3);
      const statePlate = outages.has(d.id)
        ? mix(plate, '#d36e76', 0.3)
        : obligations.has(d.id)
          ? mix(plate, '#d2a657', 0.16)
          : selectedId === d.id
            ? mix(plate, COMPANY, 0.2)
            : plate;
      const surface = d.unlocked ? statePlate : mix(MAP.locked, '#000000', night * 0.3);
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

    // Boundaries carry the district colour, drawn as the shared edge between two districts rather than a ring around every border tile.
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

      const stateColor = outages.has(d.id)
        ? '#d36e76'
        : obligations.has(d.id)
          ? '#d2a657'
          : selectedId === d.id
            ? COMPANY
            : d.color;
      const stateActive = outages.has(d.id) || obligations.has(d.id) || selectedId === d.id;
      return (
        <g key={`o${d.id}`} className={stateActive ? 'district-state-pulse' : undefined}>
          {segments.map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stateColor}
              strokeWidth={stateActive ? 1.8 : d.unlocked ? 1 : 0.7}
              strokeDasharray={!d.unlocked ? '4 4' : undefined}
              opacity={stateActive ? 0.78 : d.unlocked ? 0.3 : 0.16}
            />
          ))}
        </g>
      );
    });

    return (
      <g data-ground-tiles="true">
        <CityFoundation districts={districts} />
        {tiles}
        {marks}
        {junctions}
        {outlines}
      </g>
    );
  },
  (a, b) =>
    a.night === b.night &&
    a.selectedId === b.selectedId &&
    sameIds(a.outageIds, b.outageIds) &&
    sameIds(a.obligationIds, b.obligationIds) &&
    sameDistrictMap(a.districts, b.districts),
);

export const CityTraffic = memo(
  function CityTraffic({ districts }: { districts: District[] }) {
    const cars = districts
      .filter((d) => d.unlocked)
      .flatMap((d) => {
        const cells = new Set(d.cells.map((c) => `${c.gx},${c.gy}`));
        return d.cells.filter((c) => c.gx % 5 === 0 && c.gy % 5 === 1 && cells.has(`${c.gx},${c.gy + 3}`));
      })
      .slice(0, 6);
    return (
      <g pointerEvents="none" aria-hidden="true">
        {cars.map((c, i) => (
          <g key={`${c.gx},${c.gy}`} transform={`translate(${isoX(c.gx, c.gy) + 4} ${isoY(c.gx, c.gy)})`}>
            <g className="city-car" style={{ animationDelay: `${-i * 1.7}s`, animationDuration: `${7 + (i % 5)}s` }}>
              <path d="M-4 0L1 -3 5 -1 0 2Z" fill={['#dfba75', '#cedddb', '#85aebc'][i % 3]} />
              <path d="M-4 0v2l4 2v-2m0 0l5 -3v2L0 4" fill="#344956" />
            </g>
          </g>
        ))}
      </g>
    );
  },
  (a, b) => sameDistrictMap(a.districts, b.districts),
);

// Decorative architecture shares a canvas; network controls remain interactive SVG.
export const BuildingsLayer = memo(function BuildingsLayer({
  buildings,
  developedIds,
  night,
  dim,
  minutes,
  economical,
}: {
  buildings: Building[];
  developedIds: Set<string>;
  night: number;
  dim: boolean;
  minutes: number;
  economical: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastPaint = useRef('');
  const bounds = useMemo(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const b of buildings) {
      const x = isoX(b.gx, b.gy),
        y = isoY(b.gx, b.gy);
      minX = Math.min(minX, x - TILE_W);
      maxX = Math.max(maxX, x + TILE_W + b.floors * FLOOR_H);
      minY = Math.min(minY, y - b.floors * FLOOR_H - TILE_H - 40);
      maxY = Math.max(maxY, y + TILE_H);
    }
    return buildings.length
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : { x: 0, y: 0, width: 1, height: 1 };
  }, [buildings]);
  const resolution = Math.min(
    window.devicePixelRatio || 1,
    economical ? 1 : 2,
    4096 / bounds.width,
    4096 / bounds.height,
  );
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const signature = JSON.stringify([
      night,
      dim,
      resolution,
      bounds,
      [...developedIds],
      buildings.map((b) => [b.id, b.gx, b.gy, b.kind, b.seed, b.floors, visualConnection(b.connected)]),
    ]);
    if (lastPaint.current === signature) return;
    lastPaint.current = signature;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(resolution, 0, 0, resolution, -bounds.x * resolution, -bounds.y * resolution);
    for (const b of [...buildings].sort((a, b) => a.gx + a.gy - b.gx - b.gy)) {
      for (const op of buildingPaint(b, night, dim, developedIds.has(b.id))) {
        if (op.fill !== 'none') {
          ctx.globalAlpha = op.fillAlpha;
          ctx.fillStyle = op.fill;
          ctx.fill(op.path);
        }
        if (op.stroke && op.stroke !== 'none') {
          ctx.globalAlpha = op.strokeAlpha;
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.width;
          ctx.stroke(op.path);
        }
      }
    }
    ctx.globalAlpha = 1;
  }, [buildings, night, dim, developedIds, bounds, resolution]);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <foreignObject {...bounds}>
        <canvas
          ref={canvas}
          width={Math.ceil(bounds.width * resolution)}
          height={Math.ceil(bounds.height * resolution)}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </foreignObject>
      {buildings
        .filter((b) => minutes - b.lastConnectedAt < 25)
        .slice(0, economical ? 8 : 32)
        .map((b) => (
          <circle
            key={b.id}
            cx={isoX(b.gx, b.gy)}
            cy={isoY(b.gx, b.gy) - Math.max(4, b.floors * FLOOR_H)}
            r={16}
            fill="none"
            stroke={COMPANY}
            strokeWidth={1.5}
            opacity={0.9}
          >
            <animate attributeName="r" from="4" to="22" dur="0.9s" fill="freeze" />
            <animate attributeName="opacity" from="0.9" to="0" dur="0.9s" fill="freeze" />
          </circle>
        ))}
    </g>
  );
});

export const RivalsLayer = memo(function RivalsLayer({ game }: { game: GameState }) {
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

export const CoverageLayer = memo(function CoverageLayer({
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
        <polygon
          key={`c${c.gx}_${c.gy}`}
          points={tileDiamond(c.gx, c.gy, 0.02)}
          fill={color}
          opacity={0.14 + best * 0.3}
        />,
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

export const CustomersLayer = memo(function CustomersLayer({ game }: { game: GameState }) {
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
                <circle
                  cx={isoX(b.gx, b.gy)}
                  cy={isoY(b.gx, b.gy) - b.floors * FLOOR_H - 10}
                  r={7}
                  fill="#07101c"
                  stroke={color}
                  strokeWidth={2}
                />
                <path
                  d={`M ${isoX(b.gx, b.gy) - 3} ${isoY(b.gx, b.gy) - b.floors * FLOOR_H - 10} h 6`}
                  stroke={color}
                  strokeWidth={1.5}
                />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});
