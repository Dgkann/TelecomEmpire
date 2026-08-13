import { useState } from 'react';
import { NODE_SPECS, nodeCapacity } from '../game/constants';
import { researchModifiers } from '../game/research';
import { useGame, type BuildTool } from '../store/gameStore';
import type { NodeKind, OverlayMode } from '../game/types';
import { LayersIcon } from './icons';
import SiteIcon from './SiteIcon';

type ToolGroup = 'fixed' | 'advanced';

const TOOLS: Array<{ id: BuildTool; group: ToolGroup; label: string; icon?: string; nodeKind?: NodeKind; cost: (mods: ReturnType<typeof researchModifiers>) => string; locked?: string }> = [
  { id: 'fiber', group: 'fixed', label: 'Fibre', icon: '⌁', cost: () => 'per km' },
  { id: 'pop', group: 'fixed', label: 'POP', nodeKind: 'pop', cost: () => `$${(NODE_SPECS.pop.baseCost / 1000).toFixed(0)}k` },
  { id: 'access', group: 'fixed', label: 'Access', nodeKind: 'access', cost: (m) => `$${((NODE_SPECS.access.baseCost * m.accessCostMul) / 1000).toFixed(1)}k` },
  { id: 'core', group: 'fixed', label: 'Core', nodeKind: 'core', cost: () => `$${(NODE_SPECS.core.baseCost / 1000).toFixed(0)}k` },
  { id: 'tower', group: 'advanced', label: 'Tower', nodeKind: 'tower', cost: () => `$${(NODE_SPECS.tower.baseCost / 1000).toFixed(0)}k`, locked: 'mobile_4g' },
  { id: 'datacenter', group: 'advanced', label: 'Data Centre', nodeKind: 'datacenter', cost: () => `$${(NODE_SPECS.datacenter.baseCost / 1000).toFixed(0)}k`, locked: 'edge_compute' },
];

const OVERLAYS: Array<{ id: OverlayMode; label: string; hint: string }> = [
  { id: 'normal', label: 'City', hint: 'Street-level network view' },
  { id: 'load', label: 'Load', hint: 'Capacity pressure' },
  { id: 'coverage', label: 'Coverage', hint: 'Service footprint' },
  { id: 'rivals', label: 'Rivals', hint: 'Competitor presence' },
  { id: 'customers', label: 'Customers', hint: 'Subscriptions & contracts' },
];

export default function BuildBar() {
  const game = useGame((s) => s.game)!;
  const tool = useGame((s) => s.tool);
  const setTool = useGame((s) => s.setTool);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const linkFrom = useGame((s) => s.linkFrom);
  const [group, setGroup] = useState<ToolGroup>('fixed');
  const [layersOpen, setLayersOpen] = useState(false);
  const mods = researchModifiers(game.researchDone);
  const activeNodeTool = tool && tool !== 'fiber' ? NODE_SPECS[tool] : null;
  const activeNodeCapacity = tool && tool !== 'fiber' ? nodeCapacity(tool, 1) * (tool === 'access' ? mods.accessCapacityMul : 1) : 0;

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-2 p-3">
      {tool && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-neon-cyan/30 bg-ink-800/95 px-4 py-2 text-[12px] text-white/65 shadow-panel">
          <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" />
          <span className="font-medium">
            {tool === 'fiber'
              ? linkFrom
                ? 'Select the destination site'
                : 'Select a site to begin the fibre run'
              : 'Place inside a licensed district'}
          </span>
          {activeNodeTool && (
            <span className="flex items-center gap-2 border-l border-white/10 pl-3 font-mono text-[10px] text-white/45">
              <b className="font-normal text-neon-cyan">{activeNodeCapacity.toFixed(1)}G</b>
              <span>{activeNodeTool.powerKw} kW</span>
              <span>{`$${activeNodeTool.maintenance.toLocaleString()}/mo`}</span>
            </span>
          )}
          <span className="text-white/25">•</span>
          <kbd className="font-mono text-[10px] text-neon-cyan">ESC cancels</kbd>
        </div>
      )}

      <div className="pointer-events-auto flex items-end gap-2">
        <div className="panel overflow-hidden p-1.5">
          <div className="mb-1 flex items-center gap-1 px-0.5">
            {(['fixed', 'advanced'] as ToolGroup[]).map((id) => (
              <button
                key={id}
                onClick={() => setGroup(id)}
                className={`rounded px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  group === id ? 'bg-white/10 text-white/80' : 'text-white/35 hover:text-white/65'
                }`}
              >
                {id === 'fixed' ? 'Fixed network' : 'Advanced'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {TOOLS.filter((t) => t.group === group).map((t) => {
              const locked = t.locked ? !game.researchDone.includes(t.locked) : false;
              const active = tool === t.id;
              const tutorialTarget = (game.tutorialStep === 0 && t.id === 'pop') || (game.tutorialStep === 1 && t.id === 'fiber');
              return (
                <button
                  key={t.id}
                  disabled={locked}
                  onClick={() => setTool(t.id)}
                  title={locked ? 'Unlock with research' : t.id === 'fiber' ? 'Connect two sites with a fibre span' : NODE_SPECS[t.id as NodeKind].description}
                  className={`relative flex h-[58px] min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-md border px-2 transition-all ${
                    active
                      ? 'border-neon-cyan/45 bg-neon-cyan/10 text-[#a6ceca]'
                      : locked
                        ? 'cursor-not-allowed border-white/5 bg-white/[0.015] text-white/20'
                        : 'border-transparent bg-white/[0.035] text-white/70 hover:border-white/15 hover:bg-white/[0.08]'
                  } ${tutorialTarget ? 'ring-2 ring-neon-cyan/60 ring-offset-2 ring-offset-ink-800' : ''}`}
                >
                  {tutorialTarget && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-neon-cyan" />}
                  <span className="grid h-6 place-items-center text-lg leading-none">
                    {locked ? '—' : t.nodeKind ? <SiteIcon kind={t.nodeKind} className="h-6 w-6" /> : t.icon}
                  </span>
                  <span className="font-display text-[12px] font-semibold uppercase tracking-wide leading-none">{t.label}</span>
                  <span className="num text-[10px] leading-none text-white/40">{locked ? 'Locked' : t.cost(mods)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative">
          {layersOpen && (
            <div className="panel absolute bottom-[52px] right-0 w-[220px] p-2">
              <div className="stat-label mb-1.5 px-2">Map layers</div>
              {OVERLAYS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setOverlay(o.id); setLayersOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors ${overlay === o.id ? 'bg-neon-cyan/12 text-neon-cyan' : 'text-white/60 hover:bg-white/[0.06]'}`}
                >
                  <span className="text-[12px] font-semibold">{o.label}</span>
                  <span className="text-[10px] text-white/35">{o.hint}</span>
                </button>
              ))}
            </div>
          )}
          <button
            className={`flex h-11 items-center gap-2 rounded-lg border px-3 shadow-panel transition-colors ${layersOpen || overlay !== 'normal' ? 'border-neon-blue/40 bg-neon-blue/15 text-neon-blue' : 'border-white/10 bg-ink-800/95 text-white/60 hover:bg-ink-700'}`}
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
          >
            <LayersIcon className="h-4 w-4" />
            <span className="font-display text-[12px] font-semibold uppercase tracking-wider">{OVERLAYS.find((o) => o.id === overlay)?.label}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
