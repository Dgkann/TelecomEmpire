// Plays a year with a rough sensible-player policy and prints the economy.
import { createNewGame, step, residentialSubs, totalCustomers } from '../src/game/simulation';
import { nodeCapacity, MINUTES_PER_DAY, NODE_SPECS, FIBER_COST_PER_UNIT, TRANSIT_TIERS, linkCapacity } from '../src/game/constants';
import { monthlyBreakdown } from '../src/game/economy';
import { RESEARCH, researchModifiers } from '../src/game/research';
import { operationsInsights } from '../src/game/operations';
import type { GameState } from '../src/game/types';

(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) { return this.store.get(k) ?? null; },
  setItem(k: string, v: string) { this.store.set(k, v); },
  removeItem(k: string) { this.store.delete(k); },
};

let g: GameState = createNewGame({
  companyName: 'CoreLink',
  logo: '📡',
  difficulty: 'standard',
  cityName: 'Marmara',
  seed: 12345,
});

const STEPS_PER_DAY = MINUTES_PER_DAY / 5;
const DAYS = 365;

let uidc = 0;
function buildPop(g: GameState, districtId: string) {
  const d = g.districts.find((x) => x.id === districtId)!;
  const cost = NODE_SPECS.pop.baseCost;
  if (g.money < cost * 2.2) return false;
  const cell = d.cells.find((c) => !g.nodes.some((n) => Math.hypot(n.gx - c.gx, n.gy - c.gy) < 3));
  if (!cell) return false;
  g.money -= cost;
  const id = `pop_${uidc++}`;
  g.nodes = [...g.nodes, {
    id, kind: 'pop', name: `${d.name} POP ${uidc}`, gx: cell.gx, gy: cell.gy, districtId: d.id,
    tier: 1, capacityGbps: nodeCapacity('pop', 1), trafficGbps: 0, health: 100, down: false, builtAt: g.minutes,
  }];
  const others = g.nodes.filter((n) => n.id !== id && (n.kind === 'core' || n.kind === 'pop'));
  let best = others[0];
  let bd = Infinity;
  for (const o of others) {
    const dist = Math.hypot(o.gx - cell.gx, o.gy - cell.gy);
    if (dist < bd) { bd = dist; best = o; }
  }
  if (best) {
    g.money -= bd * FIBER_COST_PER_UNIT;
    g.links = [...g.links, {
      id: `l_${uidc++}`, aId: id, bId: best.id, capacityGbps: linkCapacity(1), trafficGbps: 0,
      down: false, tier: 1, length: bd, builtAt: g.minutes,
    }];
  }
  return true;
}

const rows: string[] = [];
let peakPressure = 0;

for (let day = 0; day < DAYS; day++) {
  for (let i = 0; i < STEPS_PER_DAY; i++) {
    g = step(g);
    peakPressure = Math.max(peakPressure, g.stats.coreUtilization);
  }

  // --- naive player policy, run once per day ---
  // 1. upgrade anything above 80% utilisation if affordable
  for (const n of g.nodes) {
    if (n.capacityGbps > 0 && n.trafficGbps / n.capacityGbps > 0.8 && n.tier < 4) {
      const cost = Math.round(NODE_SPECS[n.kind].baseCost * Math.pow(NODE_SPECS[n.kind].tierCostMul, n.tier - 1) * 0.8);
      if (g.money > cost * 2) {
        g.money -= cost;
        g.nodes = g.nodes.map((x) => x.id === n.id ? { ...x, tier: x.tier + 1, capacityGbps: nodeCapacity(x.kind, x.tier + 1) } : x);
      }
    }
  }
  for (const l of g.links) {
    if (l.capacityGbps > 0 && l.trafficGbps / l.capacityGbps > 0.8 && l.tier < 2) {
      const cost = Math.round(l.length * 2200 * l.tier);
      if (g.money > cost * 2) {
        g.money -= cost;
        g.links = g.links.map((x) => x.id === l.id ? { ...x, tier: x.tier + 1, capacityGbps: linkCapacity(x.tier + 1) } : x);
      }
    }
  }
  // 2. dispatch a crew to any unassigned incident, emergency if we can afford
  //    it, otherwise the slow scheduled repair, which is always available.
  for (const inc of g.incidents) {
    if (inc.resolved || inc.assignedTechId) continue;
    const t = g.technicians.find((x) => x.state === 'idle');
    if (!t) break;
    const rush = Math.round((1200 + inc.repairTotalMinutes * 22) / 100) * 100;
    const canRush = g.money > rush * 3;
    if (canRush) g.money -= rush;
    else g.money -= Math.round((300 + inc.repairTotalMinutes * 5) / 100) * 100;
    const minutes = Math.round(inc.repairTotalMinutes * (canRush ? 0.28 : 1));
    g.incidents = g.incidents.map((x) => x.id === inc.id ? { ...x, repairMinutesLeft: minutes, assignedTechId: t.id } : x);
    g.technicians = g.technicians.map((x) => x.id === t.id ? { ...x, incidentId: inc.id, state: 'driving' as const } : x);
  }
  // 3. sign offers only while there is spare capacity to carry them
  const headroom = g.nodes.filter((n) => n.kind === 'pop' || n.kind === 'access')
    .reduce((s, n) => s + n.capacityGbps, 0) - g.stats.demandGbps;
  for (const o of g.offers) {
    if (headroom > o.bandwidthGbps * 0.2) {
      g.money += o.signingBonus;
      g.contracts = [...g.contracts, { ...o, downtimeMinutes: 0, penaltyPaid: 0, startedAt: g.minutes }];
    }
  }
  g.offers = [];
  // 4. buy upstream when the game says so. Without this the tool measured a
  //    player pinned behind the transit wall rather than the game itself.
  if (operationsInsights(g).some((i) => i.id === 'transit-headroom') && g.transitTier < TRANSIT_TIERS.length - 1) {
    g.transitTier += 1;
  }
  // 5. research in order, which is what lifts the coverage ceiling off 75%
  if (!g.researchActive) {
    const next = RESEARCH.find(
      (r) => !g.researchDone.includes(r.id) && r.requires.every((q) => g.researchDone.includes(q)),
    );
    if (next && g.money > next.cost * 2) {
      g.money -= next.cost;
      g.researchActive = { id: next.id, daysLeft: next.days };
    }
  }
  // 6. expand: unlock a district when rich, then build a POP where coverage is thin
  const locked = g.districts.find((d) => !d.unlocked);
  if (locked && g.money > locked.entryCost * 3) {
    g.money -= locked.entryCost;
    g.districts = g.districts.map((d) => d.id === locked.id ? { ...d, unlocked: true } : d);
  }
  const thin = g.districts.filter((d) => d.unlocked && d.coverage < 0.55).sort((a, b) => a.coverage - b.coverage)[0];
  if (thin && day % 3 === 0) buildPop(g, thin.id);

  if (day % 30 === 0) {
    const m = monthlyBreakdown(g, researchModifiers(g.researchDone));
    rows.push(
      `d${String(day).padStart(3)} | cash ${fmt(g.money)} | cust ${String(Math.round(residentialSubs(g))).padStart(6)}` +
      ` | contracts ${String(g.contracts.length).padStart(2)} | rev/mo ${fmt(m.totalRevenue)} | cost/mo ${fmt(m.totalCost)}` +
      ` | profit ${fmt(m.profit)} | rep ${g.reputation.toFixed(0)} | health ${g.stats.health.toFixed(0)}` +
      ` | demand ${g.stats.demandGbps.toFixed(1)}G | loss ${(g.stats.packetLoss * 100).toFixed(1)}%` +
      ` | nodes ${g.nodes.length} | inc ${g.incidents.filter((i) => !i.resolved).length}`,
    );
  }
}

function fmt(n: number) {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return (s + (a / 1e6).toFixed(1) + 'M').padStart(8);
  if (a >= 1e3) return (s + (a / 1e3).toFixed(0) + 'k').padStart(8);
  return (s + a.toFixed(0)).padStart(8);
}

console.log(rows.join('\n'));
console.log('\npeak pressure:', peakPressure.toFixed(2));
console.log('total customers:', totalCustomers(g));
console.log('districts unlocked:', g.districts.filter((d) => d.unlocked).length);
console.log('transit:', TRANSIT_TIERS[g.transitTier].label, `(${TRANSIT_TIERS[g.transitTier].capacity}G)`);
console.log('research done:', g.researchDone.join(', ') || 'none');
console.log('coverage:', g.districts.map((d) => `${d.name} ${(d.coverage * 100).toFixed(0)}% sat ${d.satisfaction.toFixed(0)}`).join(' | '));
console.log('incidents total seen:', g.incidents.length);
console.log('posts:', g.posts.length, '| log:', g.log.length);
