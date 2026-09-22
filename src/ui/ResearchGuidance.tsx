import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { researchPlan } from '../game/researchPlanning';
import { researchById, researchPrice } from '../game/research';
import { useGame } from '../store/gameStore';
import { researchCopy } from '../game/researchCopy';
import { NODE_SPECS, DATACENTER_PILOT_COST, nodeUpgradeCost } from '../game/constants';
import GoalWait from './GoalWait';
import DataCenterFinance from './DataCenterFinance';

export default function ResearchGuidance({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const setScreen = useGame((s) => s.setScreen);
  const startResearch = useGame((s) => s.startResearch);
  const plan = researchPlan(game);
  const tr = locale === 'tr';
  const pilot = game.nodes.find((n) => n.kind === 'datacenter' && n.tier === 0);
  const needsExpansion =
    !!pilot &&
    game.researchDone.includes('edge_compute') &&
    !game.nodes.some((n) => n.kind === 'datacenter' && n.tier >= 1);
  const siteCost = needsExpansion ? nodeUpgradeCost('datacenter', 0) : DATACENTER_PILOT_COST;
  const needsDataCenter =
    game.researchDone.includes('backbone100g') && !game.nodes.some((n) => n.kind === 'datacenter');
  const edge = researchById('edge_compute')!;
  const edgePrice = researchPrice(game.researchPoints, edge);
  if (needsDataCenter || needsExpansion)
    return (
      <section
        aria-label={tr ? 'Veri merkezi kurulumu' : 'Data centre construction'}
        className={compact ? 'panel my-2 p-3' : 'panel mb-5 border-neon-cyan/25 p-4'}
      >
        <h2 className="text-sm font-semibold">
          {needsExpansion
            ? tr
              ? 'Sonraki aşama: tam kapasiteli merkez'
              : 'Next stage: full data centre'
            : tr
              ? 'İlk aşama: küçük veri merkezi'
              : 'First stage: small data centre'}
        </h2>
        <p className="mt-2 text-xs text-white/60">
          {needsExpansion ? (tr ? 'Genişletme bedeli: ' : 'Expansion cost: ') : tr ? 'Saha bedeli: ' : 'Site cost: '}
          {fmtMoneyExact(siteCost)}.{' '}
          {tr
            ? 'Fiber bağlantısı ve işletme giderleri ayrıca hesaplanır.'
            : 'Fibre connections and operating expenses are additional.'}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-white/60">
          {tr
            ? 'Küçük merkez: 10 Gbps ve tam merkezin %25 barındırma geliri, elektrik ve bakım gideri. Edge araştırması + 3.200.000 ₺ ile 40 Gbps tam merkeze genişlet. Kampanya hedefi tam merkezi gerektirir.'
            : 'Small centre: 10 Gbps and 25% of full hosting income, power and maintenance costs. Expand to 40 Gbps with edge research and 3,200,000 ₺. Campaign objectives require the full centre.'}
        </p>
        {game.money < siteCost && (
          <p className="mt-2 text-xs text-neon-amber">
            {fmtMoneyExact(siteCost - game.money)} {tr ? 'en az eksik nakit' : 'minimum cash shortfall'}
          </p>
        )}
        <GoalWait cost={siteCost} needsLab={false} compact={compact} />
        {!compact && needsExpansion && pilot && <DataCenterFinance nodeId={pilot.id} expanded />}
        <button
          className="btn-primary mt-3 text-xs"
          onClick={() => {
            setScreen('map');
            if (needsExpansion && pilot) {
              useGame.getState().setTool(null);
              useGame.getState().select({ type: 'node', id: pilot.id });
              useGame.getState().focus(pilot.gx, pilot.gy);
            } else {
              useGame.getState().setAutoConnect(true);
              useGame.getState().setTool('datacenter');
            }
            onNavigate?.();
          }}
        >
          {needsExpansion
            ? tr
              ? 'Genişletmeyi incele'
              : 'Review expansion'
            : tr
              ? 'Veri merkezi yerini seç'
              : 'Choose a data centre site'}
        </button>
        {!compact && needsDataCenter && !game.researchDone.includes(edge.id) && (
          <section
            className="mt-4 border-t border-white/10 pt-3"
            aria-label={tr ? 'Önce araştırma seçeneği' : 'Research first option'}
          >
            <h3 className="text-xs font-semibold">
              {tr ? 'İstersen önce araştırmaya yatırım yap' : 'You can invest in research first'}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-white/60">
              {tr
                ? 'Küçük merkez erken barındırma geliri sağlar. Önce Edge araştırmasını seçersen nakdini araştırmaya ayırır, merkezin kurulumunu sonraya bırakırsın.'
                : 'A small centre earns hosting income early. Choosing edge research first reserves your cash for research and leaves construction for later.'}
            </p>
            <p className="mt-2 text-xs text-white/60">
              {fmtMoneyExact(edgePrice.cash)} · {edge.points}{' '}
              {tr ? 'araştırma puanı' : plural(edge.points, 'research point')} · {edge.days}{' '}
              {tr ? 'oyun günü' : plural(edge.days, 'game day')}
            </p>
            {edgePrice.credit > 0 && (
              <p className="mt-1 text-xs text-neon-lime/80">
                {tr
                  ? `${edgePrice.creditPoints} fazla araştırma puanı bedeli ${fmtMoneyExact(edgePrice.credit)} düşürüyor.`
                  : `${edgePrice.creditPoints} spare research points take ${fmtMoneyExact(edgePrice.credit)} off the bill.`}
              </p>
            )}
            <GoalWait
              cost={edgePrice.cash}
              points={edge.points}
              activeOnly={game.researchActive?.id === edge.id}
              compact
            />
            {game.researchActive && game.researchActive.id !== edge.id && (
              <p className="mt-2 text-xs text-neon-amber">
                {tr
                  ? 'Önce süren araştırmanın tamamlanmasını bekle.'
                  : 'Wait for the current research to finish first.'}
              </p>
            )}
            <button
              className="btn mt-3 whitespace-normal text-xs"
              disabled={
                !!game.researchActive ||
                !!game.gameOver ||
                game.money < edgePrice.cash ||
                game.researchPoints < edge.points
              }
              onClick={() => startResearch(edge.id)}
            >
              {game.researchActive?.id === edge.id
                ? tr
                  ? 'Edge araştırması sürüyor'
                  : 'Edge research in progress'
                : tr
                  ? 'Önce Edge araştırmasını başlat'
                  : 'Start edge research first'}
            </button>
          </section>
        )}
      </section>
    );
  if (!plan) return null;
  const name = (node: NonNullable<typeof plan>['target']) => researchCopy(node, locale).name;
  const status = !plan.next
    ? tr
      ? 'Hedef araştırması sürüyor'
      : 'Target research in progress'
    : plan.cashMissing > 0
      ? tr
        ? `${fmtMoneyExact(plan.cashMissing)} eksik nakit`
        : `${fmtMoneyExact(plan.cashMissing)} cash shortfall`
      : plan.pointsMissing > 0
        ? tr
          ? `${plan.pointsMissing} araştırma puanı eksik`
          : `${plan.pointsMissing} research points needed`
        : game.researchActive
          ? tr
            ? 'Laboratuvarın boşalmasını bekliyor'
            : 'Waiting for the research slot'
          : tr
            ? 'Bütçe ve puan hazır'
            : 'Cash and points ready';
  if (compact)
    return (
      <button
        className="btn my-2 w-full whitespace-normal text-left text-xs"
        onClick={() => {
          setScreen('research');
          onNavigate?.();
        }}
      >
        <span className="block font-semibold">
          {tr ? 'Sonraki araştırma' : 'Next research'} · {name(plan.next ?? plan.target)}
        </span>
        <span className="mt-1 block text-[11px] text-white/60">{status} →</span>
        <GoalWait cost={plan.nextPrice?.cash ?? 0} points={plan.next?.points} activeOnly={!plan.next} compact />
      </button>
    );
  return (
    <section
      aria-label={tr ? 'Araştırma yol haritası' : 'Research roadmap'}
      className="panel mb-5 border-neon-cyan/25 p-4"
    >
      <div className="stat-label text-neon-cyan">
        {tr ? 'Önerilen hedef' : 'Suggested goal'} · {name(plan.target)}
      </div>
      {pilot && (
        <p className="mt-2 text-xs text-neon-lime">
          {tr
            ? 'Küçük merkez kuruldu. Tam kapasiteye geçmek için Edge araştırmasını tamamla.'
            : 'Small centre built. Complete edge research to expand to full capacity.'}
        </p>
      )}
      <h2 className="mt-1 text-base font-semibold">
        {tr ? 'Sonraki araştırma' : 'Next research'}: {name(plan.next ?? plan.target)}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{plan.steps.map(name).join(' → ')}</p>
      <p className="mt-2 text-sm text-neon-amber">{status}</p>
      {!!plan.nextPrice?.credit && (
        <p className="mt-1 text-xs text-neon-lime/80">
          {tr
            ? `${plan.nextPrice.creditPoints} fazla araştırma puanı bedeli ${fmtMoneyExact(plan.nextPrice.credit)} düşürüyor.`
            : `${plan.nextPrice.creditPoints} spare research points take ${fmtMoneyExact(plan.nextPrice.credit)} off the bill.`}
        </p>
      )}
      <GoalWait cost={plan.nextPrice?.cash ?? 0} points={plan.next?.points} activeOnly={!plan.next} />
      {plan.cashMissing > 0 && plan.pointsMissing > 0 && (
        <p className="mt-1 text-xs text-white/60">
          {plan.pointsMissing}{' '}
          {tr ? 'araştırma puanı da gerekiyor' : `${plural(plan.pointsMissing, 'research point')} also needed`}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        {tr ? 'Hedefe kadar kalan araştırma bedeli: ' : 'Remaining research cost to goal: '}
        {fmtMoneyExact(plan.remainingCost)}.{' '}
        {tr
          ? 'İşletme giderleri, saha ve spektrum yatırımları buna dahil değil.'
          : 'Operating expenses, sites and spectrum are additional.'}
      </p>
      {plan.target.id === 'edge_compute' && (
        <p className="mt-2 text-xs text-neon-cyan">
          {tr
            ? 'Tam merkeze kadar kalan araştırma ve saha yatırımı: '
            : 'Remaining research and site investment to a full centre: '}
          {fmtMoneyExact(
            plan.remainingCost + (pilot ? nodeUpgradeCost('datacenter', 0) : NODE_SPECS.datacenter.baseCost),
          )}
          . {tr ? 'Fiber bağlantısı hariç.' : 'Excludes fibre connections.'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {plan.next && (
          <button
            className="btn-primary px-3 py-2 text-xs"
            disabled={!plan.ready}
            onClick={() => startResearch(plan.next!.id)}
          >
            {tr ? 'Önerilen araştırmayı başlat' : 'Start suggested research'}
          </button>
        )}
        <button className="btn px-3 py-2 text-xs" onClick={() => setScreen('company')}>
          {tr ? 'Gelir ve giderleri incele' : 'Review income and expenses'}
        </button>
      </div>
    </section>
  );
}
