import { writeFileSync } from 'node:fs';
import { createNewGame } from '../src/game/simulation';
import { computeRoutes, loadServices } from '../src/game/network';

const game = createNewGame({
  companyName: 'Load benchmark',
  logo: 'x',
  cityName: 'Marmara',
  difficulty: 'standard',
  seed: 4242,
});
const core = game.nodes.find((n) => n.kind === 'core')!;
game.nodes = Array.from({ length: 152 }, (_, i) => ({
  ...core,
  id: `n${i}`,
  kind: i === 0 ? ('core' as const) : ('pop' as const),
  districtId: game.districts[i % game.districts.length].id,
  capacityGbps: 40,
}));
game.links = Array.from({ length: 151 }, (_, i) => ({
  ...game.links[0],
  id: `l${i}`,
  aId: `n${i}`,
  bId: `n${i + 1}`,
  length: 1,
  capacityGbps: 40,
}));
const routes = computeRoutes(game);
const services = game.districts.flatMap((d) =>
  [1, 2, 3].map((priority) => ({
    id: `${d.id}:${priority}`,
    districtId: d.id,
    priority,
    demandGbps: 25 * priority,
    servingNodeIds: game.nodes.filter((n) => n.kind === 'pop' && n.districtId === d.id).map((n) => n.id),
  })),
);
for (let i = 0; i < 20; i++) loadServices(game, services, routes, true);
const times: number[] = [];
let result = loadServices(game, services, routes, true);
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  result = loadServices(game, services, routes, true);
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const report = { medianMs: times[50], p95Ms: times[95], result };
writeFileSync(process.argv[2] ?? 'node_modules/.cache/network-benchmark.json', JSON.stringify(report));
console.log(JSON.stringify({ medianMs: report.medianMs, p95Ms: report.p95Ms, served: result.totalServed }));
