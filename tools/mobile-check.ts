// Forces a game to 4G, plants towers and reports what spectrum does to the mobile side.
import { createNewGame, step, mobileSubs, mobileCoverageTarget } from '../src/game/simulation';
import { MINUTES_PER_DAY, SPECTRUM_BANDS, towerCapacity, towerRadius, nodeCapacity } from '../src/game/constants';
import { monthlyBreakdown } from '../src/game/economy';
import { researchModifiers } from '../src/game/research';
import type { GameState } from '../src/game/types';

(globalThis as any).localStorage = {
  store: new Map<string, string>(),
  getItem(k: string) { return this.store.get(k) ?? null; },
  setItem(k: string, v: string) { this.store.set(k, v); },
  removeItem(k: string) { this.store.delete(k); },
};

let g: GameState = createNewGame({
  companyName: 'CoreLink', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 4242,
});

// Skip the fixed-line grind: hand ourselves the research and the cash.
g.researchDone = ['ftth', 'fiber10g', 'mobile_4g'];
g.money = 5_000_000;
g.districts = g.districts.map((d) => ({ ...d, unlocked: true }));
g.spectrum = [{ band: '1800', blocks: 1, wonAt: 0, paid: 0 }];
g.nextAuctionAt = g.minutes + MINUTES_PER_DAY * 2;

// Three towers around the city, each backhauled to the core.
const core = g.nodes.find((n) => n.kind === 'core')!;
[[8, 8], [16, 10], [11, 17]].forEach(([gx, gy], i) => {
  const d = g.districts.find((x) => x.cells.some((c) => c.gx === gx && c.gy === gy))!;
  const id = `tw${i}`;
  g.nodes = [...g.nodes, {
    id, kind: 'tower', name: `Tower ${i + 1}`, gx, gy, districtId: d.id, tier: 1,
    capacityGbps: towerCapacity(g.spectrum, 1), trafficGbps: 0, health: 100, down: false, builtAt: 0,
  }];
  const len = Math.hypot(core.gx - gx, core.gy - gy);
  g.links = [...g.links, {
    id: `tl${i}`, aId: id, bId: core.id, capacityGbps: 40, trafficGbps: 0, down: false, tier: 2, length: len, builtAt: 0,
  }];
});

const snap = (label: string) => {
  const m = monthlyBreakdown(g, researchModifiers(g.researchDone));
  console.log(
    `${label.padEnd(22)} radius ${towerRadius(g.spectrum, 1).toFixed(1)}` +
    ` | towerCap ${towerCapacity(g.spectrum, 1).toFixed(1)}G` +
    ` | cover ${g.districts.map((d) => Math.round(d.mobileCoverage * 100)).join('/')}` +
    ` | mobSubs ${Math.round(mobileSubs(g))}` +
    ` | mobRev ${Math.round(m.revenueMobile)}` +
    ` | demand ${g.stats.demandGbps.toFixed(1)}G | loss ${(g.stats.packetLoss * 100).toFixed(1)}%`,
  );
};

// Keeps the network alive and always bids, so we test the mobile path itself.
const run = (days: number) => {
  for (let i = 0; i < days * (MINUTES_PER_DAY / 5); i++) {
    g = step(g);
    for (const inc of g.incidents) {
      if (inc.resolved || inc.assignedTechId) continue;
      const t = g.technicians.find((x) => x.state === 'idle');
      if (!t) break;
      g.incidents = g.incidents.map((x) =>
        x.id === inc.id ? { ...x, repairMinutesLeft: Math.round(x.repairTotalMinutes * 0.28), assignedTechId: t.id } : x);
      g.technicians = g.technicians.map((x) => x.id === t.id ? { ...x, incidentId: inc.id, state: 'driving' as const } : x);
    }
    if (g.auction && !g.auction.result && g.auction.playerBid === null) {
      g.auction = { ...g.auction, playerBid: 9_000_000 };
      console.log(`  bid on ${SPECTRUM_BANDS[g.auction.band].label} x${g.auction.blocks}`);
    }
    if (g.auction?.result) {
      console.log(`  lot went to ${g.auction.result.winnerName} at ${g.auction.result.price.toLocaleString()}`);
      g.auction = null;
    }
  }
};

snap('start (1800 only)');
run(30);
snap('after 30d');

// An auction should have opened by now. Bid absurdly high to guarantee a win.
console.log('\nauction open:', g.auction ? `${SPECTRUM_BANDS[g.auction.band].label} x${g.auction.blocks}` : 'none');
if (g.auction && !g.auction.result) {
  g.auction = { ...g.auction, playerBid: 9_000_000 };
  run(6);
  console.log('auction result:', g.auction?.result?.winnerName, g.auction?.result?.price?.toLocaleString());
  console.log('holdings:', g.spectrum.map((h) => `${SPECTRUM_BANDS[h.band].label} x${h.blocks}`).join(', '));
}

run(40);
snap('after auction +40d');

// Low band should widen every footprint at once.
g.spectrum = [...g.spectrum, { band: '700', blocks: 2, wonAt: g.minutes, paid: 0 }];
console.log('\ngranted 700 MHz x2');
run(45);
snap('with 700 MHz');

console.log('\ncoverage targets:', g.districts.map((d) => `${d.name} ${(mobileCoverageTarget(g, d) * 100).toFixed(0)}%`).join(' | '));
console.log('tower traffic:', g.nodes.filter((n) => n.kind === 'tower').map((n) => `${n.trafficGbps.toFixed(2)}/${n.capacityGbps.toFixed(1)}`).join(' | '));
console.log('fixed tier1 tower cap for reference:', nodeCapacity('tower', 1));
console.log('mobile package subs:', g.packages.filter((p) => p.segment === 'mobile').map((p) => `${p.name} ${p.subscribers}`).join(' | '));
console.log('cash:', Math.round(g.money).toLocaleString());
