import { fmtMoney, fmtMoneyExact, fmtNum } from '../../../game/economy';
import { t } from '../../i18n';
import TrendChart from '../../TrendChart';
import { Row } from './shared';
import type { CompanyModel } from './model';

export default function FinancesPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel panel-tone-green p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(vm.locale, 'monthlyOperatingFinances')}
      </h2>
      <div className="divide-y divide-white/5">
        <div className="pb-2">
          <div className="stat-label mb-1">{t(vm.locale, 'income')}</div>
          <Row label="Residential" value={fmtMoneyExact(vm.money.revenueResidential)} tone="text-neon-lime" />
          {vm.money.revenueMobile > 0 && (
            <Row label="Mobile" value={fmtMoneyExact(vm.money.revenueMobile)} tone="text-neon-lime" />
          )}
          {vm.money.revenueHosting > 0 && (
            <Row label="Hosting" value={fmtMoneyExact(vm.money.revenueHosting)} tone="text-neon-lime" />
          )}
          {vm.money.revenueWholesale > 0 && (
            <Row label="Wholesale" value={fmtMoneyExact(vm.money.revenueWholesale)} tone="text-neon-lime" />
          )}
          <Row label="Business" value={fmtMoneyExact(vm.money.revenueBusiness)} tone="text-neon-lime" />
          <Row label="Enterprise" value={fmtMoneyExact(vm.money.revenueEnterprise)} tone="text-neon-lime" />
        </div>
        <div className="py-2">
          <div className="stat-label mb-1">{t(vm.locale, 'costs')}</div>
          <Row label="Salaries" value={fmtMoneyExact(-vm.money.costSalaries)} tone="text-white/70" />
          <Row label="Electricity" value={fmtMoneyExact(-vm.money.costPower)} tone="text-white/70" />
          <Row label="Maintenance" value={fmtMoneyExact(-vm.money.costMaintenance)} tone="text-white/70" />
          <Row label="Transit" value={fmtMoneyExact(-vm.money.costTransit)} tone="text-white/70" />
          <Row label="Marketing" value={fmtMoneyExact(-vm.money.costMarketing)} tone="text-white/70" />
          <Row label="Retention" value={fmtMoneyExact(-vm.money.costRetention)} tone="text-white/70" />
          {vm.game.finance.costLoanPayments > 0 && (
            <Row
              label="Last loan payment"
              value={fmtMoneyExact(-vm.game.finance.costLoanPayments)}
              tone="text-white/70"
            />
          )}
          {vm.game.finance.penalties > 0 && (
            <Row label="SLA penalties (MTD)" value={fmtMoneyExact(-vm.game.finance.penalties)} tone="text-neon-red" />
          )}
        </div>
        <div className="pt-2">
          <Row
            label="Operating profit"
            value={`${vm.money.profit >= 0 ? '+' : ''}${fmtMoneyExact(vm.money.profit)}`}
            tone={vm.money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-white/[0.07] pt-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="stat-label">{t(vm.locale, 'cashBridgeMtd')}</div>
            <div className="mt-1 text-[10px] leading-snug text-white/35">{t(vm.locale, 'cashBridgeBlurb')}</div>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-neon-cyan">
            {t(vm.locale, 'actualCash')}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
            <Row
              label="Operating cash MTD"
              value={`${vm.cashFlow.operatingCash >= 0 ? '+' : ''}${fmtMoneyExact(vm.cashFlow.operatingCash)}`}
              tone={vm.cashFlow.operatingCash >= 0 ? 'text-neon-lime' : 'text-neon-red'}
            />
            <Row label="Capital projects MTD" value={fmtMoneyExact(-vm.cashFlow.capitalSpend)} tone="text-neon-amber" />
            <Row
              label="Other one-offs MTD"
              value={`${vm.cashFlow.otherOneOffNet >= 0 ? '+' : ''}${fmtMoneyExact(vm.cashFlow.otherOneOffNet)}`}
              tone={vm.cashFlow.otherOneOffNet >= 0 ? 'text-neon-lime' : 'text-neon-red'}
            />
          </div>
          <div className="rounded-lg border border-neon-cyan/15 bg-neon-cyan/[0.035] p-3">
            <Row
              label="Free cash flow MTD"
              value={`${vm.cashFlow.freeCashFlow >= 0 ? '+' : ''}${fmtMoneyExact(vm.cashFlow.freeCashFlow)}`}
              tone={vm.cashFlow.freeCashFlow >= 0 ? 'text-neon-lime' : 'text-neon-red'}
            />
            <Row
              label="Loan financing MTD"
              value={`${vm.cashFlow.financing >= 0 ? '+' : ''}${fmtMoneyExact(vm.cashFlow.financing)}`}
              tone={vm.cashFlow.financing >= 0 ? 'text-neon-cyan' : 'text-neon-red'}
            />
            <div className="mt-1 border-t border-white/[0.07] pt-1">
              <Row
                label="Net cash movement MTD"
                value={`${vm.cashFlow.netCashMovement >= 0 ? '+' : ''}${fmtMoneyExact(vm.cashFlow.netCashMovement)}`}
                tone={vm.cashFlow.netCashMovement >= 0 ? 'text-neon-lime' : 'text-neon-red'}
              />
            </div>
          </div>
        </div>
      </div>

      {vm.game.history.length > 1 && (
        <div className="mt-4 border-t border-white/[0.07] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="stat-label">{t(vm.locale, 'operatingTrend')}</div>
              <div className="text-[11px] text-white/35">
                Last {Math.min(14, vm.game.history.length)} completed months
              </div>
            </div>
            <span className="font-mono text-[10px] text-white/30">MONTHLY</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
              <TrendChart
                height={86}
                formatValue={fmtMoney}
                series={[
                  { label: 'Revenue ₺', values: vm.game.history.slice(-14).map((h) => h.revenue), color: '#75df9a' },
                  { label: 'Expense ₺', values: vm.game.history.slice(-14).map((h) => h.expense), color: '#ff6577' },
                ]}
              />
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3">
              <TrendChart
                height={86}
                formatValue={fmtNum}
                series={[
                  { label: 'Customers', values: vm.game.history.slice(-14).map((h) => h.customers), color: '#68a5ff' },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
