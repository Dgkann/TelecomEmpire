import { BACKUP_TRANSIT_MONTHLY, TRANSIT_TIERS } from '../../../game/constants';
import { fmtMoney } from '../../../game/economy';
import { t } from '../../i18n';
import { Meter } from './Meter';
import type { NetworkModel } from './model';

export default function UpstreamPanel({ m }: { m: NetworkModel }) {
  const tr = m.locale === 'tr';
  const perMonth = tr ? '/ay' : '/mo';
  return (
    <div
      id="transit"
      className={`panel panel-tone-blue scroll-mt-20 p-5 ${m.networkView === 'interconnect' ? '' : 'hidden'}`}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(m.locale, 'upstreamAndAutomation')}
      </h2>
      <Meter
        v={m.transitUse}
        label={tr ? 'Transit kullanımı' : 'Transit usage'}
        right={`${m.game.stats.transitGbps.toFixed(1)}/${m.transitCapacity.toFixed(0)} Gbps`}
      />
      <div className="mt-3 flex flex-col gap-2">
        {TRANSIT_TIERS.map((t, i) => {
          const capacityDelta = t.capacity - m.transit.capacity;
          const costDelta = (t.monthly - m.transit.monthly) * m.mods.transitCostMul;
          return (
            <button
              key={t.label}
              onClick={() => m.setTransitTier(i)}
              className={`flex items-center justify-between rounded-lg border p-2.5 text-left text-sm transition-colors ${
                m.game.transitTier === i
                  ? 'border-neon-cyan/50 bg-neon-cyan/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08]'
              }`}
            >
              <div>
                <div className="font-medium">{tr ? t.labelTr : t.label}</div>
                <div className="num text-[11px] text-white/45">
                  {t.capacity} Gbps {tr ? 'üst bağlantı' : 'upstream'}
                </div>
                {i !== m.game.transitTier && (
                  <div className="num mt-1 text-[9px]">
                    <span className={capacityDelta >= 0 ? 'text-neon-lime' : 'text-neon-red'}>
                      {capacityDelta >= 0 ? '+' : ''}
                      {capacityDelta}G
                    </span>
                    <span className="text-white/30"> · </span>
                    <span className={costDelta <= 0 ? 'text-neon-lime' : 'text-neon-amber'}>
                      {costDelta >= 0 ? '+' : ''}
                      {fmtMoney(costDelta)}
                      {perMonth}
                    </span>
                  </div>
                )}
              </div>
              <div className="num text-sm text-white/70">
                {fmtMoney(t.monthly * m.mods.transitCostMul)}
                {perMonth}
              </div>
            </button>
          );
        })}
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div>
          <div className="text-sm font-medium">{t(m.locale, 'backupTransitProvider')}</div>
          <div className="text-[11px] text-white/45">
            {tr
              ? 'Farklı bir ikinci üst bağlantıdan %35 ek kapasite.'
              : '+35% headroom from a diverse second upstream.'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-xs text-white/60">
            {fmtMoney(BACKUP_TRANSIT_MONTHLY)}
            {perMonth}
          </span>
          <input
            type="checkbox"
            checked={m.game.backupTransit}
            onChange={m.toggleBackup}
            className="h-4 w-4 accent-[#3ee6d6]"
          />
        </div>
      </label>

      <label
        className={`mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3 ${
          m.mods.hasAutoDispatch ? 'cursor-pointer' : 'opacity-40'
        }`}
      >
        <div>
          <div className="text-sm font-medium">{t(m.locale, 'automaticTechnicianDispatch')}</div>
          <div className="text-[11px] text-white/45">
            {m.mods.hasAutoDispatch
              ? tr
                ? 'Önce kayıtlı müşteri etkisi en yüksek arıza; yol + onarım süresi en kısa ekip gönderilir.'
                : 'Highest recorded customer impact first; sends the crew with the fastest travel + repair time.'
              : tr
                ? 'Otomatik Yönlendirme araştırması gerekir.'
                : 'Requires Automatic Dispatch research.'}
          </div>
        </div>
        <input
          type="checkbox"
          disabled={!m.mods.hasAutoDispatch}
          checked={m.game.autoDispatch}
          onChange={m.toggleAuto}
          className="h-4 w-4 accent-[#3ee6d6]"
        />
      </label>
    </div>
  );
}
