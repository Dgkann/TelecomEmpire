import { makeRng } from './rng';
import { staffModifiers } from './staff';
import { clamp } from './util';
import type { BuildingKind, ContractOffer, GameState } from './types';

export type NegotiationMode = 'standard' | 'flexible' | 'premium';

export interface NegotiationResult {
  accepted: boolean;
  chance: number;
  terms: ContractOffer;
}

export interface ContractProfile {
  label: string;
  bandwidthMul: number;
  revenueMul: number;
  slaFloor: number;
  requiresRedundancy: boolean;
}

const PROFILES: Record<BuildingKind, ContractProfile> = {
  house: { label: 'Managed property network', bandwidthMul: 0.6, revenueMul: 0.85, slaFloor: 99, requiresRedundancy: false },
  apartment: { label: 'Residential estate backhaul', bandwidthMul: 0.8, revenueMul: 0.9, slaFloor: 99, requiresRedundancy: false },
  office: { label: 'Cloud office WAN', bandwidthMul: 1, revenueMul: 1, slaFloor: 99.5, requiresRedundancy: false },
  shop: { label: 'Retail payment network', bandwidthMul: 0.7, revenueMul: 1.1, slaFloor: 99.9, requiresRedundancy: false },
  industrial: { label: 'Industrial telemetry link', bandwidthMul: 1.45, revenueMul: 1.2, slaFloor: 99.9, requiresRedundancy: true },
  hospital: { label: 'Critical care network', bandwidthMul: 1.1, revenueMul: 1.4, slaFloor: 99.99, requiresRedundancy: true },
  university: { label: 'Campus research backbone', bandwidthMul: 1.3, revenueMul: 1.15, slaFloor: 99.9, requiresRedundancy: true },
  park: { label: 'Public venue Wi-Fi', bandwidthMul: 0.5, revenueMul: 0.7, slaFloor: 99, requiresRedundancy: false },
};

export const contractProfile = (kind: BuildingKind) => PROFILES[kind];

const roundMoney = (value: number) => Math.max(0, Math.round(value / 50) * 50);

// Counters settle immediately.
export function negotiatedTerms(offer: ContractOffer, mode: NegotiationMode): ContractOffer {
  if (mode === 'flexible') {
    // Twice the monthly downtime allowance in exchange for a 15% lower fee.
    const slaPercent = clamp(Math.round((100 - (100 - offer.slaPercent) * 2) * 1000) / 1000, 95, 100);
    return {
      ...offer,
      monthlyRevenue: roundMoney(offer.monthlyRevenue * 0.85),
      signingBonus: roundMoney(offer.signingBonus * 0.85),
      slaPercent,
    };
  }

  if (mode === 'premium') {
    return {
      ...offer,
      monthlyRevenue: roundMoney(offer.monthlyRevenue * 1.2),
      // The customer will entertain a higher recurring fee, but not the full introductory sweetener as well.
      signingBonus: roundMoney(offer.signingBonus * 0.5),
    };
  }

  return { ...offer };
}

export function premiumCounterChance(state: GameState, offer: ContractOffer) {
  const district = state.districts.find((entry) => entry.id === offer.districtId);
  const strongestRivalShare = state.competitors.reduce(
    (highest, competitor) => Math.max(highest, competitor.share[offer.districtId] ?? 0),
    0,
  );
  const salesBoost = clamp((staffModifiers(state).offerRateMul - 1) * 0.5, 0, 0.18);
  const reputationBoost = (state.reputation - 50) * 0.004;
  const satisfactionBoost = ((district?.satisfaction ?? 70) - 70) * 0.002;
  const enterprisePenalty = offer.segment === 'enterprise' ? 0.06 : 0;

  return clamp(
    0.58 + reputationBoost + satisfactionBoost + salesBoost - strongestRivalShare * 0.15 - enterprisePenalty,
    0.25,
    0.9,
  );
}

function negotiationRoll(state: GameState, offer: ContractOffer, mode: NegotiationMode) {
  let hash = (2166136261 ^ state.rngSeed) >>> 0;
  const key = `${offer.id}:${mode}:${offer.monthlyRevenue}:${offer.termMonths}`;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return makeRng(hash)();
}

export function resolveNegotiation(
  state: GameState,
  offer: ContractOffer,
  mode: NegotiationMode,
): NegotiationResult {
  const terms = negotiatedTerms(offer, mode);
  const chance = mode === 'premium' ? premiumCounterChance(state, offer) : 1;
  return {
    terms,
    chance,
    accepted: mode !== 'premium' || negotiationRoll(state, offer, mode) < chance,
  };
}
