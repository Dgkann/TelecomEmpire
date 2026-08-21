import { useState } from 'react';
import { motion } from 'framer-motion';
import { averagePrice, fmtMoney, fmtMoneyExact, fmtNum, monthlyBreakdown, packageMix } from '../../game/economy';
import { researchModifiers } from '../../game/research';
import { RANKS, cityShare, nextRank, rankOf } from '../../game/progression';
import { creditLimit, daysUntilInsolvency, loanRate, monthlyDebtService, totalDebt } from '../../game/finance';
import { currentMonthCashFlow } from '../../game/financeLedger';
import { residentialSubs } from '../../game/simulation';
import { contractRisk } from '../../game/operations';
import { STAFF_ROLE_INFO, staffModifiers } from '../../game/staff';
import { useGame } from '../../store/gameStore';
import type { ChurnReason } from '../../game/types';
import TrendChart from '../TrendChart';

const CHURN_REASON: Record<ChurnReason, string> = {
  price: 'too expensive',
  outage: 'outage',
  congestion: 'slow at peak',
  support: 'poor support',
};

const HIRE_ROLES = ['network_engineer', 'noc_engineer', 'support', 'sales', 'security'] as const;

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
  const toggleWholesaleFixed = useGame((s) => s.toggleWholesaleFixed);
  const toggleMvno = useGame((s) => s.toggleMvno);
  const hireTechnician = useGame((s) => s.hireTechnician);
  const hireEmployee = useGame((s) => s.hireEmployee);
  const fireStaff = useGame((s) => s.fireStaff);
  const takeLoan = useGame((s) => s.takeLoan);
  const repayLoan = useGame((s) => s.repayLoan);
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const setOverlay = useGame((s) => s.setOverlay);

  const mods = researchModifiers(game.researchDone);
  const staff = staffModifiers(game);
  const money = monthlyBreakdown(game, mods);
  const cashFlow = currentMonthCashFlow(game);
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
    <div className="screen-shell">
      <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-3">
        <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-3">
          <div>
            <div className="stat-label text-neon-cyan">Commercial control</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">Operator performance</h1>
            <p className="mt-1 text-[13px] text-white/45">Balance growth, service pricing and the cost of keeping the network alive.</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-right ${money.profit >= 0 ? 'border-neon-lime/20 bg-neon-lime/[0.05]' : 'border-neon-red/30 bg-neon-red/[0.07]'}`}>
            <div className="stat-label">Operating position</div>
            <div className={`text-sm font-semibold ${money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>{money.profit >= 0 ? 'Profitable' : 'Costs exceed revenue'}</div>
          </div>
        </div>
        <div className="panel p-5 lg:col-span-3">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <div className="stat-label">Cash</div>
              <div className={`num text-2xl font-semibold ${game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'}`}>
                {fmtMoney(game.money)}
              </div>
            </div>
            <div>
              <div className="stat-label">Operating profit</div>
              <div className={`num text-2xl font-semibold ${money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
                {money.profit >= 0 ? '+' : ''}
                {fmtMoney(money.profit)}
              </div>
            </div>
            <div>
              <div className="stat-label">Free cash flow MTD</div>
              <div className={`num text-2xl font-semibold ${cashFlow.freeCashFlow >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
                {cashFlow.freeCashFlow >= 0 ? '+' : ''}
                {fmtMoney(cashFlow.freeCashFlow)}
              </div>
            </div>
            <div>
              <div className="stat-label">Fixed lines</div>
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
          <div className="mt-5 grid gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex justify-between"><span className="stat-label text-neon-lime">Monthly revenue</span><span className="num text-[12px] text-neon-lime">{fmtMoney(money.totalRevenue)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full bg-neon-lime/80" animate={{ width: `${(money.totalRevenue / Math.max(1, money.totalRevenue, money.totalCost)) * 100}%` }} /></div>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between"><span className="stat-label text-neon-red">Operating cost</span><span className="num text-[12px] text-neon-red">{fmtMoney(money.totalCost)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full bg-neon-amber/80" animate={{ width: `${(money.totalCost / Math.max(1, money.totalRevenue, money.totalCost)) * 100}%` }} /></div>
            </div>
          </div>
        </div>

        <div className="panel panel-tone-violet p-5 lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Company standing</h2>
              <p className="text-[11px] text-white/40">{rankOf(game).blurb}</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-neon-cyan">{rankOf(game).name}</div>
              <div className="num text-[11px] text-white/40">{Math.round(cityShare(game) * 100)}% of the city</div>
            </div>
          </div>

          <div className="flex gap-1">
            {RANKS.map((r, i) => (
              <div
                key={r.id}
                className={`h-1.5 flex-1 rounded-full ${i <= game.rank ? 'bg-neon-cyan' : 'bg-white/10'}`}
                title={r.name}
              />
            ))}
          </div>

          {nextRank(game) ? (
            <div className="mt-4">
              <div className="text-[11px] text-white/45">
                Next: <span className="font-semibold text-white/80">{nextRank(game)!.name}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {nextRank(game)!.requirements.map((req) => {
                  const p = req.progress(game);
                  return (
                    <div key={req.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-white/60">{req.label}</span>
                        <span className={`num ${p >= 1 ? 'text-neon-lime' : 'text-white/45'}`}>{req.detail(game)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${p * 100}%`, background: p >= 1 ? '#7ee787' : '#3ee6d6' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neon-lime">
              Top of the ladder. Everything from here is your own high score.
            </p>
          )}
        </div>

        <div className="panel panel-tone-amber p-5 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Wholesale partnerships</h2><p className="mt-1 text-[11px] text-white/40">Sell spare reach to partner brands. Revenue arrives immediately; their traffic competes at the lowest priority.</p></div>
            <div className="text-right"><div className="stat-label">Wholesale revenue</div><div className="num text-lg font-semibold text-neon-lime">{fmtMoney(money.revenueWholesale)}/mo</div></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 ${game.wholesaleFixed ? 'border-neon-amber/40 bg-neon-amber/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}>
              <div><div className="text-sm font-semibold">Fixed network access</div><div className="mt-1 text-[10px] leading-relaxed text-white/40">Monetise covered homes through reseller ISPs. Adds roughly 18% to fixed traffic.</div></div>
              <input type="checkbox" checked={game.wholesaleFixed} onChange={toggleWholesaleFixed} className="h-4 w-4 shrink-0 accent-[#f3b843]" />
            </label>
            <label className={`flex items-center justify-between gap-4 rounded-xl border p-3 ${game.mvnoEnabled ? 'border-neon-violet/40 bg-neon-violet/[0.07]' : 'border-white/10 bg-white/[0.03]'} ${mods.hasMobile && game.spectrum.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
              <div><div className="text-sm font-semibold">MVNO radio access</div><div className="mt-1 text-[10px] leading-relaxed text-white/40">Host virtual mobile brands. Adds roughly 22% to mobile traffic and needs live spectrum.</div></div>
              <input type="checkbox" disabled={!mods.hasMobile || !game.spectrum.length} checked={game.mvnoEnabled} onChange={toggleMvno} className="h-4 w-4 shrink-0 accent-[#a78bfa]" />
            </label>
          </div>
        </div>

        <div id="pricing" className="panel panel-tone-blue scroll-mt-6 p-5 lg:col-span-2">
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

        <div className="panel panel-tone-green p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Monthly operating finances</h2>
          <div className="divide-y divide-white/5">
            <div className="pb-2">
              <div className="stat-label mb-1">Income</div>
              <Row label="Residential" value={fmtMoneyExact(money.revenueResidential)} tone="text-neon-lime" />
              {money.revenueMobile > 0 && (
                <Row label="Mobile" value={fmtMoneyExact(money.revenueMobile)} tone="text-neon-lime" />
              )}
              {money.revenueHosting > 0 && (
                <Row label="Hosting" value={fmtMoneyExact(money.revenueHosting)} tone="text-neon-lime" />
              )}
              {money.revenueWholesale > 0 && (
                <Row label="Wholesale" value={fmtMoneyExact(money.revenueWholesale)} tone="text-neon-lime" />
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
              <Row label="Retention" value={fmtMoneyExact(-money.costRetention)} tone="text-white/70" />
              {game.finance.costLoanPayments > 0 && (
                <Row label="Last loan payment" value={fmtMoneyExact(-game.finance.costLoanPayments)} tone="text-white/70" />
              )}
              {game.finance.penalties > 0 && (
                <Row label="SLA penalties (MTD)" value={fmtMoneyExact(-game.finance.penalties)} tone="text-neon-red" />
              )}
            </div>
            <div className="pt-2">
              <Row
                label="Operating profit"
                value={`${money.profit >= 0 ? '+' : ''}${fmtMoneyExact(money.profit)}`}
                tone={money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}
              />
            </div>
          </div>

          <div className="mt-4 border-t border-white/[0.07] pt-4">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="stat-label">Cash bridge · month to date</div>
                <div className="mt-1 text-[10px] leading-snug text-white/35">Projects, licences, research, repairs, hiring, bonuses, and asset sales are included below.</div>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-neon-cyan">Actual cash</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
                <Row label="Operating cash MTD" value={`${cashFlow.operatingCash >= 0 ? '+' : ''}${fmtMoneyExact(cashFlow.operatingCash)}`} tone={cashFlow.operatingCash >= 0 ? 'text-neon-lime' : 'text-neon-red'} />
                <Row label="Capital projects MTD" value={fmtMoneyExact(-cashFlow.capitalSpend)} tone="text-neon-amber" />
                <Row label="Other one-offs MTD" value={`${cashFlow.otherOneOffNet >= 0 ? '+' : ''}${fmtMoneyExact(cashFlow.otherOneOffNet)}`} tone={cashFlow.otherOneOffNet >= 0 ? 'text-neon-lime' : 'text-neon-red'} />
              </div>
              <div className="rounded-lg border border-neon-cyan/15 bg-neon-cyan/[0.035] p-3">
                <Row label="Free cash flow MTD" value={`${cashFlow.freeCashFlow >= 0 ? '+' : ''}${fmtMoneyExact(cashFlow.freeCashFlow)}`} tone={cashFlow.freeCashFlow >= 0 ? 'text-neon-lime' : 'text-neon-red'} />
                <Row label="Loan financing MTD" value={`${cashFlow.financing >= 0 ? '+' : ''}${fmtMoneyExact(cashFlow.financing)}`} tone={cashFlow.financing >= 0 ? 'text-neon-cyan' : 'text-neon-red'} />
                <div className="mt-1 border-t border-white/[0.07] pt-1">
                  <Row label="Net cash movement MTD" value={`${cashFlow.netCashMovement >= 0 ? '+' : ''}${fmtMoneyExact(cashFlow.netCashMovement)}`} tone={cashFlow.netCashMovement >= 0 ? 'text-neon-lime' : 'text-neon-red'} />
                </div>
              </div>
            </div>
          </div>

          {game.history.length > 1 && (
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div><div className="stat-label">Operating trend</div><div className="text-[11px] text-white/35">Last {Math.min(14, game.history.length)} completed months</div></div>
                <span className="font-mono text-[10px] text-white/30">MONTHLY</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
                  <TrendChart
                    height={86}
                    formatValue={fmtMoney}
                    series={[
                      { label: 'Revenue $', values: game.history.slice(-14).map((h) => h.revenue), color: '#75df9a' },
                      { label: 'Expense $', values: game.history.slice(-14).map((h) => h.expense), color: '#ff6577' },
                    ]}
                  />
                </div>
                <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
                  <TrendChart
                    height={86}
                    formatValue={fmtNum}
                    series={[{ label: 'Customers', values: game.history.slice(-14).map((h) => h.customers), color: '#68a5ff' }]}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel panel-tone-green p-5 lg:col-span-2">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Finance ledger</h2><p className="mt-1 text-[11px] text-white/35">Operating income, network projects, service work, licences, research, staffing, spectrum, and financing in one place.</p></div>
            <span className="num text-[10px] text-white/35">{game.ledger.length} entries</span>
          </div>
          {game.ledger.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] text-white/40">The first completed month or cash transaction will appear here.</div>
          ) : (
            <div className="scroll-thin max-h-[310px] overflow-y-auto rounded-lg border border-white/[0.07]">
              {game.ledger.slice(0, 40).map((entry) => (
                <div key={entry.id} className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.06] px-3 py-2 last:border-0">
                  <span className="num text-[9px] uppercase text-white/30">Day {Math.floor(entry.at / 1440) + 1}</span>
                  <div className="min-w-0"><div className="truncate text-[12px] text-white/75">{entry.label}</div><div className="text-[9px] uppercase tracking-wider text-white/30">{entry.category.replace(/_/g, ' ')}</div></div>
                  <span className={`num text-[12px] font-semibold ${entry.amount >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>{entry.amount >= 0 ? '+' : ''}{fmtMoneyExact(entry.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel panel-tone-violet p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Contracts</h2>
          {game.contracts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-5 text-center">
              <div className="text-sm text-white/60">No enterprise portfolio yet</div>
              <div className="mt-1 text-[11px] text-white/35">Increase business-district coverage; qualified offers will appear in the map action stack.</div>
              <button className="btn mt-3" onClick={() => { setOverlay('customers'); setScreen('map'); }}>Open customer map</button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {game.contracts.map((c) => {
                const risk = contractRisk(game, c);
                const breach = risk.usage > 1;
                const building = game.buildings.find((b) => b.id === c.buildingId);
                const riskTone = risk.score >= 0.65 ? '#ff6577' : risk.score >= 0.3 ? '#ffc857' : '#7ee787';
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
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px]"><span className="text-white/40">SLA allowance used</span><span className="num" style={{ color: riskTone }}>{Math.round(risk.usage * 100)}%</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.min(100, risk.usage * 100)}%`, background: riskTone }} /></div>
                      <div className="mt-1.5 flex items-center justify-between gap-2"><span className="text-[10px] text-white/[0.38]">{risk.districtOut ? 'District outage active' : risk.fragile ? 'Single-path exposure' : `${Math.round(risk.allowance)}m monthly allowance`}</span>{building && <button className="text-[9px] font-semibold uppercase tracking-wider text-neon-cyan" onClick={() => { setOverlay('customers'); focus(building.gx, building.gy); select({ type: 'building', id: building.id }); }}>Show on map →</button>}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel panel-tone-amber p-5">
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

        <div className="panel panel-tone-red p-5">
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

        <div className="panel panel-tone-blue p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">Staff</h2>

          <div className="mb-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md bg-white/[0.03] p-2"><div className="text-white/35">Maintenance saving</div><div className="num text-neon-lime">{Math.round((1 - staff.maintenanceCostMul) * 100)}%</div></div>
            <div className="rounded-md bg-white/[0.03] p-2"><div className="text-white/35">Incident reduction</div><div className="num text-neon-lime">{Math.round((1 - staff.incidentRateMul) * 100)}%</div></div>
            <div className="rounded-md bg-white/[0.03] p-2"><div className="text-white/35">Support bonus</div><div className="num text-neon-cyan">+{staff.supportSatisfaction.toFixed(1)}</div></div>
            <div className="rounded-md bg-white/[0.03] p-2"><div className="text-white/35">Research per day</div><div className="num text-neon-cyan">+{staff.researchPointsPerDay} RP</div></div>
          </div>

          <div className="mb-3 flex flex-col gap-1.5">
            {game.technicians.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
                <div>
                  <div className="text-sm">{t.name}</div>
                  <div className="num text-[10px] text-white/40">
                    Field crew · skill {t.skill} · {t.experience} XP · {t.state}
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
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2" title={STAFF_ROLE_INFO[e.role].effect}>
                <div>
                  <div className="text-sm">{e.name}</div>
                  <div className="num text-[10px] text-white/40">
                    {STAFF_ROLE_INFO[e.role].label} · skill {e.skill} · {e.experience} XP
                  </div>
                  <div className="mt-0.5 max-w-[230px] text-[10px] leading-snug text-white/30">{STAFF_ROLE_INFO[e.role].effect}</div>
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
            {HIRE_ROLES.map((role) => (
              <button key={role} className="btn text-xs" title={STAFF_ROLE_INFO[role].effect} onClick={() => hireEmployee(role)}>
                Hire {STAFF_ROLE_INFO[role].label.toLowerCase()} · $6k
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-white/35">
            Skills improve through experience, and every role changes the metric described above.
          </p>
        </div>
      </div>
    </div>
  );
}
