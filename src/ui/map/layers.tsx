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

    return (
      <g data-ground-tiles="true">
        <CityFoundation districts={districts} />
        {tiles}
        {marks}
        {junctions}
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

// District borders pulse while a district is selected, failing or owes an obligation, so they
// live on their own map layer and the animation never repaints the ground beneath them.
export const DistrictOutlines = memo(
  function DistrictOutlines({
    districts,
    selectedId,
    outageIds,
    obligationIds,
  }: {
    districts: District[];
    selectedId: string | null;
    outageIds: string[];
    obligationIds: string[];
  }) {
    const outages = new Set(outageIds);
    const obligations = new Set(obligationIds);
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

    return <g aria-hidden="true">{outlines}</g>;
  },
  (a, b) =>
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

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Everything a building paints plus a small anti-aliasing margin: the roof or marker above the
// top face and the shadow thrown to the right are its widest parts.
function paintBox(b: Building): Box {
  const x = isoX(b.gx, b.gy),
    y = isoY(b.gx, b.gy);
  const h = b.kind === 'park' ? 0 : Math.max(4, b.floors * FLOOR_H);
  return { x0: x - TILE_W / 2 - 2, x1: x + TILE_W / 2 + h * 0.4 + 2, y0: y - h - TILE_H - 2, y1: y + TILE_H / 2 + 3 };
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

interface Painted {
  scene: string;
  looks: Map<string, string>;
  boxes: Map<string, Box>;
}

interface LightLayer {
  canvas: HTMLCanvasElement;
  light: number;
  painted: Painted | null;
}

// Decorative architecture shares a canvas; network controls remain interactive SVG.
export const BuildingsLayer = memo(function BuildingsLayer({
  buildings,
  developedIds,
  night,
  dim,
  economical,
}: {
  buildings: Building[];
  developedIds: Set<string>;
  night: number;
  dim: boolean;
  economical: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastNight = useRef<number | null>(null);
  const lightLayers = useRef<LightLayer[] | null>(null);
  const scratchCanvas = useRef<HTMLCanvasElement | null>(null);
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
    const view = canvas.current?.getContext('2d');
    if (!view) return;
    const { width, height } = view.canvas;
    // Every building colour is a straight line between its daylight and night colours, so the city
    // is kept painted in both and the visible canvas only blends them when the hour changes.
    const layers = (lightLayers.current ??= [
      { canvas: document.createElement('canvas'), light: 0, painted: null },
      { canvas: document.createElement('canvas'), light: 1, painted: null },
    ]);
    // A layer the current hour does not show is left alone and caught up when it is next needed.
    const needed = layers.filter((layer) => (layer.light === 0 ? night < 1 : night > 0));
    // Dimming and the canvas size touch every building at once.
    const scene = `${dim}|${resolution}|${bounds.x},${bounds.y},${bounds.width},${bounds.height}|${buildings.length}`;
    const looks = new Map<string, string>();
    for (const b of buildings)
      looks.set(
        b.id,
        `${b.gx},${b.gy},${b.kind},${b.seed},${b.floors},${visualConnection(b.connected)},${developedIds.has(b.id)}`,
      );
    const ordered = [...buildings].sort((a, b) => a.gx + a.gy - b.gx - b.gy);
    const boxes = new Map(buildings.map((b) => [b.id, paintBox(b)]));
    // Paints into any context whose origin is `offsetX, offsetY` device pixels into the canvas.
    const draw = (target: CanvasRenderingContext2D, light: number, drawn: Building[], offsetX = 0, offsetY = 0) => {
      target.setTransform(
        resolution,
        0,
        0,
        resolution,
        -bounds.x * resolution - offsetX,
        -bounds.y * resolution - offsetY,
      );
      for (const b of drawn) {
        for (const op of buildingPaint(b, light, dim, developedIds.has(b.id))) {
          if (op.fill !== 'none') {
            target.globalAlpha = op.fillAlpha;
            target.fillStyle = op.fill;
            target.fill(op.path);
          }
          if (op.stroke && op.stroke !== 'none') {
            target.globalAlpha = op.strokeAlpha;
            target.strokeStyle = op.stroke;
            target.lineWidth = op.width;
            target.stroke(op.path);
          }
        }
      }
      target.globalAlpha = 1;
    };
    const whole: [number, number, number, number] = [0, 0, width, height];
    // Pixel rectangles to re-blend onto the visible canvas.
    let blend: Array<[number, number, number, number]> = lastNight.current === night ? [] : [whole];
    lastNight.current = night;

    for (const layer of needed) {
      const before = layer.painted;
      layer.painted = { scene, looks, boxes };
      let full = !before || before.scene !== scene;
      const dirty: Box[] = [];
      for (const [id, look] of full ? [] : looks) {
        const previous = before!.looks.get(id);
        if (previous === undefined) {
          full = true;
          break;
        }
        if (previous === look) continue;
        // Cover where it was and where it is now; merge overlapping areas so a busy block is repainted once.
        let area = union(before!.boxes.get(id)!, boxes.get(id)!);
        for (let i = dirty.length - 1; i >= 0; i--)
          if (overlaps(dirty[i], area)) area = union(area, dirty.splice(i, 1)[0]);
        dirty.push(area);
      }
      const pieces = dirty
        .map((area) => {
          const x0 = Math.max(0, Math.floor((area.x0 - bounds.x) * resolution));
          const y0 = Math.max(0, Math.floor((area.y0 - bounds.y) * resolution));
          const x1 = Math.min(width, Math.ceil((area.x1 - bounds.x) * resolution));
          const y1 = Math.min(height, Math.ceil((area.y1 - bounds.y) * resolution));
          const covered = {
            x0: x0 / resolution + bounds.x,
            y0: y0 / resolution + bounds.y,
            x1: x1 / resolution + bounds.x,
            y1: y1 / resolution + bounds.y,
          };
          return { x0, y0, w: x1 - x0, h: y1 - y0, drawn: ordered.filter((b) => overlaps(boxes.get(b.id)!, covered)) };
        })
        .filter((piece) => piece.w > 0 && piece.h > 0);
      // Past the point where patching costs more than starting over, repaint the layer.
      if (pieces.reduce((sum, piece) => sum + piece.drawn.length, 0) > buildings.length) full = true;
      if (full) {
        // Setting the size also clears the layer.
        layer.canvas.width = width;
        layer.canvas.height = height;
        const target = layer.canvas.getContext('2d');
        if (!target) return;
        draw(target, layer.light, ordered);
        blend = [whole];
        continue;
      }
      if (!pieces.length) continue;
      // A customer change only repaints the pixels around that building. The area is drawn on a
      // scratch canvas, neighbours included, and copied in whole: a clip would blend its edges.
      const scratch = (scratchCanvas.current ??= document.createElement('canvas'));
      const needWidth = Math.max(...pieces.map((piece) => piece.w));
      const needHeight = Math.max(...pieces.map((piece) => piece.h));
      if (scratch.width < needWidth || scratch.height < needHeight) {
        scratch.width = Math.max(scratch.width, needWidth);
        scratch.height = Math.max(scratch.height, needHeight);
      }
      const piece = scratch.getContext('2d');
      const target = layer.canvas.getContext('2d');
      if (!piece || !target) return;
      target.setTransform(1, 0, 0, 1, 0, 0);
      for (const { x0, y0, w, h, drawn } of pieces) {
        piece.setTransform(1, 0, 0, 1, 0, 0);
        piece.clearRect(0, 0, w, h);
        draw(piece, layer.light, drawn, x0, y0);
        target.clearRect(x0, y0, w, h);
        target.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
        if (blend[0] !== whole) blend.push([x0, y0, w, h]);
      }
    }
    if (!blend.length) return;
    // 'lighter' adds the two weighted layers, which is an exact blend where both are opaque.
    const [day, dark] = layers;
    view.setTransform(1, 0, 0, 1, 0, 0);
    for (const [x, y, w, h] of blend) {
      view.clearRect(x, y, w, h);
      if (night < 1) {
        view.globalAlpha = 1 - night;
        view.drawImage(day.canvas, x, y, w, h, x, y, w, h);
      }
      if (night > 0) {
        view.globalAlpha = night;
        view.globalCompositeOperation = 'lighter';
        view.drawImage(dark.canvas, x, y, w, h, x, y, w, h);
        view.globalCompositeOperation = 'source-over';
      }
    }
    view.globalAlpha = 1;
  }, [buildings, night, dim, developedIds, bounds, resolution]);
  // Positioned in world units inside the map's camera layer, which moves it without repainting.
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      width={Math.ceil(bounds.width * resolution)}
      height={Math.ceil(bounds.height * resolution)}
      style={{
        position: 'absolute',
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        display: 'block',
      }}
    />
  );
});

// Rings where a building has just joined the network, drawn above the architecture.
export const ConnectionRings = memo(function ConnectionRings({
  buildings,
  minutes,
  economical,
}: {
  buildings: Building[];
  minutes: number;
  economical: boolean;
}) {
  return (
    <g pointerEvents="none" aria-hidden="true">
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
