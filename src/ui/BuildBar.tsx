import { useState } from 'react';
import { NODE_SPECS, DATACENTER_PILOT_COST, initialNodeTier } from '../game/constants';
import { fmtMoney, fmtMoneyExact } from '../game/economy';
import { effectiveNodeCapacity } from '../game/capacity';
import { researchModifiers } from '../game/research';
import { useGame, type BuildTool } from '../store/gameStore';
import type { NodeKind, OverlayMode } from '../game/types';
import { LayersIcon } from './icons';
import SiteIcon from './SiteIcon';
import InvestmentPreview from './InvestmentPreview';
import BlueprintBar from './BlueprintBar';
import { t as translate, type TranslationKey } from './i18n';

type ToolGroup = 'fixed' | 'advanced';

const TOOLS: Array<{
  id: BuildTool;
  group: ToolGroup;
  label: string;
  labelKey: TranslationKey;
  icon?: string;
  nodeKind?: NodeKind;
  cost: (mods: ReturnType<typeof researchModifiers>) => string;
  locked?: string;
}> = [
  { id: 'fiber', group: 'fixed', label: 'Fibre', labelKey: 'fibre', icon: '⌁', cost: () => 'per km' },
  {
    id: 'pop',
    group: 'fixed',
    label: 'POP',
    labelKey: 'pop',
    nodeKind: 'pop',
    cost: () => fmtMoney(NODE_SPECS.pop.baseCost),
  },
  {
    id: 'access',
    group: 'fixed',
    label: 'Access',
    labelKey: 'access',
    nodeKind: 'access',
    cost: (m) => fmtMoney(NODE_SPECS.access.baseCost * m.accessCostMul),
  },
  {
    id: 'core',
    group: 'fixed',
    label: 'Core',
    labelKey: 'core',
    nodeKind: 'core',
    cost: () => fmtMoney(NODE_SPECS.core.baseCost),
  },
  {
    id: 'tower',
    group: 'advanced',
    label: 'Tower',
    labelKey: 'tower',
    nodeKind: 'tower',
    cost: () => fmtMoney(NODE_SPECS.tower.baseCost),
    locked: 'mobile_4g',
  },
  {
    id: 'datacenter',
    group: 'advanced',
    label: 'Data Centre',
    labelKey: 'dataCentre',
    nodeKind: 'datacenter',
    cost: () => fmtMoney(DATACENTER_PILOT_COST),
    locked: 'backbone100g',
  },
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
  const autoConnect = useGame((s) => s.autoConnect);
  const setAutoConnect = useGame((s) => s.setAutoConnect);
  const planning = useGame((s) => s.planning);
  const beginBlueprint = useGame((s) => s.beginBlueprint);
  const setTool = useGame((s) => s.setTool);
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const linkFrom = useGame((s) => s.linkFrom);
  const [group, setGroup] = useState<ToolGroup>('fixed');
  const [layersOpen, setLayersOpen] = useState(false);
  const locale = useGame((s) => s.locale);
  const tr = locale === 'tr';
  const setSpeed = useGame((s) => s.setSpeed);
  const layerName = (id: OverlayMode) =>
    tr
      ? { normal: 'Şehir', load: 'Yük', coverage: 'Kapsama', rivals: 'Rakipler', customers: 'Müşteriler' }[id]
      : OVERLAYS.find((o) => o.id === id)!.label;
  const layerHint = (id: OverlayMode) =>
    tr
      ? {
          normal: 'Şehir ve şebeke',
          load: 'Kapasite baskısı',
          coverage: 'Hizmet alanı',
          rivals: 'Rakiplerin varlığı',
          customers: 'Aboneler ve sözleşmeler',
        }[id]
      : OVERLAYS.find((o) => o.id === id)!.hint;
  const mods = researchModifiers(game.researchDone);
  const activeNodeTool = tool && tool !== 'fiber' ? NODE_SPECS[tool] : null;
  const activeNodeCapacity =
    tool && tool !== 'fiber' ? effectiveNodeCapacity(tool, initialNodeTier(tool), game.spectrum, game.researchDone) : 0;
  const linkFromName = linkFrom ? game.nodes.find((node) => node.id === linkFrom)?.name : null;

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-1.5 p-2 sm:gap-2 sm:p-3">
      {planning && <BlueprintBar />}
      {!planning && tool && tool !== 'fiber' && (
        <div className="panel pointer-events-auto w-[min(440px,100%)] px-3 py-2">
          <InvestmentPreview kind={tool} />
          {tool !== 'core' && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-white/10 pt-2 text-xs">
              <input
                type="checkbox"
                className="accent-teal-400"
                checked={autoConnect}
                onChange={(e) => setAutoConnect(e.target.checked)}
              />
              {translate(locale, 'includeFibreToNearest')}
              <span className="ml-auto text-neon-cyan">{autoConnect ? 'One-click build' : 'Optional'}</span>
            </label>
          )}
        </div>
      )}
      {tool && (
        <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-hidden rounded-lg border border-neon-cyan/30 bg-ink-800/95 px-3 py-2 text-[11px] text-white/65 shadow-panel sm:gap-3 sm:px-4 sm:text-[12px]">
          <span className="h-1.5 w-1.5 rounded-full bg-neon-cyan" />
          <span className="truncate font-medium">
            {tool === 'fiber'
              ? linkFrom
                ? tr
                  ? `Kaynak: ${linkFromName ?? 'nokta'} · hedefi seç`
                  : `Source: ${linkFromName ?? 'site'} · select destination`
                : tr
                  ? '1/2 · kaynak noktasını seç'
                  : 'Step 1 of 2 · select the source site'
              : tr
                ? 'Lisanslı ilçeye bir T1 noktası yerleştir'
                : 'Place a Tier 1 site inside a licensed district'}
          </span>
          {activeNodeTool && (
            <span className="hidden items-center gap-2 border-l border-white/10 pl-3 font-mono text-[10px] text-white/45 sm:flex">
              <b className="font-normal text-neon-cyan">{activeNodeCapacity.toFixed(1)}G</b>
              <span className="font-semibold text-white/60">T1</span>
              <span>{activeNodeTool.powerKw} kW</span>
              <span>{`${fmtMoneyExact(activeNodeTool.maintenance)}/mo`}</span>
            </span>
          )}
          <span className="text-white/25">•</span>
          <button
            disabled={planning}
            className="shrink-0 text-xs text-neon-cyan disabled:opacity-40"
            onClick={() => setSpeed(game.speed === 0 ? 1 : 0)}
          >
            {game.speed === 0 ? (tr ? 'Devam et' : 'Resume') : tr ? 'Duraklat' : 'Pause'}
          </button>
          <button
            className="shrink-0 text-xs text-white/65"
            onClick={() => setTool(null)}
            aria-label={tr ? 'İnşayı iptal et' : 'Cancel construction'}
          >
            ✕
          </button>
        </div>
      )}

      <div className="pointer-events-auto flex max-w-full items-end gap-1 sm:gap-2">
        <div className="panel min-w-0 overflow-hidden p-1 sm:p-1.5">
          <div className="mb-1 flex items-center gap-1 px-0.5">
            {!planning && (
              <button
                className="rounded border border-neon-amber/30 px-2 py-1 text-[11px] font-semibold text-neon-amber"
                onClick={beginBlueprint}
              >
                {tr ? 'Ağ planla' : 'Plan network'}
              </button>
            )}
            {(['fixed', 'advanced'] as ToolGroup[]).map((id) => (
              <button
                key={id}
                onClick={() => setGroup(id)}
                className={`rounded px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  group === id ? 'bg-white/10 text-white/80' : 'text-white/35 hover:text-white/65'
                }`}
              >
                {id === 'fixed' ? translate(locale, 'fixedNetwork') : translate(locale, 'advanced')}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {TOOLS.filter((t) => t.group === group).map((t) => {
              const locked = t.locked ? !game.researchDone.includes(t.locked) : false;
              const active = tool === t.id;
              const tutorialTarget =
                (game.tutorialStep === 0 && t.id === 'pop') || (game.tutorialStep === 1 && t.id === 'fiber');
              return (
                <button
                  key={t.id}
                  disabled={locked}
                  onClick={() => setTool(t.id)}
                  title={
                    locked
                      ? 'Unlock with research'
                      : t.id === 'fiber'
                        ? 'Connect two sites with a fibre span'
                        : NODE_SPECS[t.id as NodeKind].description
                  }
                  className={`relative flex h-[54px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-md border px-1 transition-all sm:h-[58px] sm:min-w-[72px] sm:px-2 ${
                    active
                      ? 'border-neon-cyan/45 bg-neon-cyan/10 text-[#a6ceca]'
                      : locked
                        ? 'cursor-not-allowed border-white/5 bg-white/[0.015] text-white/20'
                        : 'border-transparent bg-white/[0.035] text-white/70 hover:border-white/15 hover:bg-white/[0.08]'
                  } ${tutorialTarget ? 'ring-2 ring-neon-cyan/60 ring-offset-2 ring-offset-ink-800' : ''}`}
                >
                  {tutorialTarget && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-neon-cyan" />
                  )}
                  <span className="grid h-6 place-items-center text-lg leading-none">
                    {locked ? (
                      '—'
                    ) : t.nodeKind ? (
                      <SiteIcon kind={t.nodeKind} tier={initialNodeTier(t.nodeKind)} className="h-6 w-6" />
                    ) : (
                      t.icon
                    )}
                  </span>
                  <span className="font-display text-[10px] font-semibold uppercase tracking-wide leading-none sm:text-[12px]">
                    {translate(locale, t.labelKey)}
                  </span>
                  <span className="num text-[10px] leading-none text-white/40">
                    {locked ? translate(locale, 'locked') : tr && t.id === 'fiber' ? 'km başına' : t.cost(mods)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative">
          {layersOpen && (
            <div className="panel absolute bottom-[52px] right-0 w-[220px] p-2">
              <div className="stat-label mb-1.5 px-2">{tr ? 'Harita katmanları' : 'Map layers'}</div>
              {OVERLAYS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setOverlay(o.id);
                    setLayersOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors ${overlay === o.id ? 'bg-neon-cyan/[0.12] text-neon-cyan' : 'text-white/60 hover:bg-white/[0.06]'}`}
                >
                  <span className="text-[12px] font-semibold">{layerName(o.id)}</span>
                  <span className="text-[10px] text-white/55">{layerHint(o.id)}</span>
                </button>
              ))}
            </div>
          )}
          <button
            className={`flex h-11 w-11 items-center justify-center gap-2 rounded-lg border px-2 shadow-panel transition-colors sm:w-auto sm:justify-start sm:px-3 ${layersOpen || overlay !== 'normal' ? 'border-neon-blue/40 bg-neon-blue/15 text-neon-blue' : 'border-white/10 bg-ink-800/95 text-white/60 hover:bg-ink-700'}`}
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
            aria-label={tr ? 'Harita katmanları' : 'Map layers'}
          >
            <LayersIcon className="h-4 w-4" />
            <span className="hidden font-display text-[12px] font-semibold uppercase tracking-wider sm:inline">
              {layerName(overlay)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
