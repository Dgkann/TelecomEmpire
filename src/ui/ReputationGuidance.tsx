import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { reputationOutlook } from '../game/reputation';
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
          ? `Mevcut hizmet düzeyinde itibarın yaklaşık ${Math.round(outlook.target)} puana yöneliyor.`
          : `At the current service level, reputation trends toward approximately ${Math.round(outlook.target)}.`}{' '}
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
        {outlook.satisfaction < 85 && (
          <button className="btn text-xs" onClick={() => open('company', 'pricing')}>
            {tr ? 'Fiyat ve memnuniyeti incele' : 'Review pricing and satisfaction'}
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
