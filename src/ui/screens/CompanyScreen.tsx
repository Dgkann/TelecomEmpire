import { useState } from 'react';
import { motion } from 'framer-motion';
import { averagePrice, fmtMoney, fmtMoneyExact, fmtNum, monthlyBreakdown, packageMix } from '../../game/economy';
import { researchModifiers } from '../../game/research';
import { creditLimit, daysUntilInsolvency, loanRate, monthlyDebtService, totalDebt } from '../../game/finance';
import { residentialSubs } from '../../game/simulation';
import { useGame } from '../../store/gameStore';
import type { ChurnReason, StaffRole } from '../../game/types';

const CHURN_REASON: Record<ChurnReason, string> = {
  price: 'too expensive',
  outage: 'outage',
  congestion: 'slow at peak',
  support: 'poor support',
};

const ROLE_LABEL: Record<StaffRole, string> = {
  network_engineer: 'Network Engineer',
  noc_engineer: 'NOC Engineer',
  field_tech: 'Field Technician',
  support: 'Customer Support',
  sales: 'Sales Manager',
  security: 'Security Engineer',
};

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-white/55">{label}</span>
      <span className={`num ${tone ?? 'text-white'}`}>{value}</span>
    </div>
  );
}

export default function CompanyScreen() {
  const game = useGame((s) => s.game)!;
  const updatePackage = useGame((s) => s.updatePackage);
  const setMarketing = useGame((s) => s.setMarketing);
  const setRetention = useGame((s) => s.setRetention);
  const hireTechnician = useGame((s) => s.hireTechnician);
  const hireEmployee = useGame((s) => s.hireEmployee);
  const fireStaff = useGame((s) => s.fireStaff);
  const takeLoan = useGame((s) => s.takeLoan);
  const repayLoan = useGame((s) => s.repayLoan);

  const mods = researchModifiers(game.researchDone);
  const money = monthlyBreakdown(game, mods);
  const mix = packageMix(game.packages);
  const mobileMix = packageMix(game.packages, 'mobile');
  const subs = residentialSubs(game);
  const headroom = creditLimit(game);
  const debt = totalDebt(game);
  const graceLeft = daysUntilInsolvency(game);
  const [borrowAmount, setBorrowAmount] = useState(50000);
  // Same amortisation the loan itself will use, just for the preview.
  const monthlyRate = loanRate(game) / 12;
  const estimatedPayment = (borrowAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -36));

  return (
    <div className="scroll-thin h-full overflow-y-auto bg-ink-900 p-6">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-3">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
            <div>
              <div className="stat-label">Cash</div>
              <div className={`num text-2xl font-semibold ${game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'}`}>
                {fmtMoney(game.money)}
              </div>
            </div>
            <div>
              <div className="stat-label">Monthly profit</div>
              <div className={`num text-2xl font-semibold ${money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
                {money.profit >= 0 ? '+' : ''}
                {fmtMoney(money.profit)}
              </div>
            </div>
            <div>
              <div className="stat-label">Customers</div>
              <div className="num text-2xl font-semibold">{fmtNum(subs)}</div>
            </div>
            <div>
              <div className="stat-label">Contracts</div>
              <div className="num text-2xl font-semibold">{game.contracts.length}</div>
            </div>
            <div>
              <div className="stat-label">ARPU</div>
              <div className="num text-2xl font-semibold">${averagePrice(game.packages).toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="panel p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Internet packages</h2>
          <p className="mb-4 text-[11px] text-white/40">
            Cheap gigabit wins customers fast, and fills your network just as fast.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {game.packages
              .filter((p) => p.segment === 'residential')
              .map((p) => {
                const share = mix.find((m) => m.pkg.id === p.id)?.share ?? 0;
                return (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{p.name}</span>
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={(e) => updatePackage(p.id, { active: e.target.checked })}
                        className="h-4 w-4 accent-[#3ee6d6]"
                      />
                    </div>
                    <div className="num mt-1 text-xs text-white/45">{p.speedMbps} Mbps</div>

                    <div className="mt-3">
                      <div className="flex items-baseline justify-between">
                        <span className="stat-label">Price</span>
                        <span className="num text-lg font-semibold text-neon-cyan">${p.price}</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={140}
                        value={p.price}
                        onChange={(e) => updatePackage(p.id, { price: Number(e.target.value) })}
                        className="mt-1 w-full"
                      />
                    </div>

                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-white/45">
                        <span>Share of new sign-ups</span>
                        <span className="num">{Math.round(share * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          className="h-full rounded-full bg-neon-cyan"
                          animate={{ width: `${share * 100}%` }}
                        />
                      </div>
                      <div className="num mt-1 text-[11px] text-white/40">{fmtNum(p.subscribers)} subscribers</div>
                    </div>
                  </div>
                );
              })}
          </div>

          {mods.hasMobile && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Mobile plans</h3>
              <p className="mb-3 text-[11px] text-white/40">
                Priced separately from fixed. Radio capacity is finite, so cheap unlimited plans bite quickly.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {game.packages
                  .filter((p) => p.segment === 'mobile')
                  .map((p) => {
                    const share = mobileMix.find((m) => m.pkg.id === p.id)?.share ?? 0;
                    return (
                      <div key={p.id} className="rounded-xl border border-neon-violet/25 bg-neon-violet/[0.06] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{p.name}</span>
                          <input
                            type="checkbox"
                            checked={p.active}
                            onChange={(e) => updatePackage(p.id, { active: e.target.checked })}
                            className="h-4 w-4 accent-[#a78bfa]"
                          />
                        </div>
                        <div className="num mt-1 text-xs text-white/45">{p.speedMbps} Mbps</div>
                        <div className="mt-3 flex items-baseline justify-between">
                          <span className="stat-label">Price</span>
                          <span className="num text-lg font-semibold text-neon-violet">${p.price}</span>
                        </div>
                        <input
                          type="range"
                          min={4}
                          max={90}
                          value={p.price}
                          onChange={(e) => updatePackage(p.id, { price: Number(e.target.value) })}
                          className="mt-1 w-full"
                        />
                        <div className="num mt-2 flex justify-between text-[11px] text-white/40">
                          <span>{Math.round(share * 100)}% of sign-ups</span>
                          <span>{fmtNum(p.subscribers)} subs</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-sm font-semibold">Marketing budget</h3>
                <p className="text-[11px] text-white/40">Spending pulls in customers faster, whether or not you can carry them.</p>
              </div>
              <span className="num text-lg font-semibold text-neon-cyan">{fmtMoney(game.marketingBudget)}/mo</span>
            </div>
            <input
              type="range"
              min={0}
              max={40000}
              step={500}
              value={game.marketingBudget}
              onChange={(e) => setMarketing(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-sm font-semibold">Retention budget</h3>
                <p className="text-[11px] text-white/40">
                  Slows people walking out. It buys time, it does not fix why they are leaving.
                </p>
              </div>
              <span className="num text-lg font-semibold text-neon-violet">{fmtMoney(game.retentionBudget)}/mo</span>
            </div>
            <input
              type="range"
              min={0}
              max={30000}
              step={500}
              value={game.retentionBudget}
              onChange={(e) => setRetention(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Monthly finances</h2>
          <div className="divide-y divide-white/5">
            <div className="pb-2">
              <div className="stat-label mb-1">Income</div>
              <Row label="Residential" value={fmtMoneyExact(money.revenueResidential)} tone="text-neon-lime" />
              {money.revenueMobile > 0 && (
                <Row label="Mobile" value={fmtMoneyExact(money.revenueMobile)} tone="text-neon-lime" />
              )}
              <Row label="Business" value={fmtMoneyExact(money.revenueBusiness)} tone="text-neon-lime" />
              <Row label="Enterprise" value={fmtMoneyExact(money.revenueEnterprise)} tone="text-neon-lime" />
            </div>
            <div className="py-2">
              <div className="stat-label mb-1">Costs</div>
              <Row label="Salaries" value={fmtMoneyExact(-money.costSalaries)} tone="text-white/70" />
              <Row label="Electricity" value={fmtMoneyExact(-money.costPower)} tone="text-white/70" />
              <Row label="Maintenance" value={fmtMoneyExact(-money.costMaintenance)} tone="text-white/70" />
              <Row label="Transit" value={fmtMoneyExact(-money.costTransit)} tone="text-white/70" />
              <Row label="Marketing" value={fmtMoneyExact(-money.costMarketing)} tone="text-white/70" />
              {game.finance.penalties > 0 && (
                <Row label="SLA penalties (MTD)" value={fmtMoneyExact(-game.finance.penalties)} tone="text-neon-red" />
              )}
            </div>
            <div className="pt-2">
              <Row
                label="Net"
                value={`${money.profit >= 0 ? '+' : ''}${fmtMoneyExact(money.profit)}`}
                tone={money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}
              />
            </div>
          </div>

          {game.history.length > 1 && (
            <div className="mt-4">
              <div className="stat-label mb-2">Revenue history</div>
              <div className="flex h-16 items-end gap-1">
                {game.history.slice(-14).map((h, i) => {
                  const max = Math.max(...game.history.slice(-14).map((x) => Math.max(x.revenue, x.expense))) || 1;
                  return (
                    <div key={i} className="flex flex-1 flex-col justify-end gap-0.5">
                      <div className="w-full rounded-sm bg-neon-lime/70" style={{ height: `${(h.revenue / max) * 48}px` }} />
                      <div className="w-full rounded-sm bg-neon-red/50" style={{ height: `${(h.expense / max) * 48}px` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Contracts</h2>
          {game.contracts.length === 0 ? (
            <p className="text-sm text-white/40">
              No contracts yet. Offers appear on the map once a district has real coverage.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {game.contracts.map((c) => {
                const allowed = 43200 * (1 - c.slaPercent / 100);
                const breach = c.downtimeMinutes > allowed;
                return (
                  <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{c.clientName}</span>
                      <span
                        className={`chip text-[10px] ${c.segment === 'enterprise' ? 'border-neon-violet/40 text-neon-violet' : 'border-neon-blue/40 text-neon-blue'}`}
                      >
                        {c.segment}
                      </span>
                    </div>
                    <div className="num mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-white/50">
                      <span>{c.bandwidthGbps} Gbps</span>
                      <span className="text-right text-neon-lime">{fmtMoney(c.monthlyRevenue)}/mo</span>
                      <span>SLA {c.slaPercent}%</span>
                      <span className={`text-right ${breach ? 'text-neon-red' : 'text-white/50'}`}>
                        {Math.round(c.downtimeMinutes)}m down
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Borrowing</h2>
          <p className="mb-3 text-[11px] text-white/40">
            Lenders look at what you earn and what you have built. Go past the limit and they come for the company.
          </p>

          {graceLeft !== null && (
            <div className="alert-blink mb-3 rounded-lg border border-neon-red/40 bg-neon-red/10 p-3">
              <div className="text-sm font-semibold text-neon-red">Past the credit limit</div>
              <div className="num text-[11px] text-white/60">{Math.ceil(graceLeft)} days before the banks act</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="chip py-2">
              <div className="stat-label">Owed</div>
              <div className={`num text-sm ${debt > 0 ? 'text-neon-amber' : 'text-white'}`}>{fmtMoney(debt)}</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">Can borrow</div>
              <div className="num text-sm text-neon-cyan">{fmtMoney(headroom)}</div>
            </div>
            <div className="chip py-2">
              <div className="stat-label">Rate</div>
              <div className="num text-sm">{(loanRate(game) * 100).toFixed(1)}%</div>
            </div>
          </div>

          {game.loans.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {game.loans.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
                  <div>
                    <div className="num text-sm">{fmtMoney(l.remaining)} left</div>
                    <div className="num text-[10px] text-white/40">
                      {fmtMoney(l.monthlyPayment)}/mo at {(l.rateAnnual * 100).toFixed(1)}%
                    </div>
                  </div>
                  <button className="btn px-2 py-1 text-[11px]" onClick={() => repayLoan(l.id)}>
                    Clear
                  </button>
                </div>
              ))}
              <div className="num mt-1 text-[11px] text-white/45">
                Debt service {fmtMoney(monthlyDebtService(game))}/mo
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="stat-label">Draw down</span>
              <span className="num text-lg font-semibold text-neon-cyan">{fmtMoney(borrowAmount)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(10000, headroom)}
              step={5000}
              value={Math.min(borrowAmount, headroom)}
              onChange={(e) => setBorrowAmount(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <div className="num mt-1 flex justify-between text-[10px] text-white/35">
              <span>over 36 months</span>
              <span>
                about {fmtMoney(estimatedPayment)}/mo
              </span>
            </div>
            <button
              className="btn-primary mt-2 w-full"
              disabled={borrowAmount < 5000 || borrowAmount > headroom}
              onClick={() => takeLoan(borrowAmount, 36)}
            >
              {borrowAmount > headroom ? 'More than they will lend' : `Borrow ${fmtMoney(borrowAmount)}`}
            </button>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">Where customers went</h2>
          <p className="mb-3 text-[11px] text-white/40">Most recent losses first.</p>
          {game.churn.length === 0 ? (
            <p className="text-sm text-white/40">Nobody has left yet.</p>
          ) : (
            <div className="scroll-thin flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
              {game.churn.slice(0, 12).map((c) => {
                const d = game.districts.find((x) => x.id === c.districtId);
                const rival = game.competitors.find((x) => x.id === c.toId);
                return (
                  <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="num text-sm font-semibold text-neon-red">-{Math.round(c.count)}</span>
                      <span className="text-[11px]" style={{ color: rival?.color ?? '#8ea0b8' }}>
                        {c.toName}
                      </span>
                    </div>
                    <div className="num mt-0.5 flex justify-between text-[10px] text-white/40">
                      <span>{d?.name}</span>
                      <span>{CHURN_REASON[c.reason]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Staff</h2>

          <div className="mb-3 flex flex-col gap-1.5">
            {game.technicians.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
                <div>
                  <div className="text-sm">{t.name}</div>
                  <div className="num text-[10px] text-white/40">
                    Field crew · skill {t.skill} · {t.state}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num text-[11px] text-white/50">{fmtMoney(t.salary)}</span>
                  <button className="text-[11px] text-white/30 hover:text-neon-red" onClick={() => fireStaff(t.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {game.employees.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
                <div>
                  <div className="text-sm">{e.name}</div>
                  <div className="num text-[10px] text-white/40">
                    {ROLE_LABEL[e.role]} · skill {e.skill}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num text-[11px] text-white/50">{fmtMoney(e.salary)}</span>
                  <button className="text-[11px] text-white/30 hover:text-neon-red" onClick={() => fireStaff(e.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-xs" onClick={hireTechnician}>
              Hire field crew · $4k
            </button>
            <button className="btn text-xs" onClick={() => hireEmployee('support')}>
              Hire support · $6k
            </button>
            <button className="btn text-xs" onClick={() => hireEmployee('network_engineer')}>
              Hire engineer · $6k
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-white/35">
            Field crews repair faults. Support staff lift customer satisfaction.
          </p>
        </div>
      </div>
    </div>
  );
}
