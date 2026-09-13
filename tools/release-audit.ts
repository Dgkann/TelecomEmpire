// Diagnostic playthrough: real store actions, no free cash, research or customers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { useGame } from '../src/store/gameStore';
import { createNewGame, step, totalCustomers } from '../src/game/simulation';
import { MINUTES_PER_DAY, NODE_SPECS, TRANSIT_TIERS } from '../src/game/constants';
import { monthlyBreakdown } from '../src/game/economy';
import { RESEARCH, researchModifiers } from '../src/game/research';
import { connectedSiteEstimate } from '../src/game/connectedBuild';
import { expansionQuote } from '../src/game/expansion';
import { fixedCoverageTarget } from '../src/game/reach';
import { milestoneProgress } from '../src/game/milestones';
import { RANKS, nextRank } from '../src/game/progression';
import { migrate } from '../src/game/save';
import type { NodeKind } from '../src/game/types';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  },
});
const live = () => useGame.getState().game!;
const actions = () => useGame.getState();
const priority = [
  'ftth',
  'noc',
  'fiber10g',
  'gpon',
  'mobile_4g',
  'backbone100g',
  'edge_compute',
  'auto_dispatch',
  'mobile_5g',
];
const seeds = (process.env.AUDIT_SEEDS ?? '12345,4242,7311').split(',').map(Number);
const days = Number(process.env.AUDIT_DAYS ?? 365);
const campaign = process.env.AUDIT_MODE === 'campaign';
const results: unknown[] = [];

function build(kind: NodeKind, districtId: string, reserve: number) {
  const g = live();
  const district = g.districts.find((d) => d.id === districtId)!;
  const occupied = new Set(g.nodes.map((n) => `${n.gx},${n.gy}`));
  const cells = district.cells.filter((c) => !occupied.has(`${c.gx},${c.gy}`));
  cells.sort(
    (a, b) =>
      Math.min(...g.nodes.map((n) => Math.hypot(n.gx - a.gx, n.gy - a.gy))) -
      Math.min(...g.nodes.map((n) => Math.hypot(n.gx - b.gx, n.gy - b.gy))),
  );
  for (const c of cells.slice(0, 8)) {
    const quote = connectedSiteEstimate(g, kind, c.gx, c.gy);
    if (!quote.error && g.money >= quote.total + reserve) {
      actions().placeNode(kind, c.gx, c.gy);
      actions().cancelBuild();
      return;
    }
  }
}

function policy(day: number) {
  for (const goal of milestoneProgress(live()))
    if (!goal.claimed && goal.progress >= 1) actions().claimMilestone(goal.id);
  for (const incident of live().incidents)
    if (!incident.resolved && !incident.assignedTechId) actions().dispatchTech(incident.id, 'normal');
  for (const offer of live().offers) actions().acceptOffer(offer.id, 'flexible');
  const finance = monthlyBreakdown(live(), researchModifiers(live().researchDone));
  const reserve = Math.max(150000, finance.totalCost * 0.75);
  for (const node of live().nodes) {
    if (node.trafficGbps / node.capacityGbps > 0.75 && live().money > reserve + NODE_SPECS[node.kind].baseCost * 2)
      actions().upgradeNode(node.id);
    if (node.health < 65 && !node.down && live().money > reserve * 1.5)
      actions().scheduleMaintenance(node.id, 'overnight');
  }
  for (const link of live().links)
    if (link.trafficGbps / link.capacityGbps > 0.75 && live().money > reserve + link.length * 44000 * link.tier)
      actions().upgradeLink(link.id);
  const g = live();
  if (
    g.stats.transitGbps > TRANSIT_TIERS[g.transitTier].capacity * 0.75 &&
    g.transitTier < TRANSIT_TIERS.length - 1 &&
    finance.profit > 0
  )
    actions().setTransitTier(g.transitTier + 1);
  if (!live().researchActive) {
    const eligible = RESEARCH.filter(
      (r) => !live().researchDone.includes(r.id) && r.requires.every((id) => live().researchDone.includes(id)),
    );
    eligible.sort(
      (a, b) =>
        (priority.includes(a.id) ? priority.indexOf(a.id) : 99) -
        (priority.includes(b.id) ? priority.indexOf(b.id) : 99),
    );
    const next = eligible.find((r) => live().money >= r.cost + reserve && live().researchPoints >= r.points);
    if (next) actions().startResearch(next.id);
  }
  if (day % 3 === 0) {
    const thin = live().districts.find((d) => d.unlocked && fixedCoverageTarget(live(), d.id) < 0.7);
    if (thin) build('pop', thin.id, reserve);
    else {
      const quote = live()
        .districts.filter((d) => !d.unlocked)
        .map((d) => expansionQuote(live(), d.id, 'pop'))
        .filter((q) => q && !q.issue)
        .sort((a, b) => a!.total - b!.total)[0];
      if (quote && live().money > quote.total + reserve) actions().launchDistrict(quote.district.id, 'pop');
    }
  }
  if (live().researchDone.includes('edge_compute') && !live().nodes.some((n) => n.kind === 'datacenter'))
    build('datacenter', live().districts.find((d) => d.unlocked)!.id, reserve);
  if (live().researchDone.includes('mobile_4g')) {
    const district = live().districts.find(
      (d) => d.unlocked && !live().nodes.some((n) => n.kind === 'tower' && n.districtId === d.id),
    );
    if (district && live().spectrum.length) build('tower', district.id, reserve);
  }
  const auction = live().auction;
  if (auction?.result) actions().dismissAuction();
  else if (auction && !auction.playerBid && live().money > reserve + auction.reserve * 1.4)
    actions().placeBid(Math.ceil(auction.reserve * 1.4));
}

for (const seed of seeds) {
  useGame.setState({
    game: createNewGame({
      companyName: 'Release audit',
      logo: 'x',
      difficulty: 'standard',
      cityName: 'Marmara',
      seed,
      mode: campaign ? 'campaign' : 'sandbox',
    }),
    started: true,
    autoConnect: true,
    toast: () => {},
  });
  const milestones: Record<string, number> = {};
  const months: unknown[] = [];
  const transitions: unknown[] = [];
  let lastProgressDay = 0,
    longestGap = 0,
    negativeCashDays = 0,
    reloads = 0;
  let previous = '';
  for (let day = 0; day < days && !live().gameOver; day++) {
    policy(day);
    let g = live();
    for (let tick = 0; tick < MINUTES_PER_DAY / 5 && !g.gameOver; tick++) g = step(g);
    useGame.setState({ game: g });
    if (campaign && g.victoryAt !== null) {
      const from = g.cityName;
      if (actions().advanceCampaign()) {
        const next = live();
        transitions.push({ day: day + 1, from, to: next.cityName, cash: next.money, seed: next.rngSeed });
        console.log(JSON.stringify({ transition: transitions.at(-1) }));
        g = next;
      }
    }
    const progression = `${g.rank}:${g.nodes.length}:${g.researchDone.length}:${g.districts.filter((d) => d.unlocked).length}`;
    if (progression !== previous) {
      longestGap = Math.max(longestGap, day - lastProgressDay);
      lastProgressDay = day;
      previous = progression;
    }
    if (g.money < 0) negativeCashDays++;
    const markers = {
      customers400: totalCustomers(g) >= 400,
      customers1500: totalCustomers(g) >= 1500,
      secondDistrict: g.districts.filter((d) => d.unlocked).length >= 2,
      regional: g.rank >= 2,
      national: g.rank >= 3,
      global: g.rank >= 4,
      mobile: g.researchDone.includes('mobile_4g'),
    };
    for (const [name, reached] of Object.entries(markers))
      if (reached && milestones[name] === undefined) milestones[name] = day + 1;
    if ((day + 1) % 30 === 0 || g.gameOver) {
      const restored = migrate(JSON.parse(JSON.stringify(g)), g.version);
      if (!restored) throw new Error(`Save rejected: seed ${seed}, day ${day + 1}`);
      useGame.setState({ game: restored });
      reloads++;
      const finance = monthlyBreakdown(g, researchModifiers(g.researchDone));
      const row = {
        day: day + 1,
        city: g.cityName,
        cash: Math.round(g.money),
        customers: Math.round(totalCustomers(g)),
        profit: Math.round(finance.profit),
        rank: RANKS[g.rank].name,
        districts: g.districts.filter((d) => d.unlocked).length,
        research: g.researchDone.length,
        health: Math.round(g.stats.health),
        recentSpend: Object.fromEntries(
          [...new Set(g.ledger.map((entry) => entry.category))].map((category) => [
            category,
            Math.round(
              g.ledger
                .filter(
                  (entry) =>
                    entry.category === category && entry.amount < 0 && entry.at >= g.minutes - 30 * MINUTES_PER_DAY,
                )
                .reduce((sum, entry) => sum - entry.amount, 0),
            ),
          ]),
        ),
      };
      months.push(row);
      console.log(JSON.stringify({ seed, ...row }));
    }
  }
  const g = live();
  const result = {
    seed,
    days: Math.floor(g.minutes / MINUTES_PER_DAY),
    milestones,
    transitions,
    longestProgressGapDays: Math.max(longestGap, Math.floor(g.minutes / MINUTES_PER_DAY) - lastProgressDay),
    negativeCashDays,
    reloads,
    gameOver: g.gameOver,
    nextRank: nextRank(g)?.requirements.map((r) => ({ label: r.label, detail: r.detail(g), progress: r.progress(g) })),
    months,
  };
  results.push(result);
  mkdirSync('reports', { recursive: true });
  writeFileSync(
    campaign ? 'reports/release-campaign.json' : 'reports/release-balance.json',
    JSON.stringify(results, null, 2),
  );
}
