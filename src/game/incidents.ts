import { uid, type Rng } from './rng';
import type { GameState, Incident, IncidentKind } from './types';

interface IncidentTemplate {
  kind: IncidentKind;
  title: string;
  target: 'node' | 'link' | 'any';
  nodeKinds?: Array<GameState['nodes'][number]['kind']>;
  // Base repair time in game minutes at normal pace.
  minutes: number;
  weight: number;
  degrade: boolean;
  text: (place: string) => string;
}

const TEMPLATES: IncidentTemplate[] = [
  {
    kind: 'fiber_cut',
    title: 'Fibre Cut',
    target: 'link',
    minutes: 480,
    weight: 22,
    degrade: false,
    text: (p) => `A digger went through the duct near ${p}. The span is dark until a splice team gets there.`,
  },
  {
    kind: 'router_failure',
    title: 'Router Failure',
    target: 'node',
    nodeKinds: ['core', 'pop'],
    minutes: 300,
    weight: 14,
    degrade: false,
    text: (p) => `The routing engine at ${p} has stopped forwarding. Line cards are showing hardware faults.`,
  },
  {
    kind: 'switch_failure',
    title: 'Switch Failure',
    target: 'node',
    nodeKinds: ['access', 'pop'],
    minutes: 200,
    weight: 14,
    degrade: false,
    text: (p) => `An aggregation switch at ${p} dropped its uplinks and will not come back cleanly.`,
  },
  {
    kind: 'ddos',
    title: 'DDoS Attack',
    target: 'node',
    nodeKinds: ['core', 'pop'],
    minutes: 180,
    weight: 12,
    degrade: true,
    text: (p) => `Volumetric traffic is slamming ${p}. Capacity is being eaten by junk packets.`,
  },
  {
    kind: 'power_outage',
    title: 'Power Outage',
    target: 'node',
    nodeKinds: ['pop', 'access', 'tower', 'datacenter'],
    minutes: 240,
    weight: 12,
    degrade: false,
    text: (p) => `Grid power is out at ${p} and the batteries are draining fast.`,
  },
  {
    kind: 'cooling_failure',
    title: 'Cooling Failure',
    target: 'node',
    nodeKinds: ['datacenter', 'core'],
    minutes: 260,
    weight: 6,
    degrade: true,
    text: (p) => `Chillers are down at ${p}. Equipment is throttling to stay alive.`,
  },
  {
    kind: 'dns_failure',
    title: 'DNS Resolver Failure',
    target: 'node',
    nodeKinds: ['core'],
    minutes: 120,
    weight: 8,
    degrade: true,
    text: () => `Your resolvers are timing out. Customers say "the internet is broken", and technically they are right.`,
  },
  {
    kind: 'bgp_leak',
    title: 'BGP Route Leak',
    target: 'node',
    nodeKinds: ['core'],
    minutes: 150,
    weight: 7,
    degrade: true,
    text: () => `An upstream leaked your prefixes. Traffic is taking a scenic route through another continent.`,
  },
  {
    kind: 'bad_upgrade',
    title: 'Failed Software Upgrade',
    target: 'node',
    nodeKinds: ['core', 'pop', 'access'],
    minutes: 210,
    weight: 8,
    degrade: false,
    text: (p) => `A maintenance window at ${p} went wrong. The box is stuck in a boot loop.`,
  },
  {
    kind: 'overheating',
    title: 'Equipment Overheating',
    target: 'node',
    nodeKinds: ['pop', 'access', 'tower'],
    minutes: 160,
    weight: 9,
    degrade: true,
    text: (p) => `The cabinet at ${p} is running hot and shedding capacity to protect itself.`,
  },
];

export function rollIncident(state: GameState, rng: Rng, mods: { incidentDurationMul: number }): Incident | null {
  const candidates = TEMPLATES.filter((t) => {
    if (t.target === 'link') return state.links.some((l) => !l.down);
    return state.nodes.some((n) => !n.down && (!t.nodeKinds || t.nodeKinds.includes(n.kind)));
  });
  if (!candidates.length) return null;

  const total = candidates.reduce((s, t) => s + t.weight, 0);
  let roll = rng() * total;
  let tpl = candidates[0];
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) {
      tpl = c;
      break;
    }
  }

  let targetId = '';
  let targetType: 'node' | 'link' = 'node';
  let districtId = '';
  let place = '';

  if (tpl.target === 'link') {
    const options = state.links.filter((l) => !l.down);
    const link = options[Math.floor(rng() * options.length)];
    if (!link) return null;
    targetId = link.id;
    targetType = 'link';
    const endpoint = state.nodes.find((n) => n.id === link.bId) ?? state.nodes.find((n) => n.id === link.aId);
    districtId = endpoint?.districtId ?? state.districts[0].id;
    place = state.districts.find((d) => d.id === districtId)?.name ?? 'the city';
  } else {
    const options = state.nodes.filter((n) => !n.down && (!tpl.nodeKinds || tpl.nodeKinds.includes(n.kind)));
    const node = options[Math.floor(rng() * options.length)];
    if (!node) return null;
    targetId = node.id;
    targetType = 'node';
    districtId = node.districtId;
    place = node.name;
  }

  // Health makes failures more likely to be severe.
  const severity = 0.8 + rng() * 0.6;
  const total_minutes = Math.round(tpl.minutes * severity * mods.incidentDurationMul);

  const affected = estimateAffected(state, districtId);

  return {
    id: uid('inc'),
    kind: tpl.kind,
    title: tpl.title,
    description: tpl.text(place),
    targetId,
    targetType,
    districtId,
    startedAt: state.minutes,
    repairMinutesLeft: null,
    repairTotalMinutes: total_minutes,
    assignedTechId: null,
    affected,
    resolved: false,
    degrade: tpl.degrade,
  };
}

export function estimateAffected(state: GameState, districtId: string) {
  const district = state.districts.find((d) => d.id === districtId);
  if (!district) return 0;
  const buildings = state.buildings.filter((b) => b.districtId === districtId);
  return Math.round(buildings.reduce((s, b) => s + b.households * b.connected, 0));
}

export interface RepairOption {
  key: 'emergency' | 'normal';
  label: string;
  cost: number;
  minutes: number;
  note: string;
}

export function repairOptions(incident: Incident, techSkill: number): RepairOption[] {
  const base = incident.repairTotalMinutes;
  const skillMul = 1 - (techSkill - 1) * 0.12;
  return [
    {
      key: 'emergency',
      label: 'Emergency Repair',
      cost: Math.round((1200 + base * 22) / 100) * 100,
      minutes: Math.max(30, Math.round(base * 0.28 * skillMul)),
      note: 'Overtime crew, parts flown in.',
    },
    {
      key: 'normal',
      label: 'Scheduled Repair',
      cost: Math.round((300 + base * 5) / 100) * 100,
      minutes: Math.max(60, Math.round(base * skillMul)),
      note: 'Cheap, but customers wait.',
    },
  ];
}
