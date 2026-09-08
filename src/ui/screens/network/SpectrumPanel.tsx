import { SPECTRUM_BANDS, towerRadius } from '../../../game/constants';
import { fmtMoney, fmtNum } from '../../../game/economy';
import { mobileSubs } from '../../../game/simulation';
import { t } from '../../i18n';
import { Meter } from './Meter';
import type { NetworkModel } from './model';

export default function SpectrumPanel({ m }: { m: NetworkModel }) {
  if (!m.mods.hasMobile) return null;
  return (
    <div className={`panel panel-tone-violet p-5 ${m.networkView === 'interconnect' ? '' : 'hidden'}`}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">{t(m.locale, 'spectrum')}</h2>
      <p className="mb-3 text-[11px] text-white/40">
        Low bands reach further, high bands carry more. Reach comes from your best band, capacity from all of them.
      </p>

      {m.game.spectrum.length === 0 ? (
        <p className="text-sm text-white/40">{t(m.locale, 'noLicencesHeld')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {m.game.spectrum.map((h) => {
            const spec = SPECTRUM_BANDS[h.band];
            return (
              <div key={h.band} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neon-violet">{spec.label}</span>
                  <span className="num text-[11px] text-white/45">
                    {h.blocks} block{h.blocks > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="num mt-0.5 flex gap-3 text-[10px] text-white/40">
                  <span>reach {spec.radius.toFixed(2)}x</span>
                  <span>capacity {spec.capacity.toFixed(1)}x</span>
                  <span>{h.paid > 0 ? `paid ${fmtMoney(h.paid)}` : 'granted'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="chip py-2">
          <div className="stat-label">{t(m.locale, 'towerReach')}</div>
          <div className="num text-sm text-neon-cyan">
            {m.game.spectrum.length ? `${towerRadius(m.game.spectrum, 1).toFixed(1)} km` : '-'}
          </div>
        </div>
        <div className="chip py-2">
          <div className="stat-label">{t(m.locale, 'mobileSubs')}</div>
          <div className="num text-sm">{fmtNum(mobileSubs(m.game))}</div>
        </div>
        <div className="chip py-2">
          <div className="stat-label">{t(m.locale, 'nextAuction')}</div>
          <div className="num text-sm">
            {isFinite(m.game.nextAuctionAt)
              ? `${Math.max(0, Math.round((m.game.nextAuctionAt - m.game.minutes) / 1440))}d`
              : '-'}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="stat-label mb-1.5">{t(m.locale, 'mobileCoverageByDistrict')}</div>
        <div className="flex flex-col gap-1.5">
          {m.game.districts
            .filter((d) => d.unlocked)
            .map((d) => (
              <Meter
                key={d.id}
                v={d.mobileCoverage}
                label={d.name}
                right={`${Math.round(d.mobileCoverage * 100)}% · ${fmtNum(d.mobileSubs)} subs`}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
