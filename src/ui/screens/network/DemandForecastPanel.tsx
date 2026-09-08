import { t } from '../../i18n';
import TrendChart from '../../TrendChart';
import { Meter } from './Meter';
import type { NetworkModel } from './model';

export default function DemandForecastPanel({ m }: { m: NetworkModel }) {
  return (
    <div className={`panel panel-tone-amber p-5 lg:col-span-2 ${m.networkView === 'capacity' ? '' : 'hidden'}`}>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(m.locale, 'demandForecast')}
      </h2>
      <p className="mb-3 text-[11px] text-white/40">
        Straight line through recent peaks. Capacity takes time to build, so the useful moment to act is before the line
        crosses.
      </p>

      {m.demandSeries.length > 1 && (
        <div className="mb-4 rounded-lg border border-white/[0.07] bg-black/15 p-3">
          <TrendChart
            height={92}
            formatValue={(value) => `${value.toFixed(1)}G`}
            series={[
              { label: 'Daily peak Gbps', values: m.demandSeries, color: '#2dd4bf' },
              {
                label: 'Access capacity',
                values: m.demandSeries.map(() => m.accessCapacity),
                color: '#f3b843',
                dashed: true,
              },
            ]}
          />
        </div>
      )}

      {!m.forecast.confident ? (
        <p className="text-sm text-white/40">{t(m.locale, 'notEnoughHistory')}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'peakToday')}</div>
              <div className="num text-sm">{m.forecast.today.toFixed(1)}G</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'inThirtyDays')}</div>
              <div className="num text-sm text-neon-cyan">{m.forecast.projected.toFixed(1)}G</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'accessCapacity')}</div>
              <div className="num text-sm">{m.accessCapacity.toFixed(0)}G</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">{t(m.locale, 'headroom')}</div>
              <div
                className={`num text-sm ${m.daysLeft !== null && m.daysLeft < 30 ? 'text-neon-red' : 'text-neon-lime'}`}
              >
                {m.daysLeft === null ? 'flat' : m.daysLeft > 365 ? '1y+' : `${Math.round(m.daysLeft)}d`}
              </div>
            </div>
          </div>

          <Meter
            v={m.forecast.projected / Math.max(0.01, m.accessCapacity)}
            label="Projected peak against what you have built"
            right={`${m.forecast.projected.toFixed(1)} / ${m.accessCapacity.toFixed(0)} Gbps`}
          />

          {m.daysLeft !== null && m.daysLeft < 30 && (
            <div className="mt-3 rounded-lg border border-neon-red/40 bg-neon-red/10 p-3 text-[12px] text-neon-red">
              On the current trend you run out of access capacity in about {Math.round(m.daysLeft)} days.
            </div>
          )}
        </>
      )}
    </div>
  );
}
