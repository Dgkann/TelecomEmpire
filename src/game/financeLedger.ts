import type { MonthlyBreakdown } from './economy';
import { MINUTES_PER_MONTH } from './constants';
import type { FinanceCategory, GameState } from './types';
import { line } from './lang';

const OPERATING_CATEGORIES = new Set<FinanceCategory>([
  'residential',
  'mobile',
  'business',
  'enterprise',
  'hosting',
  'wholesale',
  'salaries',
  'power',
  'maintenance',
  'transit',
  'marketing',
  'retention',
  'sla_penalty',
]);

const CAPITAL_CATEGORIES = new Set<FinanceCategory>([
  'company_acquisition',
  'network_build',
  'network_upgrade',
  'district_licence',
  'research',
  'spectrum',
]);

const FINANCING_CATEGORIES = new Set<FinanceCategory>(['loan_draw', 'loan_payment']);

export interface CashFlowSummary {
  operatingCash: number;
  capitalSpend: number;
  otherOneOffNet: number;
  freeCashFlow: number;
  financing: number;
  netCashMovement: number;
}

export function currentMonthCashFlow(state: GameState): CashFlowSummary {
  const monthStart = Math.floor(state.minutes / MINUTES_PER_MONTH) * MINUTES_PER_MONTH;
  const entries = state.ledger.filter((entry) => entry.at >= monthStart);
  const capitalSpend = -entries
    .filter((entry) => CAPITAL_CATEGORIES.has(entry.category) && entry.amount < 0)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const otherOneOffNet = entries
    .filter(
      (entry) =>
        !OPERATING_CATEGORIES.has(entry.category) &&
        !CAPITAL_CATEGORIES.has(entry.category) &&
        !FINANCING_CATEGORIES.has(entry.category),
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const financing = entries
    .filter((entry) => FINANCING_CATEGORIES.has(entry.category))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const operatingCash = state.monthAccumulator.revenue - state.monthAccumulator.expense - state.finance.penalties;
  const freeCashFlow = operatingCash - capitalSpend + otherOneOffNet;
  return {
    operatingCash,
    capitalSpend,
    otherOneOffNet,
    freeCashFlow,
    financing,
    netCashMovement: freeCashFlow + financing,
  };
}

export function recordLedger(state: GameState, category: FinanceCategory, label: string, amount: number) {
  if (!Number.isFinite(amount) || Math.abs(amount) < 0.005) return;
  const sameMoment = state.ledger.filter((entry) => entry.at === state.minutes).length;
  const entry = {
    id: `fin_${Math.round(state.minutes)}_${sameMoment}_${category}`,
    at: state.minutes,
    category,
    label,
    amount,
  };
  state.ledger = [entry, ...state.ledger].slice(0, 360);
}

export function recordOperatingMonth(
  state: GameState,
  breakdown: MonthlyBreakdown,
  actualRevenue: number,
  actualExpense: number,
  penalties: number,
  loanPayments: number,
) {
  const revenues: Array<[FinanceCategory, string, number]> = [
    ['residential', line('Residential service', 'Konut hizmeti'), breakdown.revenueResidential],
    ['mobile', line('Mobile service', 'Mobil hizmet'), breakdown.revenueMobile],
    ['business', line('Business contracts', 'Kurumsal sözleşmeler'), breakdown.revenueBusiness],
    ['enterprise', line('Enterprise contracts', 'Büyük kurumsal sözleşmeler'), breakdown.revenueEnterprise],
    ['hosting', line('Hosting and edge services', 'Barındırma ve uç hizmetler'), breakdown.revenueHosting],
    ['wholesale', line('Wholesale access', 'Toptan erişim'), breakdown.revenueWholesale],
  ];
  const costs: Array<[FinanceCategory, string, number]> = [
    ['salaries', line('Staff salaries', 'Personel maaşları'), breakdown.costSalaries],
    ['power', line('Electricity', 'Elektrik'), breakdown.costPower],
    ['maintenance', line('Network maintenance', 'Şebeke bakımı'), breakdown.costMaintenance],
    ['transit', line('Upstream transit', 'Üst bağlantı transiti'), breakdown.costTransit],
    ['marketing', line('Marketing', 'Pazarlama'), breakdown.costMarketing],
    ['retention', line('Customer retention', 'Müşteri elde tutma'), breakdown.costRetention],
  ];
  const revenueScale = breakdown.totalRevenue > 0 ? actualRevenue / breakdown.totalRevenue : 0;
  const costScale = breakdown.totalCost > 0 ? actualExpense / breakdown.totalCost : 0;
  for (const [category, label, amount] of revenues) recordLedger(state, category, label, amount * revenueScale);
  for (const [category, label, amount] of costs) recordLedger(state, category, label, -amount * costScale);
  recordLedger(state, 'sla_penalty', line('SLA penalties', 'SLA cezaları'), -penalties);
  recordLedger(state, 'loan_payment', line('Loan repayments', 'Kredi ödemeleri'), -loanPayments);
}
