import { motion } from 'framer-motion';
import { fmtMoneyExact } from '../../game/economy';
import { RESEARCH, isAvailable } from '../../game/research';
import { totalCustomers } from '../../game/simulation';
import { staffModifiers } from '../../game/staff';
import { useGame } from '../../store/gameStore';

const BRANCH = {
  fixed: { label: 'Fixed network', code: 'FX', color: '#2dd4bf', description: 'Fibre, access and backbone capacity.' },
  mobile: { label: 'Mobile', code: 'RF', color: '#aa8cff', description: 'Spectrum, radio access and mobility.' },
  ops: {
    label: 'Operations',
    code: 'OP',
    color: '#f3b843',
    description: 'Automation, resilience and enterprise service.',
  },
} as const;

export default function ResearchScreen() {
  const game = useGame((s) => s.game)!;
  const startResearch = useGame((s) => s.startResearch);
  const active = game.researchActive;
  const activeNode = active ? RESEARCH.find((r) => r.id === active.id) : null;
  const completed = game.researchDone.length;
  const staff = staffModifiers(game);
  const researchPerDay = staff.researchPointsPerDay + Math.max(0, Math.round(totalCustomers(game) / 2500));

  return (
    <div className="screen-shell">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="stat-label text-neon-cyan">Technology programme</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">Network evolution map</h1>
            <p className="mt-1 max-w-xl text-[13px] text-white/45">
              Follow each branch from field infrastructure to city-scale capability. Cross-branch requirements are named
              on locked nodes.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="kpi min-w-[110px]">
              <div className="stat-label">Research points</div>
              <div className="num text-lg text-neon-cyan">{game.researchPoints}</div>
            </div>
            <div className="kpi min-w-[110px]">
              <div className="stat-label">Completed</div>
              <div className="num text-lg text-neon-lime">
                {completed} / {RESEARCH.length}
              </div>
            </div>
            <div className="kpi min-w-[110px]">
              <div className="stat-label">Research output</div>
              <div className="num text-lg text-neon-cyan">+{researchPerDay}/day</div>
            </div>
            <div className="kpi min-w-[120px]">
              <div className="stat-label">Lab status</div>
              <div className={`text-sm font-semibold ${activeNode ? 'text-neon-cyan' : 'text-white/55'}`}>
                {activeNode ? 'Researching' : 'Available'}
              </div>
            </div>
          </div>
        </div>

        {activeNode && (
          <div className="panel mb-5 overflow-hidden border-neon-cyan/30">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative grid h-10 w-10 place-items-center rounded-full border border-neon-cyan/40 bg-neon-cyan/10 font-display text-[11px] font-semibold uppercase text-neon-cyan">
                  Live
                  <span className="absolute inset-0 animate-ping rounded-full border border-neon-cyan/25" />
                </div>
                <div>
                  <div className="stat-label">In progress</div>
                  <div className="text-base font-semibold">{activeNode.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="num text-sm text-white/75">{Math.ceil(active!.daysLeft)} days</div>
                <div className="text-[11px] text-white/35">remaining</div>
              </div>
            </div>
            <div className="h-1 bg-white/5">
              <motion.div
                className="h-full bg-neon-cyan"
                animate={{ width: `${(1 - active!.daysLeft / activeNode.days) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(BRANCH) as Array<keyof typeof BRANCH>).map((branch) => {
            const meta = BRANCH[branch];
            const nodes = RESEARCH.filter((r) => r.branch === branch).sort((a, b) => a.tier - b.tier);
            const branchDone = nodes.filter((r) => game.researchDone.includes(r.id)).length;
            const branchReady = nodes.filter(
              (r) => isAvailable(r, game.researchDone) && !game.researchDone.includes(r.id),
            ).length;
            return (
              <section key={branch} className="relative rounded-xl border border-white/[0.07] bg-black/10 p-3">
                <header className="mb-3 flex items-start gap-3 rounded-lg bg-white/[0.025] p-3">
                  <div
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border font-display text-sm font-semibold"
                    style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}12` }}
                  >
                    {meta.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2
                        className="font-display text-lg font-semibold uppercase tracking-[0.1em]"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </h2>
                      <span className="font-mono text-[9px] text-white/35">
                        {branchDone}/{nodes.length} ONLINE
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-white/40">{meta.description}</p>
                    {branchReady > 0 && (
                      <div
                        className="mt-1 text-[9px] font-semibold uppercase tracking-wider"
                        style={{ color: meta.color }}
                      >
                        {branchReady} programme ready
                      </div>
                    )}
                  </div>
                </header>

                <div className="relative flex flex-col">
                  {nodes.map((r, index) => {
                    const done = game.researchDone.includes(r.id);
                    const available = isAvailable(r, game.researchDone);
                    const busy = !!game.researchActive;
                    const affordableMoney = game.money >= r.cost;
                    const affordablePoints = game.researchPoints >= r.points;
                    const affordable = affordableMoney && affordablePoints;
                    const activeHere = active?.id === r.id;
                    const requirements = r.requires
                      .map((q) => RESEARCH.find((x) => x.id === q)?.name)
                      .filter(Boolean)
                      .join(', ');
                    const status = done ? 'ONLINE' : activeHere ? 'RUNNING' : available ? 'READY' : 'LOCKED';
                    const statusClass = done
                      ? 'text-neon-lime'
                      : activeHere
                        ? 'text-neon-cyan'
                        : available
                          ? 'text-white/70'
                          : 'text-white/[0.28]';
                    return (
                      <div key={r.id} className="relative pb-3 last:pb-0">
                        {index > 0 && (
                          <div
                            className="absolute -top-3 left-6 h-3 w-px"
                            style={{ background: `${meta.color}${done || available ? '99' : '33'}` }}
                          />
                        )}
                        <div
                          className={`relative overflow-hidden rounded-lg border p-3.5 transition-colors ${done ? 'bg-neon-lime/[0.025]' : activeHere ? 'bg-neon-cyan/[0.07]' : available ? 'bg-white/[0.035] hover:bg-white/[0.055]' : 'bg-black/20'}`}
                          style={{
                            borderColor: done
                              ? '#75df9a55'
                              : activeHere
                                ? '#2dd4bf77'
                                : available
                                  ? `${meta.color}66`
                                  : 'rgba(255,255,255,.055)',
                          }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 w-0.5"
                            style={{
                              background: done
                                ? '#75df9a'
                                : activeHere
                                  ? '#2dd4bf'
                                  : available
                                    ? meta.color
                                    : 'rgba(255,255,255,.08)',
                            }}
                          />
                          <div className="flex items-start gap-3">
                            <div
                              className="relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[10px]"
                              style={{
                                borderColor: done
                                  ? '#75df9a88'
                                  : available
                                    ? `${meta.color}88`
                                    : 'rgba(255,255,255,.14)',
                                color: done ? '#75df9a' : available ? meta.color : 'rgba(255,255,255,.3)',
                              }}
                            >
                              {done ? '✓' : r.tier}
                              {(done || available) && (
                                <span
                                  className="absolute -bottom-4 left-1/2 h-3 w-px -translate-x-1/2"
                                  style={{ background: index === nodes.length - 1 ? 'transparent' : `${meta.color}55` }}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h3
                                  className={`text-sm font-semibold ${available || done || activeHere ? 'text-white/90' : 'text-white/[0.48]'}`}
                                >
                                  {r.name}
                                </h3>
                                <span
                                  className={`font-display text-[9px] font-semibold tracking-[0.12em] ${statusClass}`}
                                >
                                  {status}
                                </span>
                              </div>
                              <div className="num mt-0.5 text-[10px] text-white/35">
                                {fmtMoneyExact(r.cost)} · {r.points} RP · {r.days} days
                              </div>
                            </div>
                          </div>
                          <p
                            className={`mt-2 text-[12px] leading-snug ${available || done || activeHere ? 'text-white/50' : 'text-white/[0.36]'}`}
                          >
                            {r.description}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {r.unlocks.map((u) => (
                              <span
                                key={u}
                                className="rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[10px] text-white/40"
                              >
                                {u}
                              </span>
                            ))}
                          </div>
                          {!done &&
                            !activeHere &&
                            (available ? (
                              <button
                                className="btn-primary mt-3 w-full py-2 text-[12px]"
                                disabled={busy || !affordable}
                                onClick={() => startResearch(r.id)}
                              >
                                {busy
                                  ? 'Research slot occupied'
                                  : !affordableMoney
                                    ? `Need ${fmtMoneyExact(r.cost)}`
                                    : !affordablePoints
                                      ? `Need ${r.points} research points`
                                      : 'Start programme'}
                              </button>
                            ) : (
                              <div className="mt-3 rounded-md border border-white/[0.055] bg-black/20 px-2.5 py-2 text-[10px] leading-snug text-white/[0.34]">
                                <span className="mr-1 font-semibold uppercase tracking-wider text-white/25">
                                  Locked
                                </span>{' '}
                                Requires {requirements}
                              </div>
                            ))}
                          {activeHere && (
                            <div className="mt-3 rounded-md border border-neon-cyan/20 bg-neon-cyan/[0.06] px-2.5 py-2 text-center text-[11px] font-semibold text-neon-cyan">
                              Programme running
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
