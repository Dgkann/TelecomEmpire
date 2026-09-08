import { useGame } from '../store/gameStore';

export default function DistrictNavigator() {
  const game = useGame((s) => s.game)!;
  const planning = useGame((s) => s.planning || !!s.drillTarget);
  const selection = useGame((s) => s.selection);
  const setTool = useGame((s) => s.setTool);
  const select = useGame((s) => s.select);
  const focus = useGame((s) => s.focus);
  const go = (id: string) => {
    const d = game.districts.find((d) => d.id === id);
    if (!d) return;
    setTool(null);
    select({ type: 'district', id });
    focus(d.center.gx, d.center.gy);
  };
  if (planning || selection) return null;
  return (
    <nav
      aria-label="District navigator"
      className="absolute right-3 top-3 z-10 max-w-[calc(100%-145px)] lg:left-[300px] lg:right-16 lg:max-w-none"
    >
      <div className="hidden justify-center gap-1.5 lg:flex">
        {game.districts.map((d) => (
          <button key={d.id} onClick={() => go(d.id)} className="district-stop" aria-label={`Explore ${d.name}`}>
            <span className="flex items-center gap-2">
              <i
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: d.unlocked ? '#6cdbbc' : '#b6a078' }}
              />
              <strong className="truncate text-xs">{d.name}</strong>
            </span>
            <span className="mt-1 block text-[10px] text-white/50">
              {d.unlocked ? `${Math.round(d.coverage * 100)}% coverage` : `$${Math.round(d.entryCost / 1000)}k licence`}
            </span>
            <span className="mt-2 block h-0.5 bg-white/10">
              <span
                className="block h-full bg-teal-300/70"
                style={{ width: `${d.unlocked ? Math.max(2, d.coverage * 100) : 0}%` }}
              />
            </span>
          </button>
        ))}
      </div>
      <select
        className="max-w-full rounded-md border border-white/15 bg-[#142c37] px-3 py-2 text-xs text-white lg:hidden"
        aria-label="Explore district"
        value=""
        onChange={(e) => go(e.target.value)}
      >
        <option value="">Explore districts</option>
        {game.districts.map((d) => (
          <option value={d.id} key={d.id}>
            {d.name} · {d.unlocked ? `${Math.round(d.coverage * 100)}% coverage` : 'Locked'}
          </option>
        ))}
      </select>
    </nav>
  );
}
