import { motion } from 'framer-motion';
import { averagePrice, fmtMoney, fmtMoneyExact, fmtNum } from '../../../game/economy';
import { t } from '../../i18n';
import { ProfitBridge } from './shared';
import type { CompanyModel } from './model';

export default function StandingPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel p-5 lg:col-span-3">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <div className="stat-label">{t(vm.locale, 'cash')}</div>
          <div className={`num text-2xl font-semibold ${vm.game.money < 0 ? 'text-neon-red' : 'text-neon-cyan'}`}>
            {fmtMoney(vm.game.money)}
          </div>
        </div>
        <div>
          <div className="stat-label">{t(vm.locale, 'operatingProfit')}</div>
          <div className={`num text-2xl font-semibold ${vm.money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
            {vm.money.profit >= 0 ? '+' : ''}
            {fmtMoney(vm.money.profit)}
          </div>
        </div>
        <div>
          <div className="stat-label">{t(vm.locale, 'freeCashFlowMtd')}</div>
          <div
            className={`num text-2xl font-semibold ${vm.cashFlow.freeCashFlow >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}
          >
            {vm.cashFlow.freeCashFlow >= 0 ? '+' : ''}
            {fmtMoney(vm.cashFlow.freeCashFlow)}
          </div>
        </div>
        <div>
          <div className="stat-label">{t(vm.locale, 'fixedLines')}</div>
          <div className="num text-2xl font-semibold">{fmtNum(vm.subs)}</div>
        </div>
        <div>
          <div className="stat-label">{t(vm.locale, 'contracts')}</div>
          <div className="num text-2xl font-semibold">{vm.game.contracts.length}</div>
        </div>
        <div>
          <div className="stat-label">ARPU</div>
          <div className="num text-2xl font-semibold">{fmtMoneyExact(averagePrice(vm.game.packages))}</div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex justify-between">
            <span className="stat-label text-neon-lime">{t(vm.locale, 'monthlyRevenue')}</span>
            <span className="num text-[12px] text-neon-lime">{fmtMoney(vm.money.totalRevenue)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-neon-lime/80"
              animate={{
                width: `${(vm.money.totalRevenue / Math.max(1, vm.money.totalRevenue, vm.money.totalCost)) * 100}%`,
              }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between">
            <span className="stat-label text-neon-red">{t(vm.locale, 'operatingCost')}</span>
            <span className="num text-[12px] text-neon-red">{fmtMoney(vm.money.totalCost)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-neon-amber/80"
              animate={{
                width: `${(vm.money.totalCost / Math.max(1, vm.money.totalRevenue, vm.money.totalCost)) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
      <ProfitBridge money={vm.money} />
    </div>
  );
}
