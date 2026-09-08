import { sameDistrictMap } from './mapVisuals';
import { memo, useMemo } from 'react';
import type { District } from '../game/types';
import { isoX, isoY, TILE_H, TILE_W } from './iso';

export default memo(
  function CityFoundation({ districts }: { districts: District[] }) {
    const edges = useMemo(() => {
      const cells = districts.flatMap((d) => d.cells);
      const occupied = new Set(cells.map((c) => `${c.gx},${c.gy}`));
      return cells.flatMap((c) => {
        const x = isoX(c.gx, c.gy),
          y = isoY(c.gx, c.gy),
          w = TILE_W / 2,
          h = TILE_H / 2;
        const result: Array<{ key: string; points: string; rim: string; shade: string }> = [];
        if (!occupied.has(`${c.gx + 1},${c.gy}`))
          result.push({
            key: `${c.gx},${c.gy}:x`,
            points: `${x + w},${y} ${x},${y + h} ${x},${y + h + 24} ${x + w},${y + 24}`,
            rim: `${x + w},${y} ${x},${y + h}`,
            shade: '#263e49',
          });
        if (!occupied.has(`${c.gx},${c.gy + 1}`))
          result.push({
            key: `${c.gx},${c.gy}:y`,
            points: `${x},${y + h} ${x - w},${y} ${x - w},${y + 24} ${x},${y + h + 24}`,
            rim: `${x},${y + h} ${x - w},${y}`,
            shade: '#162c39',
          });
        return result;
      });
    }, [districts]);
    return (
      <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <g transform="translate(0 14)" opacity={0.35}>
          {edges.map((e) => (
            <polygon key={e.key} points={e.points} fill="#050e19" />
          ))}
        </g>
        {edges.map((e) => (
          <g key={e.key}>
            <polygon points={e.points} fill={e.shade} />
            <polyline points={e.rim} fill="none" stroke="#81928e" strokeOpacity={0.65} strokeWidth={1.5} />
          </g>
        ))}
      </g>
    );
  },
  (a, b) => sameDistrictMap(a.districts, b.districts),
);
