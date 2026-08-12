import { motion } from 'framer-motion';
import { RESEARCH, isAvailable } from '../../game/research';
import { fmtMoneyExact } from '../../game/economy';
import { useGame } from '../../store/gameStore';

const BRANCH_LABEL = {
  fixed: 'Fixed Network',
  mobile: 'Mobile',
  ops: 'Operations',
} as const;

const BRANCH_COLOR = {
  fixed: '#3ee6d6',
  mobile: '#a78bfa',
  ops: '#ffc857',
} as const;

export default function ResearchScreen() {
  const game = useGame((s) => s.game)!;
  const startResearch = useGame((s) => s.startResearch);

  const active = game.researchActive;
  const activeNode = active ? RESEARCH.find((r) => r.id === active.id) : null;

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-ink-900 p-6">
      <div className="mx-auto max-w-6xl">
        {activeNode && (
          <div className="panel mb-5 border-neon-cyan/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-neon-cyan">In progress</div>
                <div className="text-lg font-semibold">{activeNode.name}</div>
              </div>
              <div className="num text-sm text-white/60">{Math.ceil(active!.daysLeft)} days left</div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-neon-cyan"
                animate={{ width: `${(1 - active!.daysLeft / activeNode.days) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {(['fixed', 'mobile', 'ops'] as const).map((branch) => (
            <div key={branch} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: BRANCH_COLOR[branch] }}>
                {BRANCH_LABEL[branch]}
              </h2>
              {RESEARCH.filter((r) => r.branch === branch)
                .sort((a, b) => a.tier - b.tier)
                .map((r) => {
                  const done = game.researchDone.includes(r.id);
                  const available = isAvailable(r, game.researchDone);
                  const busy = !!game.researchActive;
                  const affordable = game.money >= r.cost;

                  return (
                    <div
                      key={r.id}
                      className={`panel p-4 transition-opacity ${done ? 'border-neon-lime/30' : available ? '' : 'opacity-45'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold">{r.name}</div>
                          <div className="num text-[11px] text-white/40">
                            {fmtMoneyExact(r.cost)} · {r.days} days
                          </div>
                        </div>
                        {done && <span className="chip border-neon-lime/40 text-[10px] text-neon-lime">DONE</span>}
                      </div>

                      <p className="mt-2 text-[12px] leading-snug text-white/55">{r.description}</p>

                      <ul className="mt-2 space-y-0.5">
                        {r.unlocks.map((u) => (
                          <li key={u} className="text-[11px] text-white/45">
                            <span style={{ color: BRANCH_COLOR[branch] }}>▸</span> {u}
                          </li>
                        ))}
                      </ul>

                      {!done && (
                        <button
                          className="btn-primary mt-3 w-full"
                          disabled={!available || busy || !affordable}
                          onClick={() => startResearch(r.id)}
                        >
                          {!available
                            ? `Requires ${r.requires.map((q) => RESEARCH.find((x) => x.id === q)?.name).join(', ')}`
                            : busy
                              ? 'Lab is busy'
                              : !affordable
                                ? 'Not enough money'
                                : 'Start research'}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
