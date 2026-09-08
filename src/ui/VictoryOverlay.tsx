import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fmtMoney, fmtNum } from '../game/economy';
import { cityShare, customerCount, rankOf } from '../game/progression';
import { CAMPAIGN_STAGES, scenarioById } from '../game/scenarios';
import { fmtDate } from '../game/simulation';
import { useGame } from '../store/gameStore';
import { useDialogAccessibility } from './useDialogAccessibility';
import { scenarioCopy } from './i18n';

// Reaching the top rung is the win.
export default function VictoryOverlay() {
  const game = useGame((s) => s.game)!;
  const advanceCampaign = useGame((s) => s.advanceCampaign);
  const locale = useGame((s) => s.locale);
  const [dismissed, setDismissed] = useState(false);
  const show = game.victoryAt !== null && !dismissed && !game.gameOver;
  const dialogRef = useDialogAccessibility(show, () => setDismissed(true));
  const scenario = scenarioById(game.scenarioId);
  const nextStage = game.mode === 'campaign' ? CAMPAIGN_STAGES[game.campaignStage + 1] : null;
  const scenarioVictory = game.scenarioId !== 'freeplay';
  const localizedScenario = scenarioCopy(locale, scenario.id);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={locale === 'tr' ? 'Zafer' : 'Victory'}
            tabIndex={-1}
            className="panel w-[460px] overflow-hidden border-neon-lime/40"
            initial={{ scale: 0.94, y: 14 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="border-b border-neon-lime/25 bg-neon-lime/10 px-6 py-5">
              <div className="text-[10px] uppercase tracking-[0.25em] text-neon-lime">
                {scenarioVictory
                  ? locale === 'tr'
                    ? 'Görev tamamlandı'
                    : 'Objective complete'
                  : locale === 'tr'
                    ? 'Zirveye ulaşıldı'
                    : 'Top of the ladder'}
              </div>
              <div className="text-2xl font-bold">
                {scenarioVictory
                  ? (localizedScenario?.name ?? scenario.name)
                  : `${game.companyName} is a ${rankOf(game).name}`}
              </div>
              <div className="num mt-1 text-[11px] text-white/50">{fmtDate(game.victoryAt!)}</div>
            </div>

            <div className="space-y-4 p-6">
              <p className="text-sm leading-relaxed text-white/70">
                {scenarioVictory ? (localizedScenario?.description ?? scenario.description) : rankOf(game).blurb}
              </p>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="chip py-2">
                  <div className="stat-label">{locale === 'tr' ? 'Müşteriler' : 'Customers'}</div>
                  <div className="num text-lg">{fmtNum(customerCount(game))}</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">{locale === 'tr' ? 'Şehir payı' : 'The city'}</div>
                  <div className="num text-lg text-neon-lime">{Math.round(cityShare(game) * 100)}%</div>
                </div>
                <div className="chip py-2">
                  <div className="stat-label">{locale === 'tr' ? 'Nakit' : 'Cash'}</div>
                  <div className="num text-lg text-neon-cyan">{fmtMoney(game.money)}</div>
                </div>
              </div>

              <p className="text-[11px] leading-snug text-white/40">
                {nextStage
                  ? `The next campaign stage opens in ${nextStage.cityName}. Cash reserves provide a launch bonus.`
                  : 'Nothing stops here. The rivals are still building, the kit still ages, and the city still grows.'}
              </p>

              {nextStage ? (
                <button className="btn-primary w-full" onClick={advanceCampaign}>
                  {locale === 'tr'
                    ? `${nextStage.cityName} kampanyasına geç`
                    : `Continue campaign in ${nextStage.cityName}`}
                </button>
              ) : (
                <button className="btn-primary w-full" onClick={() => setDismissed(true)}>
                  {locale === 'tr' ? 'Devam et' : 'Keep going'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
