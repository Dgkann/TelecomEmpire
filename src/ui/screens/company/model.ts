import { useState } from 'react';
import { monthlyBreakdown, packageMix } from '../../../game/economy';
import { researchModifiers } from '../../../game/research';
import { creditLimit, daysUntilInsolvency, loanRate, totalDebt } from '../../../game/finance';
import { currentMonthCashFlow } from '../../../game/financeLedger';
import { customerGrowthSnapshot, residentialSubs, totalCustomers } from '../../../game/simulation';
import { staffModifiers } from '../../../game/staff';
import { wholesaleRevenue } from '../../../game/strategy';
import { useGame } from '../../../store/gameStore';

// Everything the company panels read, derived once per render of the screen.
export function useCompanyModel() {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
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
  const fixedWholesalePotential = wholesaleRevenue({ ...game, wholesaleFixed: true, mvnoEnabled: false });
  const mvnoPotential = wholesaleRevenue({ ...game, wholesaleFixed: false, mvnoEnabled: true });
  const growthDistricts = game.districts.filter((district) => district.unlocked && district.coverage > 0.001);
  const growthProfiles = growthDistricts.map((district) => ({
    district,
    snapshot: customerGrowthSnapshot(game, district),
  }));
  const growthWeight = growthProfiles.reduce((sum, entry) => sum + entry.district.potential, 0) || 1;
  const weightedGrowth = (value: (entry: (typeof growthProfiles)[number]) => number) =>
    growthProfiles.reduce((sum, entry) => sum + value(entry) * entry.district.potential, 0) / growthWeight;
  const averageCoverage = weightedGrowth((entry) => entry.district.coverage);
  const averageSatisfaction = weightedGrowth((entry) => entry.district.satisfaction);
  const averageTargetShare = weightedGrowth((entry) => entry.snapshot.targetShare);
  const averagePriceEffect = weightedGrowth((entry) => entry.snapshot.priceMultiplier);
  const projectedDailyNet = growthProfiles.reduce((sum, entry) => sum + entry.snapshot.projectedDailyDelta, 0);
  const netWindowStart =
    [...game.telemetry].reverse().find((point) => point.at <= game.minutes - 1440) ?? game.telemetry[0];
  const customerNet24h = netWindowStart ? totalCustomers(game) - netWindowStart.customers : null;

  return {
    game,
    locale,
    updatePackage,
    setMarketing,
    setRetention,
    toggleWholesaleFixed,
    toggleMvno,
    hireTechnician,
    hireEmployee,
    fireStaff,
    takeLoan,
    repayLoan,
    focus,
    select,
    setScreen,
    setOverlay,
    mods,
    staff,
    money,
    cashFlow,
    mix,
    mobileMix,
    subs,
    headroom,
    debt,
    graceLeft,
    borrowAmount,
    setBorrowAmount,
    estimatedPayment,
    fixedWholesalePotential,
    mvnoPotential,
    growthProfiles,
    averageCoverage,
    averageSatisfaction,
    averageTargetShare,
    averagePriceEffect,
    projectedDailyNet,
    customerNet24h,
  };
}

export type CompanyModel = ReturnType<typeof useCompanyModel>;
