import { NODE_SPECS } from '../game/constants';
import { researchModifiers } from '../game/research';
import { useGame, type BuildTool } from '../store/gameStore';
import type { NodeKind, OverlayMode } from '../game/types';

const TOOLS: Array<{ id: BuildTool; label: string; icon: string; cost: (mods: ReturnType<typeof researchModifiers>) => string; locked?: string }> = [
  { id: 'fiber', label: 'Fibre', icon: '⌇', cost: () => 'per km' },
  { id: 'pop', label: 'POP', icon: NODE_SPECS.pop.icon, cost: () => `$${(NODE_SPECS.pop.baseCost / 1000).toFixed(0)}k` },
  { id: 'access', label: 'Access', icon: NODE_SPECS.access.icon, cost: (m) => `$${((NODE_SPECS.access.baseCost * m.accessCostMul) / 1000).toFixed(1)}k` },
  { id: 'core', label: 'Core', icon: NODE_SPECS.core.icon, cost: () => `$${(NODE_SPECS.core.baseCost / 1000).toFixed(0)}k` },
  { id: 'tower', label: 'Tower', icon: NODE_SPECS.tower.icon, cost: () => `$${(NODE_SPECS.tower.baseCost / 1000).toFixed(0)}k`, locked: 'mobile_4g' },
  { id: 'datacenter', label: 'Data Centre', icon: NODE_SPECS.datacenter.icon, cost: () => `$${(NODE_SPECS.datacenter.baseCost / 1000).toFixed(0)}k`, locked: 'edge_compute' },
];

const OVERLAYS: Array<{ id: OverlayMode; label: string }> = [
  { id: 'normal', label: 'Normal' },
  { id: 'load', label: 'Network Load' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'rivals', label: 'Rivals' },
];

export default function BuildBar() {
  const game = useGame((s) => s.game)!;
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const linkFrom = useGame((s) => s.linkFrom);
  const mods = researchModifiers(game.researchDone);

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-2 p-4">
      {tool && (
        <div className="pointer-events-auto rounded-full border border-neon-cyan/30 bg-ink-800/90 px-4 py-1.5 text-xs text-neon-cyan shadow-panel">
          {tool === 'fiber'
            ? linkFrom
              ? 'Now click the second node to light the span · Esc to cancel'
              : 'Click a node to start the fibre run · Esc to cancel'
            : `Click a tile inside a licensed district to place · Esc to cancel`}
        </div>
      )}

      <div className="pointer-events-auto flex items-end gap-3">
        <div className="panel flex items-center gap-1 p-1.5">
          {TOOLS.map((t) => {
            const locked = t.locked ? !game.researchDone.includes(t.locked) : false;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                disabled={locked}
                onClick={() => setTool(t.id)}
                title={
                  locked
                    ? 'Unlock with research'
                    : t.id === 'fiber'
                      ? 'Fibre spans carry traffic between your sites. Cost scales with distance.'
                      : NODE_SPECS[t.id as NodeKind].description
                }
                className={`flex h-16 w-[76px] flex-col items-center justify-center gap-0.5 rounded-lg border transition-all ${
                  active
                    ? 'border-neon-cyan/60 bg-neon-cyan/15 text-neon-cyan shadow-glow'
                    : locked
                      ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-white/25'
                      : 'border-white/10 bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/10'
                }`}
              >
                <span className="text-xl leading-none">{locked ? '🔒' : t.icon}</span>
                <span className="text-[11px] font-semibold leading-none">{t.label}</span>
                <span className="num text-[10px] leading-none text-white/40">{locked ? '-' : t.cost(mods)}</span>
              </button>
            );
          })}
        </div>

        <div className="panel flex flex-col gap-1 p-1.5">
          <div className="stat-label px-1">Overlay</div>
          <div className="flex gap-1">
            {OVERLAYS.map((o) => (
              <button
                key={o.id}
                onClick={() => setOverlay(o.id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  overlay === o.id ? 'bg-white/15 text-white' : 'text-white/45 hover:bg-white/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
