import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { daysToReach, reputationDrivers, reputationOutlook } from '../game/reputation';
import { scenarioStatus } from '../game/scenarios';
import { regulationProgress } from '../game/regulator';
import { useGame } from '../store/gameStore';
import { scrollToAnchor } from './side/shared';
import { computeRoutes, isRedundant } from '../game/network';

export default function ReputationGuidance() {
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const setScreen = useGame((s) => s.setScreen);
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const outlook = reputationOutlook(game);
  const drivers = reputationDrivers(game);
  const settle = Math.round(drivers.settle);
  const mission = scenarioStatus(game);
  // A timed scenario that asks for reputation, including one it currently meets but will not keep.
  const required =
    !mission.complete && mission.scenario.deadlineDays !== null
      ? mission.objectives.find((objective) => objective.id === 'reputation')?.target
      : undefined;
  const scenarioName = tr ? mission.scenario.nameTr : mission.scenario.name;
  const arrives = required === undefined ? null : daysToReach(game, required, drivers.settle);
  const inTime = arrives !== null && mission.daysLeft !== null && arrives <= mission.daysLeft;
  const decimal = (value: number) =>
    value.toLocaleString(tr ? 'tr-TR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const points = (value: number) => `${value >= 0 ? '+' : '−'}${decimal(Math.abs(value))}`;
  // The same price index the strategy desk explains, where 1.00 is the market average.
  const index = (1 + drivers.premium).toLocaleString(tr ? 'tr-TR' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const rows: Array<[string, number]> = [];
  if (Math.abs(drivers.price) >= 0.5)
    rows.push([
      tr ? `Fiyat endeksi ${index} (piyasa 1,00)` : `Price index ${index} (the market is 1.00)`,
      drivers.price,
    ]);
  if (drivers.load <= -0.5)
    rows.push([tr ? 'Hizmet açıkları: yük ve arızalar' : 'Service shortfalls: load and faults', drivers.load]);
  if (drivers.outages <= -0.5) rows.push([tr ? 'Kesintili ilçeler' : 'District outages', drivers.outages]);
  if (drivers.staff >= 0.5)
    rows.push([
      tr ? 'Destek ekibi ve elde tutma kampanyaları' : 'Support staff and retention campaigns',
      drivers.staff,
    ]);
  rows.sort((a, b) => a[1] - b[1]);
  const busiest = drivers.busiest;
  const pending = game.regulations
    .filter((r) => r.status === 'pending' && regulationProgress(game, r) < 1)
    .sort((a, b) => a.dueAt - b.dueAt);
  const failed = game.regulations.filter((r) => r.status === 'failed' && r.dueAt >= game.minutes - 30 * 1440).length;
  const open = (screen: 'network' | 'company', anchor: string) => {
    setScreen(screen);
    scrollToAnchor(anchor);
  };
  return (
    <section
      id="reputation"
      aria-label={tr ? 'İtibarın nedenleri' : 'Reputation explained'}
      className="panel scroll-mt-20 p-4 lg:col-span-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{tr ? 'İtibarın nedenleri' : 'Reputation explained'}</h2>
        <span className="num text-neon-cyan">{Math.round(game.reputation)} / 100</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/60">
        {tr
          ? `Bugünkü fiyat, ağ sağlığı ve yük sürerse itibarın yaklaşık ${settle} puanda dengelenir.`
          : `If today's prices, network health and load hold, reputation settles near ${settle}.`}{' '}
        {tr
          ? 'Bu bir garanti değil; arızalar ve yükümlülük sonuçları ayrıca etki eder.'
          : 'Faults and regulatory outcomes can also change it.'}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-white/10 p-2">
          <div className="text-white/50">{tr ? 'Ağ sağlığı' : 'Network health'}</div>
          <div className="num mt-1">{Math.round(game.stats.health)} / 100</div>
        </div>
        <div className="rounded border border-white/10 p-2">
          <div className="text-white/50">{tr ? 'Memnuniyet' : 'Satisfaction'}</div>
          <div className="num mt-1">{Math.round(outlook.satisfaction)} / 100</div>
        </div>
        <div className="rounded border border-white/10 p-2">
          <div className="text-white/50">{tr ? 'Kesintili ilçe' : 'District outages'}</div>
          <div className="num mt-1">{outlook.outages}</div>
        </div>
      </div>
      {required !== undefined && (
        <p className={`mt-3 text-xs ${inTime ? 'text-neon-lime' : 'text-neon-amber'}`}>
          {arrives === null
            ? tr
              ? `${scenarioName} ${required} itibar istiyor: bu düzeyde yaklaşık ${Math.max(1, required - settle)} puan eksik kalıyor.`
              : `${scenarioName} needs ${required} reputation: at this level it falls about ${Math.max(1, required - settle)} short.`
            : arrives === 0
              ? tr
                ? `${scenarioName} ${required} itibar istiyor: bu düzey onu koruyor.`
                : `${scenarioName} needs ${required} reputation: this level keeps it.`
              : inTime
                ? tr
                  ? `${scenarioName} ${required} itibar istiyor: bu düzeyde yaklaşık ${arrives} günde ulaşır.`
                  : `${scenarioName} needs ${required} reputation: at this level it arrives in about ${arrives} days.`
                : tr
                  ? `${scenarioName} ${required} itibar istiyor: bu düzeyde ancak ${arrives} günde ulaşır, süre ${mission.daysLeft} gün.`
                  : `${scenarioName} needs ${required} reputation: at this level it takes ${arrives} days, and ${mission.daysLeft} remain.`}
        </p>
      )}
      {rows.length > 0 && (
        <ul aria-label={tr ? 'İtibarı etkileyenler' : 'What moves reputation'} className="mt-3 space-y-1 text-xs">
          {rows.map(([label, value]) => (
            <li key={label} className="flex justify-between gap-3">
              <span className="text-white/65">{label}</span>
              <span className={`num ${value < 0 ? 'text-neon-amber' : 'text-neon-lime'}`}>{points(value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-white/55">
        {tr
          ? `Ağ sağlığı ${Math.round(drivers.health)}: her puan yaklaşık ${decimal(drivers.perHealthPoint)} itibar eder.`
          : `Network health ${Math.round(drivers.health)}: each point is worth about ${decimal(drivers.perHealthPoint)} reputation.`}
      </p>
      {failed > 0 && (
        <p className="mt-3 text-xs text-neon-amber">
          {tr
            ? `Son 30 günde ${failed} yükümlülük kaçırıldı. Her biri gerçekleştiği anda 8 itibar puanı düşürdü.`
            : `${failed} obligations missed in the last 30 days. Each caused an immediate loss of 8 reputation points.`}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(outlook.outages > 0 || game.stats.health < 90) && (
          <button className="btn text-xs" onClick={() => open('network', 'maintenance')}>
            {tr ? 'Arıza ve bakımları incele' : 'Review faults and maintenance'}
          </button>
        )}
        {game.stats.packetLoss > 0.01 && (
          <button className="btn text-xs" onClick={() => open('network', 'transit')}>
            {tr ? 'Kapasite kaybını incele' : 'Review capacity loss'}
          </button>
        )}
        {drivers.price <= -0.5 && (
          <button className="btn text-xs" onClick={() => open('company', 'pricing')}>
            {tr ? 'Fiyatları aç' : 'Open pricing'}
          </button>
        )}
        {drivers.load <= -0.5 && busiest && (
          <button
            className="btn text-xs"
            onClick={() => {
              setScreen('map');
              focus(busiest.gx, busiest.gy);
              select({ type: 'node', id: busiest.id });
            }}
          >
            {tr ? 'En yüklü noktayı göster' : 'Show the busiest site'}
          </button>
        )}
      </div>
      {pending.map((r) => {
        const district = game.districts.find((d) => d.id === r.districtId);
        const title =
          r.kind === 'coverage'
            ? tr
              ? `${district?.name ?? ''}: kapsama %${Math.round(r.target * 100)}`
              : `${district?.name ?? ''}: ${Math.round(r.target * 100)}% coverage`
            : r.kind === 'resilience'
              ? tr
                ? `Sahaların %${Math.round(r.target * 100)}'ine yedek bağlantı`
                : `Backup paths for ${Math.round(r.target * 100)}% of sites`
              : tr
                ? `Ortalama fiyatı ${r.target.toFixed(2)}× sınırına indir`
                : `Bring average pricing within ${r.target.toFixed(2)}×`;
        const daysLeft = Math.max(0, Math.ceil((r.dueAt - game.minutes) / 1440));
        return (
          <div key={r.id} className="mt-3 rounded border border-neon-amber/25 p-3 text-xs">
            <div className="font-semibold text-neon-amber">{title}</div>
            <p className="mt-1 text-white/60">
              {daysLeft} {tr ? 'gün kaldı' : `${plural(daysLeft, 'day')} left`} · {fmtMoneyExact(r.fine)} · −8{' '}
              {tr ? 'itibar riski' : 'reputation at risk'}
            </p>
            <button
              className="btn mt-2 text-xs"
              onClick={() => {
                if (r.kind === 'price_cap') open('company', 'pricing');
                else if (district) {
                  setScreen('map');
                  focus(district.center.gx, district.center.gy);
                  select({ type: 'district', id: district.id });
                } else {
                  setScreen('map');
                  const routes = computeRoutes(game);
                  const site = game.nodes.find(
                    (n) => ['pop', 'access', 'tower'].includes(n.kind) && !isRedundant(game, n.id, routes),
                  );
                  if (site) {
                    focus(site.gx, site.gy);
                    select({ type: 'node', id: site.id });
                  }
                }
              }}
            >
              {r.kind === 'price_cap'
                ? tr
                  ? 'Paket fiyatlarını aç'
                  : 'Open package pricing'
                : tr
                  ? 'Ağı haritada incele'
                  : 'Inspect the network on the map'}
            </button>
          </div>
        );
      })}
      {outlook.target >= game.reputation &&
        pending.length === 0 &&
        outlook.outages === 0 &&
        game.stats.health >= 90 && (
          <p className="mt-3 text-xs text-neon-lime">
            {tr
              ? 'Hizmet koşulları toparlanmayı destekliyor. Sağlıklı ağı koruyarak ilerle.'
              : 'Service conditions support recovery. Keep the network healthy as you grow.'}
          </p>
        )}
    </section>
  );
}
