import {
  ENERGY,
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  NODE_SPECS,
  POWER_COST_PER_KW_MONTH,
  nodePowerScale,
} from './constants';
import { recordLedger } from './financeLedger';
import type { EnergyPlan, EnergyState, GameState, NetNode } from './types';
import type { Rng } from './rng';
import { clamp } from './util';

export const ENERGY_PLANS = {
  spot: {
    title: 'Spot tariff',
    titleTr: 'Serbest tarife',
    detail: 'You pay whatever the wholesale market charges this month.',
    detailTr: 'Her ay toptan piyasanın istediği fiyatı ödersin.',
    tradeoff: 'Cheapest on average, and the only plan that can double overnight.',
    tradeoffTr: 'Ortalamada en ucuzu, ama bir gecede ikiye katlanabilen tek tarife.',
  },
  fixed: {
    title: 'Fixed contract',
    titleTr: 'Sabit sözleşme',
    detail: 'Locks this month rate for a year at a premium.',
    detailTr: 'Bu ayki fiyatı bir yıllığına primli olarak sabitler.',
    tradeoff: 'Insurance against a spike. You keep paying it through a cheap year too.',
    tradeoffTr: 'Zamma karşı sigorta. Ucuz geçen yılda da aynı fiyatı ödersin.',
  },
  green: {
    title: 'Certified renewable',
    titleTr: 'Yeşil enerji',
    detail: 'Costs more per kW and is never charged the carbon levy.',
    detailTr: 'kW başına daha pahalı, ama karbon vergisi hiç uygulanmaz.',
    tradeoff: 'Slowly builds reputation. The premium applies every single month.',
    tradeoffTr: 'İtibarı yavaşça yükseltir. Prim her ay ödenir.',
  },
} as const;

export function initialEnergy(minutes: number): EnergyState {
  return {
    plan: 'spot',
    spotIndex: 1,
    history: [1],
    fixedUntil: null,
    fixedIndex: 1,
    solarNodeIds: [],
    nextLevyAt: minutes + ENERGY.levyIntervalDays * MINUTES_PER_DAY,
    leviesPaid: 0,
  };
}

// Winter heating and summer cooling both lift wholesale power. Month 0 is January.
function seasonalBias(minutes: number) {
  const month = Math.floor(minutes / MINUTES_PER_MONTH) % 12;
  return ENERGY.seasonalAmplitude * Math.cos((month / 12) * Math.PI * 4);
}

// A mean-reverting walk: it wanders, but never far from the reference tariff for long.
export function nextSpotIndex(state: GameState, rng: Rng) {
  const pull = (1 - state.energy.spotIndex) * ENERGY.meanReversion;
  const shock = (rng() - 0.5) * 2 * ENERGY.monthlyVolatility;
  return clamp(
    state.energy.spotIndex + pull + shock + seasonalBias(state.minutes),
    ENERGY.spotFloor,
    ENERGY.spotCeiling,
  );
}

// What one kW actually costs this month, as a multiple of the reference tariff.
export function energyPriceIndex(s: GameState) {
  const e = s.energy;
  if (e.plan === 'green') return e.spotIndex * ENERGY.greenPremium;
  if (e.plan === 'fixed' && e.fixedUntil !== null && s.minutes < e.fixedUntil)
    return e.fixedIndex * ENERGY.fixedPremium;
  return e.spotIndex;
}

export const hasSolar = (s: GameState, nodeId: string) => s.energy.solarNodeIds.includes(nodeId);

// Draw after on-site generation. Tier raises consumption the same way it raises capacity.
export function siteDrawKw(s: GameState, node: NetNode, modePower = 1) {
  const base = NODE_SPECS[node.kind].powerKw * nodePowerScale(node.kind, node.tier) * modePower;
  return hasSolar(s, node.id) ? base * (1 - ENERGY.solarDrawCut) : base;
}

export function solarCost(s: GameState, nodeId: string) {
  const node = s.nodes.find((n) => n.id === nodeId);
  if (!node) return 0;
  const kw = NODE_SPECS[node.kind].powerKw * nodePowerScale(node.kind, node.tier);
  return Math.round((kw * ENERGY.solarCostPerKw) / 1000) * 1000;
}

export function solarIssue(s: GameState, nodeId: string, hasResearch: boolean, locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  if (s.gameOver) return tr ? 'Bu şirket kapandı.' : 'This company has closed.';
  if (!hasResearch)
    return tr ? 'Önce Saha Üstü Üretim araştırmasını tamamla.' : 'Finish the On-site Generation research first.';
  const node = s.nodes.find((n) => n.id === nodeId);
  if (!node) return tr ? 'Bu nokta bulunamadı.' : 'That site no longer exists.';
  if (hasSolar(s, nodeId)) return tr ? 'Bu noktada zaten üretim var.' : 'This site already generates its own power.';
  if (s.money < solarCost(s, nodeId))
    return tr ? 'Kurulum için nakit yetersiz.' : 'Not enough cash for the installation.';
  return null;
}

export function buildSolar(state: GameState, nodeId: string, hasResearch: boolean): GameState | null {
  if (solarIssue(state, nodeId, hasResearch)) return null;
  const cost = solarCost(state, nodeId);
  const next: GameState = {
    ...state,
    money: state.money - cost,
    energy: { ...state.energy, solarNodeIds: [...state.energy.solarNodeIds, nodeId] },
  };
  const node = next.nodes.find((n) => n.id === nodeId);
  recordLedger(next, 'network_build', `On-site generation: ${node?.name ?? nodeId}`, -cost);
  return next;
}

export function planIssue(s: GameState, plan: EnergyPlan, locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  if (s.gameOver) return tr ? 'Bu şirket kapandı.' : 'This company has closed.';
  if (plan === s.energy.plan) return tr ? 'Bu tarife zaten yürürlükte.' : 'That tariff is already running.';
  const exit = fixedExitFee(s);
  if (exit > 0 && s.money < exit)
    return tr ? 'Sözleşmeyi bozma bedeli için nakit yetersiz.' : 'Not enough cash for the contract exit fee.';
  return null;
}

// Leaving a fixed contract early is charged as a couple of months of power.
export function fixedExitFee(s: GameState) {
  const e = s.energy;
  if (e.plan !== 'fixed' || e.fixedUntil === null || s.minutes >= e.fixedUntil) return 0;
  return Math.round(monthlyPowerBill(s) * ENERGY.fixedExitMonths);
}

// Power spend at the current draw and tariff, used for previews and the exit fee.
export function monthlyPowerBill(s: GameState, modePowerOf: (n: NetNode) => number = () => 1) {
  const kw = s.nodes.reduce((sum, n) => sum + siteDrawKw(s, n, modePowerOf(n)), 0);
  return kw * POWER_COST_PER_KW_MONTH * energyPriceIndex(s);
}

export function setEnergyPlan(state: GameState, plan: EnergyPlan): GameState | null {
  if (planIssue(state, plan)) return null;
  const exit = fixedExitFee(state);
  const next: GameState = {
    ...state,
    money: state.money - exit,
    energy: {
      ...state.energy,
      plan,
      fixedUntil: plan === 'fixed' ? state.minutes + ENERGY.fixedTermMonths * MINUTES_PER_MONTH : null,
      fixedIndex: plan === 'fixed' ? state.energy.spotIndex : state.energy.fixedIndex,
    },
  };
  if (exit > 0) recordLedger(next, 'power', 'Energy contract exit fee', -exit);
  return next;
}

export interface EnergyEvent {
  kind: 'spot' | 'levy';
  text: string;
  textTr: string;
  tone: 'good' | 'bad' | 'info';
}

export const carbonLevy = (totalKw: number, plan: EnergyPlan) =>
  plan === 'green' ? 0 : Math.round((totalKw * ENERGY.levyPerKw) / 1000) * 1000;

// Rolls the wholesale price and settles any carbon levy. Called once per game month.
export function tickEnergyMonth(s: GameState, rng: Rng, totalKw: number): EnergyEvent[] {
  const events: EnergyEvent[] = [];
  const previous = s.energy.spotIndex;
  const spotIndex = nextSpotIndex(s, rng);
  s.energy = { ...s.energy, spotIndex, history: [...s.energy.history, spotIndex].slice(-24) };

  if (s.energy.plan === 'spot' && spotIndex > previous * 1.25) {
    events.push({
      kind: 'spot',
      text: `Wholesale power jumped ${Math.round((spotIndex / previous - 1) * 100)}% this month.`,
      textTr: `Toptan elektrik bu ay %${Math.round((spotIndex / previous - 1) * 100)} zamlandı.`,
      tone: 'bad',
    });
  }

  if (s.energy.plan === 'fixed' && s.energy.fixedUntil !== null && s.minutes >= s.energy.fixedUntil) {
    s.energy = { ...s.energy, plan: 'spot', fixedUntil: null };
    events.push({
      kind: 'spot',
      text: 'Your fixed power contract expired. You are back on the spot tariff.',
      textTr: 'Sabit elektrik sözleşmen sona erdi. Serbest tarifeye döndün.',
      tone: 'info',
    });
  }

  if (s.minutes >= s.energy.nextLevyAt) {
    s.energy = { ...s.energy, nextLevyAt: s.minutes + ENERGY.levyIntervalDays * MINUTES_PER_DAY };
    if (s.energy.plan !== 'green' && totalKw > 0) {
      const levy = carbonLevy(totalKw, s.energy.plan);
      s.money -= levy;
      s.energy = { ...s.energy, leviesPaid: s.energy.leviesPaid + levy };
      recordLedger(s, 'regulatory_fine', 'Carbon levy on network power', -levy);
      events.push({
        kind: 'levy',
        text: `Carbon levy charged on ${Math.round(totalKw)} kW of network draw.`,
        textTr: `${Math.round(totalKw)} kW şebeke tüketimi üzerinden karbon vergisi alındı.`,
        tone: 'bad',
      });
    }
  }
  return events;
}
