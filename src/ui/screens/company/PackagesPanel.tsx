import { motion } from 'framer-motion';
import { fmtMoney, fmtNum } from '../../../game/economy';
import { t } from '../../i18n';
import { GrowthDriver } from './shared';
import type { CompanyModel } from './model';

export default function PackagesPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div id="pricing" className="panel panel-tone-blue scroll-mt-6 p-5 lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(vm.locale, 'internetPackages')}
      </h2>
      <p className="mb-4 text-[11px] text-white/40">{t(vm.locale, 'internetPackagesBlurb')}</p>

      <div
        className="mb-4 rounded-lg border border-neon-cyan/20 bg-neon-cyan/[0.035] p-3"
        aria-label="Customer growth drivers"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] pb-3">
          <div>
            <div className="stat-label text-neon-cyan">{t(vm.locale, 'subscriberMomentum')}</div>
            <div className="mt-0.5 text-[10px] text-white/40">{t(vm.locale, 'subscriberMomentumBlurb')}</div>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <div className="stat-label">Last 24h</div>
              <div
                className={`num text-lg font-semibold ${vm.customerNet24h === null ? 'text-white/45' : vm.customerNet24h >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}
              >
                {vm.customerNet24h === null
                  ? '—'
                  : `${vm.customerNet24h >= 0 ? '+' : ''}${Math.round(vm.customerNet24h)}`}
              </div>
            </div>
            <div>
              <div className="stat-label">{t(vm.locale, 'currentPace')}</div>
              <div
                className={`num text-lg font-semibold ${vm.projectedDailyNet >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}
              >
                {vm.projectedDailyNet >= 0 ? '+' : ''}
                {Math.round(vm.projectedDailyNet)}/day
              </div>
            </div>
            <div>
              <div className="stat-label">{t(vm.locale, 'targetShare')}</div>
              <div className="num text-lg font-semibold text-neon-cyan">{Math.round(vm.averageTargetShare * 100)}%</div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <GrowthDriver
            label="Price pull"
            value={`${vm.averagePriceEffect.toFixed(2)}×`}
            fill={(vm.averagePriceEffect / 1.25) * 100}
            tone={vm.averagePriceEffect >= 1 ? '#76b98a' : vm.averagePriceEffect >= 0.8 ? '#d2a657' : '#d36e76'}
          />
          <GrowthDriver
            label="Coverage"
            value={`${Math.round(vm.averageCoverage * 100)}%`}
            fill={vm.averageCoverage * 100}
            tone={vm.averageCoverage >= 0.7 ? '#76b98a' : vm.averageCoverage >= 0.45 ? '#d2a657' : '#d36e76'}
          />
          <GrowthDriver
            label="Satisfaction"
            value={`${Math.round(vm.averageSatisfaction)}`}
            fill={vm.averageSatisfaction}
            tone={vm.averageSatisfaction >= 75 ? '#76b98a' : vm.averageSatisfaction >= 62 ? '#d2a657' : '#d36e76'}
          />
          <GrowthDriver
            label="Reputation"
            value={`${Math.round(vm.game.reputation)}`}
            fill={vm.game.reputation}
            tone={vm.game.reputation >= 70 ? '#76b98a' : vm.game.reputation >= 50 ? '#d2a657' : '#d36e76'}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {vm.game.packages
          .filter((p) => p.segment === 'residential')
          .map((p) => {
            const share = vm.mix.find((m) => m.pkg.id === p.id)?.share ?? 0;
            return (
              <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{p.name}</span>
                  <input
                    type="checkbox"
                    aria-label={`${p.name} active`}
                    checked={p.active}
                    onChange={(e) => vm.updatePackage(p.id, { active: e.target.checked })}
                    className="h-4 w-4 accent-[#3ee6d6]"
                  />
                </div>
                <div className="num mt-1 text-xs text-white/45">{p.speedMbps} Mbps</div>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="stat-label">{t(vm.locale, 'price')}</span>
                    <span className="num text-lg font-semibold text-neon-cyan">${p.price}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={`${p.name} monthly price`}
                    min={5}
                    max={140}
                    value={p.price}
                    onChange={(e) => vm.updatePackage(p.id, { price: Number(e.target.value) })}
                    className="mt-1 w-full"
                  />
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-white/45">
                    <span>{t(vm.locale, 'shareOfNewSignups')}</span>
                    <span className="num">{Math.round(share * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div className="h-full rounded-full bg-neon-cyan" animate={{ width: `${share * 100}%` }} />
                  </div>
                  <div className="num mt-1 text-[11px] text-white/40">{fmtNum(p.subscribers)} subscribers</div>
                </div>
              </div>
            );
          })}
      </div>

      {vm.mods.hasMobile && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">{t(vm.locale, 'mobilePlans')}</h3>
          <p className="mb-3 text-[11px] text-white/40">{t(vm.locale, 'mobilePlansBlurb')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {vm.game.packages
              .filter((p) => p.segment === 'mobile')
              .map((p) => {
                const share = vm.mobileMix.find((m) => m.pkg.id === p.id)?.share ?? 0;
                return (
                  <div key={p.id} className="rounded-xl border border-neon-violet/25 bg-neon-violet/[0.06] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{p.name}</span>
                      <input
                        type="checkbox"
                        aria-label={`${p.name} active`}
                        checked={p.active}
                        onChange={(e) => vm.updatePackage(p.id, { active: e.target.checked })}
                        className="h-4 w-4 accent-[#a78bfa]"
                      />
                    </div>
                    <div className="num mt-1 text-xs text-white/45">{p.speedMbps} Mbps</div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="stat-label">{t(vm.locale, 'price')}</span>
                      <span className="num text-lg font-semibold text-neon-violet">${p.price}</span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${p.name} monthly price`}
                      min={4}
                      max={90}
                      value={p.price}
                      onChange={(e) => vm.updatePackage(p.id, { price: Number(e.target.value) })}
                      className="mt-1 w-full"
                    />
                    <div className="num mt-2 flex justify-between text-[11px] text-white/40">
                      <span>{Math.round(share * 100)}% of sign-ups</span>
                      <span>{fmtNum(p.subscribers)} vm.subs</span>
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
            <h3 className="text-sm font-semibold">{t(vm.locale, 'marketingBudget')}</h3>
            <p className="text-[11px] text-white/40">{t(vm.locale, 'marketingBudgetBlurb')}</p>
          </div>
          <span className="num text-lg font-semibold text-neon-cyan">{fmtMoney(vm.game.marketingBudget)}/mo</span>
        </div>
        <input
          type="range"
          aria-label="Monthly marketing budget"
          min={0}
          max={40000}
          step={500}
          value={vm.game.marketingBudget}
          onChange={(e) => vm.setMarketing(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-sm font-semibold">{t(vm.locale, 'retentionBudget')}</h3>
            <p className="text-[11px] text-white/40">{t(vm.locale, 'retentionBudgetBlurb')}</p>
          </div>
          <span className="num text-lg font-semibold text-neon-violet">{fmtMoney(vm.game.retentionBudget)}/mo</span>
        </div>
        <input
          type="range"
          aria-label="Monthly retention budget"
          min={0}
          max={30000}
          step={500}
          value={vm.game.retentionBudget}
          onChange={(e) => vm.setRetention(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>
    </div>
  );
}
