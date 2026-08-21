import { DIFFICULTY, MINUTES_PER_DAY, NODE_SPECS } from './constants';
import { monthlyBreakdown } from './economy';
import { rankOf } from './progression';
import { researchModifiers } from './research';
import { uid } from './rng';
import { clamp } from './util';
import type { GameState, Loan } from './types';

// Debt turns cash from a score into a constraint.

// How long you may sit past the credit limit before the banks pull the plug.
export const GRACE_DAYS = 45;

const RATES: Record<keyof typeof DIFFICULTY, number> = {
  casual: 0.06,
  standard: 0.09,
  hard: 0.13,
};

// What your network would fetch if it were sold off.
export function assetValue(s: GameState) {
  const nodes = s.nodes.reduce((sum, n) => sum + NODE_SPECS[n.kind].baseCost * n.tier * 0.45, 0);
  const links = s.links.reduce((sum, l) => sum + l.length * 1400 * l.tier * 0.3, 0);
  const spectrum = s.spectrum.reduce((sum, h) => sum + h.paid * 0.5, 0);
  return nodes + links + spectrum;
}

// Lenders look at what you earn and what you own, minus what you already owe.
export function creditLimit(s: GameState) {
  const money = monthlyBreakdown(s, researchModifiers(s.researchDone));
  const owed = s.loans.reduce((sum, l) => sum + l.remaining, 0);
  const raw = (money.totalRevenue * 5 + assetValue(s) * 0.4) * rankOf(s).creditMultiplier;
  // Apply the facility floor before subtracting debt so it cannot become renewable headroom.
  const facility = Math.max(40000, Math.round(raw));
  return Math.max(0, Math.round(facility - owed));
}

export const totalDebt = (s: GameState) => s.loans.reduce((sum, l) => sum + l.remaining, 0);

export function monthlyDebtService(s: GameState) {
  return s.loans.reduce((sum, l) => sum + l.monthlyPayment, 0);
}

export function loanRate(s: GameState) {
  const base = RATES[s.difficulty];
  // A shaky operator borrows on worse terms.
  return base + clamp((60 - s.reputation) / 100, -0.02, 0.05);
}

export function createLoan(s: GameState, principal: number, termMonths: number): Loan {
  const rate = loanRate(s);
  const monthlyRate = rate / 12;
  // Standard amortisation, so the payment covers interest and capital.
  const payment =
    monthlyRate > 0
      ? (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
      : principal / termMonths;
  return {
    id: uid('loan'),
    principal,
    remaining: principal,
    rateAnnual: rate,
    monthlyPayment: Math.round(payment),
    termMonths,
    takenAt: s.minutes,
  };
}

// Charged once a month alongside the other bills.
export function chargeLoans(s: GameState) {
  if (!s.loans.length) return 0;
  let paid = 0;
  const remaining: Loan[] = [];
  for (const loan of s.loans) {
    const interest = loan.remaining * (loan.rateAnnual / 12);
    const due = Math.min(loan.monthlyPayment, loan.remaining + interest);
    const principalPart = due - interest;
    paid += due;
    const left = Math.max(0, loan.remaining - principalPart);
    if (left > 1) remaining.push({ ...loan, remaining: left });
  }
  s.loans = remaining;
  s.money -= paid;
  return paid;
}

// Called every step. Returns a game over reason once the grace period runs out.
export function checkSolvency(s: GameState): string | null {
  const limit = creditLimit(s);
  if (s.money >= -limit) {
    s.insolventSince = null;
    return null;
  }
  if (s.insolventSince === null) {
    s.insolventSince = s.minutes;
    return null;
  }
  const days = (s.minutes - s.insolventSince) / MINUTES_PER_DAY;
  if (days < GRACE_DAYS) return null;
  return `Your lenders called in the debt after ${GRACE_DAYS} days past the credit limit.`;
}

export function daysUntilInsolvency(s: GameState) {
  if (s.insolventSince === null) return null;
  return Math.max(0, GRACE_DAYS - (s.minutes - s.insolventSince) / MINUTES_PER_DAY);
}
