import { ENERGY, MINUTES_PER_DAY, MINUTES_PER_MONTH, POWER_COST_PER_KW_MONTH } from './constants';
import {
  carbonLevy,
  energyPriceIndex,
  fixedExitFee,
  hasSolar,
  monthlyPowerBill,
  siteDrawKw,
  solarCost,
} from './energy';
import { DATA_CENTER_MODE_CONFIG, dataCenterMode } from './strategy';
import type { EnergyPlan, GameState, NetNode } from './types';

const modePower = (s: GameState, node: NetNode) =>
  node.kind === 'datacenter' ? DATA_CENTER_MODE_CONFIG[dataCenterMode(s, node.id)].powerMultiplier : 1;

export const operatingPowerBill = (s: GameState) => monthlyPowerBill(s, (node) => modePower(s, node));

export function levyOutlook(s: GameState) {
  const draw = s.nodes.reduce((sum, node) => sum + siteDrawKw(s, node, modePower(s, node)), 0);
  // Levies are settled only at month boundaries, including when an old due date has passed.
  const at = Math.max(
    (Math.floor(s.minutes / MINUTES_PER_MONTH) + 1) * MINUTES_PER_MONTH,
    Math.ceil(s.energy.nextLevyAt / MINUTES_PER_MONTH) * MINUTES_PER_MONTH,
  );
  return { amount: carbonLevy(draw, s.energy.plan), at, days: Math.ceil((at - s.minutes) / MINUTES_PER_DAY) };
}

export function tariffQuote(s: GameState, plan: EnergyPlan) {
  const active = plan === s.energy.plan;
  const projected: GameState = active
    ? s
    : {
        ...s,
        energy: {
          ...s.energy,
          plan,
          fixedIndex: s.energy.spotIndex,
          fixedUntil: plan === 'fixed' ? s.minutes + ENERGY.fixedTermMonths * MINUTES_PER_MONTH : null,
        },
      };
  const monthly = operatingPowerBill(projected);
  const exitFee = active ? 0 : fixedExitFee(s);
  return {
    monthly,
    monthlySaving: operatingPowerBill(s) - monthly,
    exitFee,
    cashAfter: s.money - exitFee,
    levy: levyOutlook(projected).amount,
  };
}

export function solarQuote(s: GameState, nodeId: string) {
  const node = s.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;
  const fitted = hasSolar(s, nodeId);
  const cost = solarCost(s, nodeId);
  const draw = siteDrawKw(s, node, modePower(s, node));
  const savedKw = fitted ? (draw * ENERGY.solarDrawCut) / (1 - ENERGY.solarDrawCut) : draw * ENERGY.solarDrawCut;
  const monthlySaving = savedKw * POWER_COST_PER_KW_MONTH * energyPriceIndex(s);
  return {
    fitted,
    cost,
    monthlySaving,
    paybackMonths: monthlySaving > 0 ? cost / monthlySaving : null,
    cashAfter: s.money - (fitted ? 0 : cost),
  };
}
