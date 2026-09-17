import { MINUTES_PER_STEP } from './constants';
import { uid, type Rng } from './rng';
import type { GameState, Incident, IncidentKind, Technician } from './types';

export type RepairMode = 'emergency' | 'normal';

interface IncidentTemplate {
  kind: IncidentKind;
  title: string;
  titleTr: string;
  target: 'node' | 'link' | 'any';
  nodeKinds?: Array<GameState['nodes'][number]['kind']>;
  // Base repair time in game minutes at normal pace.
  minutes: number;
  weight: number;
  degrade: boolean;
  text: (place: string) => string;
  textTr: (place: string) => string;
}

const TEMPLATES: IncidentTemplate[] = [
  {
    kind: 'fiber_cut',
    title: 'Fibre Cut',
    titleTr: 'Fiber kesintisi',
    target: 'link',
    minutes: 480,
    weight: 22,
    degrade: false,
    text: (p) => `A digger went through the duct near ${p}. The span is dark until a splice team gets there.`,
    textTr: (p) => `${p} yakınında bir kepçe kablo kanalını kesti. Ek ekibi gelene kadar hat karanlık.`,
  },
  {
    kind: 'router_failure',
    title: 'Router Failure',
    titleTr: 'Yönlendirici arızası',
    target: 'node',
    nodeKinds: ['core', 'pop'],
    minutes: 300,
    weight: 14,
    degrade: false,
    text: (p) => `The routing engine at ${p} has stopped forwarding. Line cards are showing hardware faults.`,
    textTr: (p) =>
      `${p} noktasındaki yönlendirme motoru trafik iletmeyi bıraktı. Hat kartları donanım hatası gösteriyor.`,
  },
  {
    kind: 'switch_failure',
    title: 'Switch Failure',
    titleTr: 'Anahtar arızası',
    target: 'node',
    nodeKinds: ['access', 'pop'],
    minutes: 200,
    weight: 14,
    degrade: false,
    text: (p) => `An aggregation switch at ${p} dropped its uplinks and will not come back cleanly.`,
    textTr: (p) => `${p} noktasındaki bir toplama anahtarı üst bağlantılarını kaybetti ve düzgün geri gelmiyor.`,
  },
  {
    kind: 'ddos',
    title: 'DDoS Attack',
    titleTr: 'DDoS saldırısı',
    target: 'node',
    nodeKinds: ['core', 'pop'],
    minutes: 180,
    weight: 12,
    degrade: true,
    text: (p) => `Volumetric traffic is slamming ${p}. Capacity is being eaten by junk packets.`,
    textTr: (p) => `${p} yoğun saldırı trafiğiyle dövülüyor. Kapasiteyi çöp paketler tüketiyor.`,
  },
  {
    kind: 'power_outage',
    title: 'Power Outage',
    titleTr: 'Elektrik kesintisi',
    target: 'node',
    nodeKinds: ['pop', 'access', 'tower', 'datacenter'],
    minutes: 240,
    weight: 12,
    degrade: false,
    text: (p) => `Grid power is out at ${p} and the batteries are draining fast.`,
    textTr: (p) => `${p} noktasında şebeke elektriği kesildi ve bataryalar hızla tükeniyor.`,
  },
  {
    kind: 'cooling_failure',
    title: 'Cooling Failure',
    titleTr: 'Soğutma arızası',
    target: 'node',
    nodeKinds: ['datacenter', 'core'],
    minutes: 260,
    weight: 6,
    degrade: true,
    text: (p) => `Chillers are down at ${p}. Equipment is throttling to stay alive.`,
    textTr: (p) => `${p} noktasında soğutucular durdu. Ekipman ayakta kalmak için performansını düşürüyor.`,
  },
  {
    kind: 'dns_failure',
    title: 'DNS Resolver Failure',
    titleTr: 'DNS çözümleyici arızası',
    target: 'node',
    nodeKinds: ['core'],
    minutes: 120,
    weight: 8,
    degrade: true,
    text: () =>
      `Your resolvers are timing out. Customers say "the internet is broken", and technically they are right.`,
    textTr: () =>
      'Çözümleyicilerin zaman aşımına uğruyor. Müşteriler "internet bozuk" diyor ve teknik olarak haklılar.',
  },
  {
    kind: 'bgp_leak',
    title: 'BGP Route Leak',
    titleTr: 'BGP rota sızıntısı',
    target: 'node',
    nodeKinds: ['core'],
    minutes: 150,
    weight: 7,
    degrade: true,
    text: () => `An upstream leaked your prefixes. Traffic is taking a scenic route through another continent.`,
    textTr: () => 'Bir üst sağlayıcı ön eklerini sızdırdı. Trafik başka bir kıtadan dolaşarak geliyor.',
  },
  {
    kind: 'bad_upgrade',
    title: 'Failed Software Upgrade',
    titleTr: 'Başarısız yazılım güncellemesi',
    target: 'node',
    nodeKinds: ['core', 'pop', 'access'],
    minutes: 210,
    weight: 8,
    degrade: false,
    text: (p) => `A maintenance window at ${p} went wrong. The box is stuck in a boot loop.`,
    textTr: (p) => `${p} noktasındaki bakım penceresi ters gitti. Cihaz yeniden başlatma döngüsünde kaldı.`,
  },
  {
    kind: 'overheating',
    title: 'Equipment Overheating',
    titleTr: 'Ekipman aşırı ısınması',
    target: 'node',
    nodeKinds: ['pop', 'access', 'tower'],
    minutes: 160,
    weight: 9,
    degrade: true,
    text: (p) => `The cabinet at ${p} is running hot and shedding capacity to protect itself.`,
    textTr: (p) => `${p} noktasındaki kabin fazla ısınıyor ve kendini korumak için kapasite düşürüyor.`,
  },
];

// Incidents store English text; Turkish is rebuilt from the template and the same place name.
export function incidentCopy(incident: Incident, state: GameState, tr: boolean) {
  const template = TEMPLATES.find((t) => t.kind === incident.kind);
  if (!tr || !template) return { title: incident.title, description: incident.description };
  const district = state.districts.find((d) => d.id === incident.districtId)?.name ?? '';
  const place =
    incident.targetType === 'link' ? district : (state.nodes.find((n) => n.id === incident.targetId)?.name ?? district);
  return { title: template.titleTr, description: template.textTr(place) };
}

export function rollIncident(
  state: GameState,
  rng: Rng,
  mods: { incidentDurationMul: number; ddosRateMul?: number },
): Incident | null {
  const maintenanceNodes = new Set(
    state.maintenanceOrders.filter((order) => order.status !== 'completed').map((order) => order.nodeId),
  );
  const candidates = TEMPLATES.filter((template) => {
    if (template.target === 'link') return state.links.some((link) => !link.down);
    return state.nodes.some(
      (node) =>
        !node.down && !maintenanceNodes.has(node.id) && (!template.nodeKinds || template.nodeKinds.includes(node.kind)),
    );
  }).map((template) => ({
    template,
    weight: template.weight * (template.kind === 'ddos' ? (mods.ddosRateMul ?? 1) : 1),
  }));
  if (!candidates.length) return null;

  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rng() * total;
  let tpl = candidates[0].template;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) {
      tpl = candidate.template;
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
    const options = state.nodes.filter(
      (n) => !n.down && !maintenanceNodes.has(n.id) && (!tpl.nodeKinds || tpl.nodeKinds.includes(n.kind)),
    );
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
    repairBaseMinutes: total_minutes,
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
  key: RepairMode;
  label: string;
  cost: number;
  minutes: number;
  note: string;
}

// Priced off the fault, not the clock - the size penalty is time, not parts.
export function repairCost(incident: Incident, mode: RepairMode) {
  const base = incident.repairBaseMinutes ?? incident.repairTotalMinutes;
  const raw = mode === 'emergency' ? 16000 + base * 180 : 4000 + base * 44.0;
  return Math.round(raw / 2000) * 2000;
}

export function repairOptions(incident: Incident, techSkill: number): RepairOption[] {
  return [
    {
      key: 'emergency',
      label: 'Emergency Repair',
      cost: repairCost(incident, 'emergency'),
      minutes: repairMinutes(incident, techSkill, 'emergency'),
      note: 'Overtime crew, parts flown in.',
    },
    {
      key: 'normal',
      label: 'Scheduled Repair',
      cost: repairCost(incident, 'normal'),
      minutes: repairMinutes(incident, techSkill, 'normal'),
      note: 'Cheap, but customers wait.',
    },
  ];
}

export function incidentLocation(s: GameState, inc: Incident): { gx: number; gy: number } {
  if (inc.targetType === 'node') {
    const n = s.nodes.find((x) => x.id === inc.targetId);
    if (n) return { gx: n.gx, gy: n.gy };
  } else {
    const l = s.links.find((x) => x.id === inc.targetId);
    if (l) {
      const a = s.nodes.find((n) => n.id === l.aId);
      const b = s.nodes.find((n) => n.id === l.bId);
      if (a && b) return { gx: (a.gx + b.gx) / 2, gy: (a.gy + b.gy) / 2 };
    }
  }
  const d = s.districts.find((x) => x.id === inc.districtId);
  return d ? d.center : { gx: 0, gy: 0 };
}

export const CREW_SPEED = 0.02;

// Work and travel estimates share the simulation's speed and repair formula.
export function repairMinutes(incident: Incident, skill: number, mode: RepairMode) {
  return Math.max(
    30,
    Math.round(incident.repairTotalMinutes * (mode === 'emergency' ? 0.28 : 1) * (1 - (skill - 1) * 0.12)),
  );
}

export function crewTravelMinutes(state: GameState, incident: Incident, technician: Technician) {
  const target = incidentLocation(state, incident);
  const distance = Math.hypot(target.gx - technician.gx, target.gy - technician.gy);
  return Math.max(1, Math.ceil(distance / (CREW_SPEED * MINUTES_PER_STEP))) * MINUTES_PER_STEP;
}

export function dispatchCandidates(state: GameState, incident: Incident, mode: RepairMode) {
  return state.technicians
    .filter((t) => t.state === 'idle' && t.incidentId === null && t.maintenanceId === null)
    .map((technician) => {
      const travelMinutes = crewTravelMinutes(state, incident, technician);
      const workMinutes =
        Math.ceil(repairMinutes(incident, technician.skill, mode) / MINUTES_PER_STEP) * MINUTES_PER_STEP;
      return { technician, travelMinutes, workMinutes, totalMinutes: travelMinutes + workMinutes };
    })
    .sort((a, b) => a.totalMinutes - b.totalMinutes || a.technician.id.localeCompare(b.technician.id));
}

// The incident's recorded customer impact is a stable triage signal; age breaks ties.
export function pendingIncidents(state: GameState) {
  return state.incidents
    .filter((i) => !i.resolved && i.assignedTechId === null && i.repairMinutesLeft === null)
    .sort((a, b) => b.affected - a.affected || a.startedAt - b.startedAt || a.id.localeCompare(b.id));
}
