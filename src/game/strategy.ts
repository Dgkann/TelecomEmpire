import { MINUTES_PER_DAY } from './constants';
import { clamp } from './util';
import type {
  CampaignKind,
  DataCenterMode,
  DistrictCampaign,
  GameState,
  InterconnectPlan,
  MaintenanceMode,
  NetNode,
  TrafficPolicy,
} from './types';

export const CAMPAIGN_CONFIG: Record<
  CampaignKind,
  { label: string; description: string; cost: number; durationDays: number; color: string }
> = {
  acquisition: {
    label: 'Acquisition drive',
    description: '45% faster fixed-line growth in this district.',
    cost: 18_000,
    durationDays: 30,
    color: '#3ee6d6',
  },
  retention: {
    label: 'Retention care',
    description: '40% less churn and a local satisfaction lift.',
    cost: 16_000,
    durationDays: 30,
    color: '#a3e635',
  },
  business: {
    label: 'Business outreach',
    description: '75% more enterprise leads from this district.',
    cost: 22_000,
    durationDays: 30,
    color: '#a78bfa',
  },
  mobile: {
    label: 'Mobile launch',
    description: '50% faster mobile subscriber growth.',
    cost: 24_000,
    durationDays: 30,
    color: '#f59e0b',
  },
};

export const TRAFFIC_POLICY_CONFIG: Record<
  TrafficPolicy,
  {
    label: string;
    description: string;
    priorities: { residential: number; business: number; mobile: number; wholesale: number; workload: number };
  }
> = {
  balanced: {
    label: 'Balanced',
    description: 'Share congestion evenly across every service.',
    priorities: { residential: 1, business: 1, mobile: 1, wholesale: 0.7, workload: 0.85 },
  },
  residential: {
    label: 'Household first',
    description: 'Protect fixed subscribers when capacity gets tight.',
    priorities: { residential: 1.6, business: 0.8, mobile: 0.85, wholesale: 0.5, workload: 0.7 },
  },
  business: {
    label: 'SLA first',
    description: 'Prioritise contracted circuits and enterprise traffic.',
    priorities: { residential: 0.7, business: 2, mobile: 0.8, wholesale: 0.45, workload: 0.85 },
  },
  mobile: {
    label: '5G slice',
    description: 'Reserve the strongest service class for mobile traffic.',
    priorities: { residential: 0.8, business: 0.75, mobile: 1.8, wholesale: 0.5, workload: 0.7 },
  },
};

export const INTERCONNECT_CONFIG: Record<
  InterconnectPlan,
  {
    label: string;
    description: string;
    monthly: number;
    capacityBonus: number;
    cacheOffload: number;
    latencyDelta: number;
    requiresDataCenter: boolean;
  }
> = {
  transit: {
    label: 'Transit only',
    description: 'No commitment. All external traffic uses paid upstream transit.',
    monthly: 0,
    capacityBonus: 0,
    cacheOffload: 0,
    latencyDelta: 0,
    requiresDataCenter: false,
  },
  ixp: {
    label: 'Metro IXP',
    description: 'Adds 22 Gbps of peering headroom and trims latency.',
    monthly: 7_500,
    capacityBonus: 22,
    cacheOffload: 0.04,
    latencyDelta: -3,
    requiresDataCenter: false,
  },
  cdn: {
    label: 'CDN partnership',
    description: 'Keeps popular traffic local, but needs an online data centre.',
    monthly: 11_000,
    capacityBonus: 8,
    cacheOffload: 0.12,
    latencyDelta: -5,
    requiresDataCenter: true,
  },
};

export const DATA_CENTER_MODE_CONFIG: Record<
  DataCenterMode,
  {
    label: string;
    description: string;
    revenueMultiplier: number;
    cachePerTier: number;
    workloadPerTier: number;
    powerMultiplier: number;
  }
> = {
  cache: {
    label: 'Edge cache',
    description: 'Maximum traffic offload, modest hosting income.',
    revenueMultiplier: 0.55,
    cachePerTier: 0.12,
    workloadPerTier: 0.25,
    powerMultiplier: 1.15,
  },
  colocation: {
    label: 'Colocation',
    description: 'Reliable rack income with predictable load.',
    revenueMultiplier: 1,
    cachePerTier: 0.08,
    workloadPerTier: 0.45,
    powerMultiplier: 1,
  },
  cloud: {
    label: 'Cloud compute',
    description: 'High-margin workloads that consume real capacity and power.',
    revenueMultiplier: 1.45,
    cachePerTier: 0.04,
    workloadPerTier: 1.4,
    powerMultiplier: 1.35,
  },
  recovery: {
    label: 'Disaster recovery',
    description: 'Cuts contract outage exposure while earning steady fees.',
    revenueMultiplier: 0.85,
    cachePerTier: 0,
    workloadPerTier: 0.25,
    powerMultiplier: 1.15,
  },
};

export const MAINTENANCE_CONFIG: Record<
  MaintenanceMode,
  { label: string; description: string; costMultiplier: number; durationMinutes: number }
> = {
  urgent: {
    label: 'Urgent service',
    description: 'Dispatch immediately. Expensive, but the shortest intervention.',
    costMultiplier: 1.55,
    durationMinutes: 90,
  },
  overnight: {
    label: 'Overnight window',
    description: 'Queue for 02:00. Lower cost, with a longer planned interruption.',
    costMultiplier: 0.8,
    durationMinutes: 150,
  },
  defer: {
    label: 'Keep it running',
    description: 'Spend nothing and accept the rising odds of an unplanned failure.',
    costMultiplier: 0,
    durationMinutes: 0,
  },
};

export function activeCampaign(
  state: Pick<GameState, 'campaigns' | 'minutes'>,
  districtId: string,
  kind?: CampaignKind,
): DistrictCampaign | undefined {
  return state.campaigns.find(
    (campaign) => campaign.districtId === districtId && campaign.endsAt > state.minutes && (!kind || campaign.kind === kind),
  );
}

export function dataCenterMode(state: Pick<GameState, 'dataCenterModes'>, nodeId: string): DataCenterMode {
  return state.dataCenterModes[nodeId] ?? 'colocation';
}

export function isLiveDataCenter(state: Pick<GameState, 'nodes'>) {
  return state.nodes.some((node) => node.kind === 'datacenter' && !node.down);
}

export function maintenanceCost(node: NetNode, mode: MaintenanceMode) {
  const wear = clamp((100 - node.health) / 100, 0.08, 1);
  const base = 900 + node.capacityGbps * 85 + node.tier * 650;
  return Math.round(base * (0.65 + wear) * MAINTENANCE_CONFIG[mode].costMultiplier);
}

export function maintenanceStart(minutes: number, mode: MaintenanceMode) {
  if (mode === 'urgent') return minutes;
  const minuteOfDay = minutes % MINUTES_PER_DAY;
  const twoAm = 120;
  return minutes + (minuteOfDay < twoAm ? twoAm - minuteOfDay : MINUTES_PER_DAY - minuteOfDay + twoAm);
}

export function wholesaleRevenue(state: Pick<GameState, 'districts' | 'wholesaleFixed' | 'mvnoEnabled'>) {
  const fixed = state.wholesaleFixed
    ? state.districts.reduce((sum, district) => sum + district.potential * district.coverage * 1.8, 0)
    : 0;
  const mobile = state.mvnoEnabled
    ? state.districts.reduce((sum, district) => sum + district.population * district.mobileCoverage * 0.42, 0)
    : 0;
  return fixed + mobile;
}

export function wholesaleDemand(state: Pick<GameState, 'wholesaleFixed' | 'mvnoEnabled'>, residential: number, mobile: number) {
  return {
    fixed: state.wholesaleFixed ? residential * 0.18 : 0,
    mobile: state.mvnoEnabled ? mobile * 0.22 : 0,
  };
}
