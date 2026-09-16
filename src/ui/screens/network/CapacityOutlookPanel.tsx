import { t } from '../../i18n';
import TrendChart from '../../TrendChart';
import type { NetworkModel } from './model';

export default function CapacityOutlookPanel({ m }: { m: NetworkModel }) {
  const tr = m.locale === 'tr';
  return (
    <div className={`panel panel-tone-blue p-5 lg:col-span-2 ${m.networkView === 'live' ? '' : 'hidden'}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {tr ? '24 saatlik trafik akışı' : '24-hour traffic timeline'}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">{t(m.locale, 'capacityOutlookBlurb')}</p>
        </div>
        <div className="num text-[10px] text-white/35">
          {m.dayTelemetry.length}/24 {tr ? 'ÖRNEK' : 'SAMPLES'}
        </div>
      </div>
      {m.dayTelemetry.length > 1 ? (
        <TrendChart
          height={112}
          tr={tr}
          formatValue={(v) => `${v.toFixed(1)}G`}
          series={[
            { label: tr ? 'Talep' : 'Demand', values: m.dayTelemetry.map((p) => p.demandGbps), color: '#68a5ff' },
            { label: t(m.locale, 'carried'), values: m.dayTelemetry.map((p) => p.servedGbps), color: '#2dd4bf' },
            {
              label: tr ? 'Kayıp ×10' : 'Loss ×10',
              values: m.dayTelemetry.map((p) => p.packetLoss * 10),
              color: '#ff6577',
              dashed: true,
            },
          ]}
        />
      ) : (
        <div className="flex items-center justify-between gap-4 rounded-md border border-dashed border-white/10 bg-black/10 px-4 py-3">
          <div>
            <div className="text-sm text-white/70">{t(m.locale, 'buildingBaseline')}</div>
            <div className="mt-0.5 text-[11px] text-white/45">{t(m.locale, 'nextSampleHour')}</div>
          </div>
          <div className="flex shrink-0 items-end gap-1" aria-hidden="true">
            {[35, 55, 42, 72, 60].map((height, index) => (
              <i key={index} className="w-1.5 rounded-sm bg-neon-blue/45" style={{ height }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
