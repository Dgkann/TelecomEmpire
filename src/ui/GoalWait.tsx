import { fmtMoneyExact } from '../game/economy';
import { plural } from '../game/util';
import { goalTiming } from '../game/goalTiming';
import { useGame } from '../store/gameStore';
import ExerciseShortcut from './ExerciseShortcut';
import { scrollToAnchor } from './side/shared';

export default function GoalWait({
  cost,
  points = 0,
  needsLab = true,
  activeOnly = false,
  compact = false,
}: {
  cost: number;
  points?: number;
  needsLab?: boolean;
  activeOnly?: boolean;
  compact?: boolean;
}) {
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const timing = goalTiming(game, cost, points, needsLab);
  const summary = activeOnly
    ? tr
      ? `Süren araştırma: yaklaşık ${timing.activeDays} oyun günü kaldı`
      : `Active research: about ${timing.activeDays} ${plural(timing.activeDays, 'game day')} left`
    : timing.readyInDays === null
      ? tr
        ? 'Yalnızca beklemek yetmiyor: gelir veya puan üretimini artır'
        : 'Waiting alone is not enough: improve income or point production'
      : timing.readyInDays === 0
        ? tr
          ? 'Başlamak için beklemene gerek yok'
          : 'No wait needed to start'
        : tr
          ? `Başlatmaya tahminen ${timing.readyInDays} oyun günü`
          : `About ${timing.readyInDays} ${plural(timing.readyInDays, 'game day')} until you can start`;
  if (compact) return <span className="mt-1 block text-[11px] text-white/60">{summary}</span>;
  return (
    <section
      className="mt-3 rounded-lg border border-white/10 bg-black/15 p-3"
      aria-label={tr ? 'Bekleme tahmini' : 'Wait estimate'}
    >
      <p className="text-xs font-semibold text-neon-cyan">{summary}</p>
      {!activeOnly && (
        <>
          <p className="mt-2 text-xs text-white/60">
            {tr ? 'Aylık birikim tahmini: ' : 'Estimated monthly savings: '}
            {fmtMoneyExact(timing.monthlyCash)}.
          </p>
          {timing.pointsMissing > 0 && (
            <p className="mt-1 text-xs text-white/60">
              {tr ? 'Günlük araştırma puanı: ' : 'Daily research points: '}
              {timing.pointsPerDay}.{' '}
              {timing.pointsDays === null
                ? tr
                  ? 'Mühendis kadrosunu incele veya ödüllü bir görev tamamla.'
                  : 'Review your engineers or complete a rewarded exercise.'
                : tr
                  ? `Eksik puanlar yaklaşık ${timing.pointsDays} oyun gününde birikir.`
                  : `Missing points accumulate in about ${timing.pointsDays} ${plural(timing.pointsDays, 'game day')}.`}
            </p>
          )}
          {needsLab && game.researchActive && (
            <p className="mt-1 text-xs text-white/60">
              {tr
                ? `Laboratuvar yaklaşık ${timing.activeDays} oyun günü sonra boşalır.`
                : `The lab becomes free in about ${timing.activeDays} ${plural(timing.activeDays, 'game day')}.`}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-white/45">
            {tr
              ? 'Mevcut gelir, paket kaybı, giderler, kredi taksitleri ve ekiple hesaplanır. Yeni yatırımlar, cezalar, ödüller ve büyüme süreyi değiştirebilir.'
              : 'Based on current income, packet loss, costs, loan payments and staff. Investments, fines, rewards and growth can change the estimate.'}
          </p>
          <button
            className="btn mt-2 whitespace-normal text-xs"
            onClick={() => {
              useGame.getState().setScreen('company');
              scrollToAnchor(timing.pointsMissing > 0 && timing.cashMissing === 0 ? 'staff' : 'finances');
            }}
          >
            {timing.pointsMissing > 0 && timing.cashMissing === 0
              ? tr
                ? 'Mühendis kadrosunu incele'
                : 'Review engineering staff'
              : tr
                ? 'Birikimi artırmak için bütçeyi incele'
                : 'Review the budget to improve savings'}
          </button>
        </>
      )}
      <ExerciseShortcut />
    </section>
  );
}
