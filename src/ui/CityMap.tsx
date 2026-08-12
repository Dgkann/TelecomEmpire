import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRoad } from '../game/cityGen';
import type { Building, District } from '../game/types';
import { FLOOR_H, TILE_H, TILE_W, isoX, isoY, mix, shade, tileDiamond, unIso } from './iso';

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

const GroundLayer = memo(function GroundLayer({ districts, grid }: { districts: District[]; grid: number }) {
  const tiles: JSX.Element[] = [];
  const roadColor = '#2a3546';

  for (const d of districts) {
    const base = mix(d.color, '#0e1420', 0.78);
    for (const c of d.cells) {
      const road = isRoad(c.gx, c.gy);
      tiles.push(
        <polygon key={`g${c.gx}_${c.gy}`} points={tileDiamond(c.gx, c.gy, road ? 0 : 0.05)} fill={road ? roadColor : base} />,
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
      <g key={`o${d.id}`}>
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

const BuildingGlyph = memo(function BuildingGlyph({ b }: { b: Building }) {
  const cx = isoX(b.gx, b.gy);
  const cy = isoY(b.gx, b.gy);
  const hw = TILE_W / 2 - 3;
  const hh = TILE_H / 2 - 1.5;

  if (b.kind === 'park') {
    return (
      <g>
        <polygon points={tileDiamond(b.gx, b.gy, 0.08)} fill="#2f5c43" />
        <circle cx={cx} cy={cy - 3} r={4} fill="#3f7d59" />
      </g>
    );
  }

  const h = Math.max(4, b.floors * FLOOR_H);
  const body = KIND_COLOR[b.kind];

  return (
    <g>
      <polygon points={`${cx + hw},${cy - h} ${cx},${cy + hh - h} ${cx},${cy + hh} ${cx + hw},${cy}`} fill={shade(body, -48)} />
      <polygon points={`${cx - hw},${cy - h} ${cx},${cy + hh - h} ${cx},${cy + hh} ${cx - hw},${cy}`} fill={shade(body, -26)} />
      <polygon points={`${cx},${cy - hh - h} ${cx + hw},${cy - h} ${cx},${cy + hh - h} ${cx - hw},${cy - h}`} fill={body} />
    </g>
  );
});

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export default function CityMap({
  districts,
  buildings,
  grid,
}: {
  districts: District[];
  buildings: Building[];
  grid: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [cam, setCam] = useState<Camera>({ x: 0, y: -60, zoom: 1 });
  const [picked, setPicked] = useState<District | null>(null);
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

  const sorted = useMemo(() => [...buildings].sort((a, b) => a.gx + a.gy - (b.gx + b.gy)), [buildings]);

  const districtGrid = useMemo(() => {
    const m = new Map<string, District>();
    for (const d of districts) for (const c of d.cells) m.set(`${c.gx},${c.gy}`, d);
    return m;
  }, [districts]);

  const toGrid = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const sx = (clientX - rect.left - rect.width / 2) / cam.zoom - cam.x;
      const sy = (clientY - rect.top - rect.height / 2) / cam.zoom - cam.y;
      const { gx, gy } = unIso(sx, sy);
      return { gx: Math.round(gx), gy: Math.round(gy) };
    },
    [cam],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-900">
      <svg
        ref={svgRef}
        className="map-surface relative h-full w-full"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) {
            d.moved = true;
            setCam((c) => ({ ...c, x: d.camX + dx / c.zoom, y: d.camY + dy / c.zoom }));
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const cell = toGrid(e.clientX, e.clientY);
          if (cell) setPicked(districtGrid.get(`${cell.gx},${cell.gy}`) ?? null);
        }}
        onPointerLeave={() => (drag.current = null)}
        onWheel={(e) => {
          const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          setCam((c) => ({ ...c, zoom: Math.min(2.6, Math.max(0.4, c.zoom * factor)) }));
        }}
      >
        <g transform={`translate(${size.w / 2} ${size.h / 2}) scale(${cam.zoom}) translate(${cam.x} ${cam.y})`}>
          <GroundLayer districts={districts} grid={grid} />
          {sorted.map((b) => (
            <BuildingGlyph key={b.id} b={b} />
          ))}
          {districts.map((d) => (
            <text
              key={`lbl${d.id}`}
              x={isoX(d.center.gx, d.center.gy)}
              y={isoY(d.center.gx, d.center.gy) - 70}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              fill="#dfe8f4"
              opacity={0.7}
              style={{ pointerEvents: 'none' }}
            >
              {d.name}
            </text>
          ))}
        </g>
      </svg>

      {picked && (
        <div className="panel absolute right-4 top-4 w-[260px] p-4">
          <div className="text-lg font-semibold" style={{ color: picked.color }}>
            {picked.name}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="chip">
              <div className="stat-label">Population</div>
              <div className="num">{picked.population.toLocaleString()}</div>
            </div>
            <div className="chip">
              <div className="stat-label">Potential</div>
              <div className="num">{picked.potential.toLocaleString()}</div>
            </div>
            <div className="chip">
              <div className="stat-label">Income</div>
              <div className="capitalize">{picked.incomeLevel}</div>
            </div>
            <div className="chip">
              <div className="stat-label">Competition</div>
              <div className="num">{Math.round(picked.competition * 100)}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
