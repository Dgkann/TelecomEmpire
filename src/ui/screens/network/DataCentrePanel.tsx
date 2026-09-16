import {
  DATA_CENTER_MODE_CONFIG,
  DATA_CENTER_MODE_COOLDOWN,
  dataCenterMode,
  dataCenterModeChangeCost,
} from '../../../game/strategy';
import { fmtMoney } from '../../../game/economy';
import { nodeUtil } from '../../../game/network';
import { cacheRatio } from '../../../game/simulation';
import type { DataCenterMode } from '../../../game/types';
import { t } from '../../i18n';
import SiteIcon from '../../SiteIcon';
import type { NetworkModel } from './model';

export default function DataCentrePanel({ m }: { m: NetworkModel }) {
  const tr = m.locale === 'tr';
  return (
    <div className={`panel panel-tone-green p-5 ${m.networkView === 'interconnect' ? '' : 'hidden'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(m.locale, 'dataCentreOperations')}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">{t(m.locale, 'dataCentreBlurb')}</p>
        </div>
        <SiteIcon kind="datacenter" className="h-8 w-8" />
      </div>
      {m.dataCenters.length ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'sites')}</div>
              <div className="num text-sm">{m.dataCenters.length}</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'cacheOffload')}</div>
              <div className="num text-sm text-neon-cyan">{Math.round(cacheRatio(m.game) * 100)}%</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'hosting')}</div>
              <div className="num text-sm text-neon-lime">{fmtMoney(m.finance.revenueHosting)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {m.dataCenters.map((n) => {
              const activeMode = DATA_CENTER_MODE_CONFIG[dataCenterMode(m.game, n.id)];
              const routed = !n.down && Boolean(m.routes[n.id]);
              const changedAt = m.game.dataCenterModeChangedAt[n.id] ?? 0;
              const cooldownLeft =
                changedAt > 0 ? Math.max(0, changedAt + DATA_CENTER_MODE_COOLDOWN - m.game.minutes) : 0;
              return (
                <div
                  key={n.id}
                  className={`rounded-lg border p-2 ${routed ? 'border-white/[0.08] bg-white/[0.03]' : 'border-neon-red/30 bg-neon-red/[0.05]'}`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-neon-cyan"
                      onClick={() => {
                        m.focus(n.gx, n.gy);
                        m.select({ type: 'node', id: n.id });
                      }}
                    >
                      <SiteIcon kind="datacenter" tier={n.tier} className="h-7 w-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{n.name}</span>
                        <span className={`num block text-[9px] ${routed ? 'text-white/35' : 'text-neon-red'}`}>
                          {routed
                            ? tr
                              ? `T${n.tier} · %${Math.round(nodeUtil(n) * 100)} YÜK`
                              : `T${n.tier} · ${Math.round(nodeUtil(n) * 100)}% LOAD`
                            : tr
                              ? 'DEVRE DIŞI · ÇEKİRDEĞE ROTA YOK'
                              : 'OFFLINE · NO ROUTE TO CORE'}
                        </span>
                      </span>
                    </button>
                    <select
                      aria-label={tr ? `${n.name} iş yükü` : `${n.name} workload`}
                      disabled={cooldownLeft > 0}
                      value={dataCenterMode(m.game, n.id)}
                      onChange={(event) => m.setDataCenterMode(n.id, event.target.value as DataCenterMode)}
                      className="max-w-[132px] rounded-md border border-white/10 bg-[#101827] px-2 py-1.5 text-[10px] text-white/70 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {(
                        Object.entries(DATA_CENTER_MODE_CONFIG) as Array<
                          [DataCenterMode, (typeof DATA_CENTER_MODE_CONFIG)[DataCenterMode]]
                        >
                      ).map(([id, mode]) => (
                        <option key={id} value={id}>
                          {tr ? mode.labelTr : mode.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="num mt-2 grid grid-cols-3 gap-1 text-center text-[9px] text-white/40">
                    <span>
                      {tr
                        ? `Önbellek %${(activeMode.cachePerTier * n.tier * 100).toFixed(0)}`
                        : `Cache ${(activeMode.cachePerTier * n.tier * 100).toFixed(0)}%`}
                    </span>
                    <span>
                      {tr ? 'Yük' : 'Load'} {(activeMode.workloadPerTier * n.tier).toFixed(1)}G
                    </span>
                    <span>
                      {tr ? 'Enerji' : 'Power'} ×{activeMode.powerMultiplier.toFixed(2)}
                    </span>
                  </div>
                  <div className="num mt-1 text-right text-[9px] text-white/30">
                    {cooldownLeft > 0
                      ? tr
                        ? `Yeniden yapılandırma ${Math.ceil(cooldownLeft / 1440)} gün sonra`
                        : `Reconfiguration ready in ${Math.ceil(cooldownLeft / 1440)}d`
                      : tr
                        ? `Değişim bedeli ${fmtMoney(dataCenterModeChangeCost(n))} · 2 gün kilit`
                        : `Change fee ${fmtMoney(dataCenterModeChangeCost(n))} · 2d lock`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] leading-relaxed text-white/35">{t(m.locale, 'dataCentreModeBlurb')}</div>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-center">
          <div className="text-sm text-white/55">{t(m.locale, 'noEdgeInfrastructure')}</div>
          <div className="mt-1 text-[11px] text-white/35">{t(m.locale, 'noEdgeBlurb')}</div>
          <button
            className="btn mt-3"
            onClick={() => {
              m.setScreen('map');
              m.setTool('datacenter');
            }}
          >
            {t(m.locale, 'openBuildTools')}
          </button>
        </div>
      )}
    </div>
  );
}
