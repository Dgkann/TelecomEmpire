import { useState } from 'react';
import { milestoneProgress } from '../game/milestones';
import { fmtMoney } from '../game/economy';
import { useGame } from '../store/gameStore';
import { playSound } from './sound';

// Where each goal's shortcut leads; the rest open the build tools on the map.
const RESEARCH_GOALS = new Set<string>(['research', 'laboratory', 'mobile', 'hosting']);
const COMPANY_GOALS = new Set<string>(['contract', 'accounts']);

export default function DevelopmentGoals({ onNavigate }: { onNavigate: () => void }) {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const claim = useGame((s) => s.claimMilestone);
  const sound = useGame((s) => s.soundOn);
  const setTool = useGame((s) => s.setTool);
  const setScreen = useGame((s) => s.setScreen);
  const [expanded, setExpanded] = useState(false);
  const tr = locale === 'tr';
  const goals = milestoneProgress(game);
  const claimed = goals.filter((g) => g.claimed).length;
  const next = goals.find((g) => !g.claimed && g.progress >= 1) ?? goals.find((g) => !g.claimed);
  const shown = expanded ? goals : next ? [next] : [];
  return (
    <section className="panel development-goals p-3" aria-label={tr ? 'Gelişim hedefleri' : 'Development goals'}>
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-white/90">{tr ? 'Şehrini bağla' : 'Connect your city'}</span>
        <span className="text-xs text-neon-cyan">
          {claimed}/{goals.length} {expanded ? '−' : '+'}
        </span>
      </button>
      <div className="my-3 flex gap-1" aria-hidden="true">
        {goals.map((g) => (
          <span
            key={g.id}
            className={`h-1 flex-1 rounded-full ${g.claimed ? 'bg-neon-cyan' : g.progress >= 1 ? 'bg-neon-amber' : 'bg-white/10'}`}
          />
        ))}
      </div>
      {!next && !expanded && (
        <p className="text-xs leading-relaxed text-neon-cyan">
          {tr
            ? 'Tüm gelişim hedefleri tamamlandı. Sıradaki durak: şehir liderliği.'
            : 'Every development goal complete. Next stop: city leadership.'}
        </p>
      )}
      <div className="space-y-4">
        {shown.map((goal) => (
          <div key={goal.id} className={goal.claimed ? 'opacity-60' : ''}>
            <div className="flex justify-between gap-2 text-xs font-semibold">
              <span>{goal.title[tr ? 1 : 0]}</span>
              <span className="shrink-0 text-neon-cyan">
                {goal.claimed ? '✓' : `${Math.min(goal.current, goal.target)}/${goal.target}`}
              </span>
            </div>
            <p className="my-2 text-xs leading-relaxed text-white/60">{goal.hint[tr ? 1 : 0]}</p>
            {!goal.claimed && (
              <>
                <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-neon-cyan transition-[width]"
                    style={{ width: `${goal.progress * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neon-amber">
                    +{fmtMoney(goal.reward)} · +{goal.research} {tr ? 'AP' : 'RP'}
                  </span>
                  {goal.progress >= 1 ? (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => {
                        claim(goal.id);
                        playSound('cash', sound);
                      }}
                    >
                      {tr ? 'Ödülü al' : 'Claim reward'}
                    </button>
                  ) : (
                    <button
                      className="btn text-xs"
                      onClick={() => {
                        onNavigate();
                        if (RESEARCH_GOALS.has(goal.id)) setScreen('research');
                        else if (COMPANY_GOALS.has(goal.id)) setScreen('company');
                        else if (goal.id === 'connected')
                          setTool(game.nodes.filter((n) => n.kind === 'pop').length < 2 ? 'pop' : 'fiber');
                        else if (goal.id === 'resilient' || goal.id === 'protected') setTool('fiber');
                        else setTool('access');
                      }}
                    >
                      {RESEARCH_GOALS.has(goal.id)
                        ? tr
                          ? 'Araştırma'
                          : 'Research'
                        : COMPANY_GOALS.has(goal.id)
                          ? tr
                            ? 'Şirket'
                            : 'Company'
                          : tr
                            ? 'Planla'
                            : 'Plan'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
