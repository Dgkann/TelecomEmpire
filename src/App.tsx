import { useMemo, useState } from 'react';
import { GRID } from './game/constants';
import { generateCity } from './game/cityGen';
import CityMap from './ui/CityMap';

export default function App() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const city = useMemo(() => generateCity(seed), [seed]);

  return (
    <div className="flex h-full flex-col">
      <div className="z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-ink-800/90 px-4 backdrop-blur-md">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-neon-cyan/15 text-lg">📡</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Telecom Empire</div>
          <div className="text-[10px] text-white/40">Marmara</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="num text-[11px] text-white/40">seed {seed}</div>
          <button className="btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
            New city
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <CityMap districts={city.districts} buildings={city.buildings} grid={GRID} />
      </div>
    </div>
  );
}
