import { MINUTES_PER_DAY, MINUTES_PER_MONTH } from './constants';
import { monthlyBreakdown } from './economy';
import { monthlyDebtService } from './finance';
import { customerCount } from './progression';
import { researchModifiers } from './research';
import { staffModifiers } from './staff';
import type { GameState } from './types';

// A current-conditions estimate, not a promise or a spending authorization.
// Investment, fines, new customers and optional rewards are deliberately excluded.
export function goalTiming(state: GameState, cost: number, points = 0, needsLab = true) {
  const staff = staffModifiers(state);
  const money = monthlyBreakdown(state, researchModifiers(state.researchDone));
  const monthlyCash =
    money.totalRevenue * (1 - state.stats.packetLoss * 0.25) - money.totalCost - monthlyDebtService(state);
  const cashMissing = Math.max(0, cost - state.money);
  const pointsMissing = Math.max(0, points - state.researchPoints);
  const pointsPerDay = staff.researchPointsPerDay + Math.max(0, Math.round(Math.round(customerCount(state)) / 2500));
  const cashDays =
    cashMissing === 0
      ? 0
      : monthlyCash > 0
        ? Math.ceil(cashMissing / (monthlyCash / (MINUTES_PER_MONTH / MINUTES_PER_DAY)))
        : null;
  const pointsDays = pointsMissing === 0 ? 0 : pointsPerDay > 0 ? Math.ceil(pointsMissing / pointsPerDay) : null;
  const activeDays = state.researchActive ? Math.ceil(state.researchActive.daysLeft / staff.researchSpeedMul) : 0;
  return {
    monthlyCash,
    cashMissing,
    pointsMissing,
    pointsPerDay,
    cashDays,
    pointsDays,
    activeDays,
    readyInDays:
      cashDays === null || pointsDays === null ? null : Math.max(cashDays, pointsDays, needsLab ? activeDays : 0),
  };
}
