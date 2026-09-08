import { motion } from 'framer-motion';
import { t } from '../../i18n';
import type { NetworkModel } from './model';

export default function LiveDeliveryPanel({ m }: { m: NetworkModel }) {
  return (
    <div className={`panel p-5 lg:col-span-2 ${m.networkView === 'live' ? '' : 'hidden'}`}>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: 'Network health',
            value: `${Math.round(m.game.stats.health)}%`,
            tone: m.game.stats.health > 80 ? 'text-neon-lime' : 'text-neon-amber',
          },
          { label: 'Demand', value: `${m.game.stats.demandGbps.toFixed(1)} Gbps` },
          { label: 'Carried', value: `${m.game.stats.servedGbps.toFixed(1)} Gbps` },
          {
            label: 'Packet loss',
            value: `${(m.game.stats.packetLoss * 100).toFixed(1)}%`,
            tone: m.game.stats.packetLoss > 0.02 ? 'text-neon-red' : 'text-neon-lime',
          },
          {
            label: 'Latency',
            value: `${Math.round(m.game.stats.latencyMs)} ms`,
            tone: m.game.stats.latencyMs > 40 ? 'text-neon-amber' : undefined,
          },
          {
            label: 'Resilient sites',
            value: `${Math.round(m.resilience * 100)}%`,
            tone: m.resilience >= 0.7 ? 'text-neon-lime' : 'text-neon-amber',
          },
        ].map((s) => (
          <div key={s.label} className="kpi border-0 bg-transparent px-0 py-0">
            <div className="stat-label">{s.label}</div>
            <div className={`num text-2xl font-semibold ${s.tone ?? 'text-white'}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-white/[0.07] pt-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <div className="stat-label">{t(m.locale, 'liveDeliveryPath')}</div>
            <div className="text-[12px] text-white/40">{t(m.locale, 'trafficAcceptedNow')}</div>
          </div>
          <div className="num text-[12px] text-white/55">
            <span className="text-neon-cyan">{m.game.stats.servedGbps.toFixed(2)}G carried</span> /{' '}
            {m.game.stats.demandGbps.toFixed(2)}G requested
          </div>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-neon-red/[0.18]">
          <motion.div
            className="h-full rounded-full bg-neon-cyan"
            animate={{
              width: `${Math.min(100, (m.game.stats.servedGbps / Math.max(0.01, m.game.stats.demandGbps)) * 100)}%`,
            }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
          <div className="absolute inset-y-0 left-3/4 w-px bg-white/20" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-white/35">{t(m.locale, 'fixedAccess')}</div>
            <div className="num text-neon-blue">{m.game.stats.fixedDemandGbps.toFixed(2)} Gbps</div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-white/35">{t(m.locale, 'mobileRadio')}</div>
            <div className="num text-neon-violet">{m.game.stats.mobileDemandGbps.toFixed(2)} Gbps</div>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <div className="text-white/35">{t(m.locale, 'offeredUpstream')}</div>
            <div className="num text-neon-cyan">{m.game.stats.transitGbps.toFixed(2)} Gbps</div>
          </div>
        </div>
        <div
          className="mt-4 overflow-hidden rounded-lg border border-white/[0.08]"
          aria-label="Traffic carried by service class"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-black/15 px-3 py-2 text-[10px] text-white/35">
            <span>{t(m.locale, 'service')}</span>
            <span>{t(m.locale, 'requested')}</span>
            <span>{t(m.locale, 'carried')}</span>
            <span>{t(m.locale, 'delivery')}</span>
          </div>
          {m.trafficClasses.map(({ id, label, color }) => {
            const requested = m.game.stats.serviceDemandGbps[id];
            const carried = m.game.stats.serviceServedGbps[id];
            const delivery = requested > 0 ? carried / requested : 1;
            return (
              <div
                key={id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] px-3 py-2 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="truncate">{label}</span>
                </span>
                <span className="num text-white/45">{requested.toFixed(2)}G</span>
                <span className="num text-white/65">{carried.toFixed(2)}G</span>
                <span className={`num font-semibold ${delivery < 0.995 ? 'text-neon-red' : 'text-neon-lime'}`}>
                  {Math.round(delivery * 100)}%
                </span>
                <span className="col-span-4 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <i
                    className="block h-full rounded-full transition-[width]"
                    style={{
                      width: `${delivery * 100}%`,
                      background: delivery < 0.8 ? '#d36e76' : delivery < 0.995 ? '#d2a657' : color,
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
