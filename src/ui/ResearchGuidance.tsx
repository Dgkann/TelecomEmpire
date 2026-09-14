import { fmtMoneyExact } from '../game/economy';
import { researchPlan } from '../game/researchPlanning';
import { useGame } from '../store/gameStore';
import { researchCopy } from './researchCopy';

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
  if (!plan) return null;
  const tr = locale === 'tr';
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
      <h2 className="mt-1 text-base font-semibold">
        {tr ? 'Sonraki araştırma' : 'Next research'}: {name(plan.next ?? plan.target)}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{plan.steps.map(name).join(' → ')}</p>
      <p className="mt-2 text-sm text-neon-amber">{status}</p>
      {plan.cashMissing > 0 && plan.pointsMissing > 0 && (
        <p className="mt-1 text-xs text-white/60">
          {plan.pointsMissing} {tr ? 'araştırma puanı da gerekiyor' : 'research points also needed'}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        {tr ? 'Hedefe kadar kalan araştırma bedeli: ' : 'Remaining research cost to goal: '}
        {fmtMoneyExact(plan.remainingCost)}.{' '}
        {tr
          ? 'İşletme giderleri, saha ve spektrum yatırımları buna dahil değil.'
          : 'Operating expenses, sites and spectrum are additional.'}
      </p>
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
