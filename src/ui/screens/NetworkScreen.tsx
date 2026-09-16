import CapacityLab from '../CapacityLab';
import { plural } from '../../game/util';
import { useGame } from '../../store/gameStore';
import { t } from '../i18n';
import { useNetworkModel, type NetworkView } from './network/model';
import CapacityOutlookPanel from './network/CapacityOutlookPanel';
import LiveDeliveryPanel from './network/LiveDeliveryPanel';
import TrafficEngineeringPanel from './network/TrafficEngineeringPanel';
import SitesPanel from './network/SitesPanel';
import FibreSpansPanel from './network/FibreSpansPanel';
import MaintenancePanel from './network/MaintenancePanel';
import DistrictsPanel from './network/DistrictsPanel';
import DemandForecastPanel from './network/DemandForecastPanel';
import DataCentrePanel from './network/DataCentrePanel';
import CompetitorPanel from './network/CompetitorPanel';
import SpectrumPanel from './network/SpectrumPanel';
import UpstreamPanel from './network/UpstreamPanel';
import EnergyPanel from './network/EnergyPanel';

const NETWORK_VIEWS: Array<{ id: NetworkView; label: string; note: string }> = [
  { id: 'live', label: 'Live', note: 'Quality & delivery' },
  { id: 'lab', label: 'Network Lab', note: 'Stress test & upgrade' },
  { id: 'policy', label: 'Policy', note: 'QoS & peering' },
  { id: 'capacity', label: 'Capacity', note: 'Sites & forecast' },
  { id: 'operations', label: 'Operations', note: 'Maintenance' },
  { id: 'interconnect', label: 'Edge & transit', note: 'Energy & external network' },
];
const NETWORK_VIEWS_TR: Record<NetworkView, [string, string]> = {
  live: ['Canlı', 'Kalite ve hizmet'],
  lab: ['Şebeke laboratuvarı', 'Yük testi ve yükseltme'],
  policy: ['Politikalar', 'QoS ve eşleşme'],
  capacity: ['Kapasite', 'Sahalar ve tahmin'],
  operations: ['Operasyonlar', 'Bakım'],
  interconnect: ['Enerji ve bağlantı', 'Tarifeler ve dış ağ'],
};

export default function NetworkScreen() {
  const m = useNetworkModel();
  const tr = m.locale === 'tr';

  return (
    <div className="screen-shell">
      <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-2">
        <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-2">
          <div>
            <div className="stat-label text-neon-cyan">{t(m.locale, 'networkOperations')}</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
              {t(m.locale, 'liveServiceControl')}
            </h1>
            <p className="mt-1 text-[13px] text-white/45">{t(m.locale, 'liveServiceBlurb')}</p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-right ${m.daysLeft !== null && m.daysLeft < 30 ? 'border-neon-red/30 bg-neon-red/[0.07]' : 'border-neon-lime/20 bg-neon-lime/[0.05]'}`}
          >
            <div className="stat-label">{t(m.locale, 'capacityOutlook')}</div>
            <div
              className={`num text-sm font-semibold ${m.daysLeft !== null && m.daysLeft < 30 ? 'text-neon-red' : 'text-neon-lime'}`}
            >
              {!m.forecast.confident
                ? tr
                  ? 'Veri toplanıyor'
                  : 'Collecting baseline'
                : m.daysLeft === null
                  ? tr
                    ? 'Talep dengeli'
                    : 'Demand stable'
                  : m.daysLeft > 365
                    ? tr
                      ? '1 yıldan fazla'
                      : 'More than 1 year'
                    : tr
                      ? `${Math.round(m.daysLeft)} günlük kapasite`
                      : `${Math.round(m.daysLeft)} ${plural(Math.round(m.daysLeft), 'day')} headroom`}
            </div>
          </div>
        </div>

        <div
          className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-md border border-white/[0.08] bg-[#0d151c]/95 p-1 shadow-lg backdrop-blur lg:col-span-2"
          role="tablist"
          aria-label={tr ? 'Ağ yönetimi görünümleri' : 'Network operations views'}
        >
          {NETWORK_VIEWS.map((view) => (
            <button
              key={view.id}
              role="tab"
              aria-selected={m.networkView === view.id}
              onClick={() => {
                if (view.id === 'lab') useGame.getState().setSpeed(0);
                m.setNetworkView(view.id);
              }}
              className={`min-w-[112px] flex-1 rounded-sm border px-3 py-2 text-left transition-colors ${
                m.networkView === view.id
                  ? 'border-neon-cyan/45 bg-neon-cyan/[0.1] text-white'
                  : 'border-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/80'
              }`}
            >
              <span className="block text-[11px] font-semibold">{tr ? NETWORK_VIEWS_TR[view.id][0] : view.label}</span>
              <span className="block text-[9px] text-white/40">{tr ? NETWORK_VIEWS_TR[view.id][1] : view.note}</span>
            </button>
          ))}
        </div>

        {m.networkView === 'lab' && <CapacityLab />}

        <CapacityOutlookPanel m={m} />
        <LiveDeliveryPanel m={m} />
        <TrafficEngineeringPanel m={m} />
        <SitesPanel m={m} />
        <FibreSpansPanel m={m} />
        <MaintenancePanel m={m} />
        <DistrictsPanel m={m} />
        <DemandForecastPanel m={m} />
        <DataCentrePanel m={m} />
        <CompetitorPanel m={m} />
        <SpectrumPanel m={m} />
        <EnergyPanel m={m} />
        <UpstreamPanel m={m} />
      </div>
    </div>
  );
}
