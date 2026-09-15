import { NODE_SPECS, POWER_COST_PER_KW_MONTH, nodeMaintenanceScale, nodeUpgradeCost } from './constants';
import { monthlyBreakdown, potentialHostingRevenue } from './economy';
import { energyPriceIndex, siteDrawKw } from './energy';
import { monthlyDebtService } from './finance';
import { researchModifiers } from './research';
import { staffModifiers } from './staff';
import { DATA_CENTER_MODE_CONFIG, dataCenterMode, operationalDataCenters } from './strategy';
import type { GameState, NetNode } from './types';

export function dataCenterExpansionBlocker(state: GameState, node: NetNode) {
  if (state.gameOver) return 'closed';
  if (node.tier === 0 && !state.researchDone.includes('edge_compute')) return 'research';
  if (node.down || state.incidents.some((i) => !i.resolved && i.targetType === 'node' && i.targetId === node.id))
    return 'fault';
  if (state.maintenanceOrders.some((o) => o.nodeId === node.id && o.status !== 'completed')) return 'maintenance';
  if (state.money < nodeUpgradeCost('datacenter', node.tier)) return 'funds';
  return null;
}

// Quotes use current demand, workload, connectivity and energy prices. They do
// not assume that expanding a site repairs its connection or removes packet loss.
export function dataCenterOutlook(state: GameState, nodeId: string) {
  const node = state.nodes.find((n) => n.id === nodeId && n.kind === 'datacenter');
  if (!node) return null;
  const connected = operationalDataCenters(state).some((n) => n.id === nodeId);
  const mode = DATA_CENTER_MODE_CONFIG[dataCenterMode(state, nodeId)];
  const mods = researchModifiers(state.researchDone);
  const staff = staffModifiers(state);
  const revenueFactor = 1 - state.stats.packetLoss * 0.25;
  const snapshot = (site: NetNode) => {
    const revenue = connected ? potentialHostingRevenue(state, site) * revenueFactor : 0;
    const power = siteDrawKw(state, site, mode.powerMultiplier) * POWER_COST_PER_KW_MONTH * energyPriceIndex(state);
    const maintenance =
      NODE_SPECS.datacenter.maintenance *
      nodeMaintenanceScale('datacenter', site.tier) *
      mods.maintenanceCostMul *
      staff.maintenanceCostMul;
    return { revenue, power, maintenance, net: revenue - power - maintenance };
  };
  const current = snapshot(node);
  if (node.tier >= NODE_SPECS.datacenter.maxTier) return { connected, current, expansion: null };
  const next = snapshot({ ...node, tier: node.tier + 1 });
  const cost = nodeUpgradeCost('datacenter', node.tier);
  const addedNet = next.net - current.net;
  const money = monthlyBreakdown(state, mods);
  const monthlyCompanyCashAfter =
    money.totalRevenue * revenueFactor - money.totalCost - monthlyDebtService(state) + addedNet;
  const cashAfter = state.money - cost;
  const blockedBy = dataCenterExpansionBlocker(state, node);
  return {
    connected,
    current,
    expansion: {
      next,
      cost,
      addedNet,
      cashAfter,
      monthlyCompanyCashAfter,
      blockedBy,
      cashMissing: Math.max(0, -cashAfter),
      paybackMonths: addedNet > 0 ? cost / addedNet : null,
      runwayMonths: cashAfter >= 0 && monthlyCompanyCashAfter < 0 ? cashAfter / -monthlyCompanyCashAfter : null,
    },
  };
}
