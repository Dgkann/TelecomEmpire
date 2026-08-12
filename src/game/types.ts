// Pure data only, no React and no DOM. The sim turns one GameState into the next.

export type Difficulty = 'casual' | 'standard' | 'hard';
export type Speed = 0 | 1 | 2 | 4;

export type BuildingKind =
  | 'house'
  | 'apartment'
  | 'office'
  | 'shop'
  | 'industrial'
  | 'hospital'
  | 'university'
  | 'park';

export type CustomerSegment = 'residential' | 'business' | 'enterprise';
export type PackageSegment = CustomerSegment | 'mobile';

export type BandId = '700' | '1800' | '2600' | '3500' | '26000';

export interface SpectrumHolding {
  band: BandId;
  blocks: number;
  wonAt: number;
  paid: number;
}

export interface AuctionBid {
  bidderId: string;
  bidderName: string;
  amount: number;
}

export interface Auction {
  id: string;
  band: BandId;
  blocks: number;
  reserve: number;
  // Game minute the sealed bids are opened.
  closesAt: number;
  playerBid: number | null;
  result: null | {
    winnerId: string;
    winnerName: string;
    price: number;
    bids: AuctionBid[];
  };
}

export interface Building {
  id: string;
  gx: number;
  gy: number;
  districtId: string;
  kind: BuildingKind;
  // Visual height in "floors", drives the isometric extrusion.
  floors: number;
  households: number;
  segment: CustomerSegment;
  // 0..1 share of this building's households subscribed to the player.
  connected: number;
  // Timestamp (game minutes) of the last connection event, for the pop animation.
  lastConnectedAt: number;
  seed: number;
}

export interface District {
  id: string;
  name: string;
  color: string;
  cells: Array<{ gx: number; gy: number }>;
  population: number;
  potential: number;
  incomeLevel: 'low' | 'medium' | 'high';
  businessDensity: number; // 0..1
  demandFactor: number; // 0..1 appetite for bandwidth
  // 0..1 share of the district's potential already held by rivals.
  competition: number;
  // 0..1 share of the district your fixed access network reaches.
  coverage: number;
  // 0..1 radio coverage, driven by towers and the spectrum they run on.
  mobileCoverage: number;
  // Mobile subscribers here. Unlike fixed lines these are not tied to a building.
  mobileSubs: number;
  satisfaction: number; // 0..100
  unlocked: boolean;
  entryCost: number;
  center: { gx: number; gy: number };
}

export type NodeKind = 'core' | 'pop' | 'access' | 'datacenter' | 'tower';

export interface NetNode {
  id: string;
  kind: NodeKind;
  name: string;
  gx: number;
  gy: number;
  districtId: string;
  tier: number; // upgrade level, 1-based
  capacityGbps: number;
  trafficGbps: number;
  // 0..100, degrades with incidents and age, restored by maintenance.
  health: number;
  down: boolean;
  builtAt: number;
  // Last time a crew went over it. Ageing is measured from here, not from build.
  servicedAt: number;
}

export interface NetLink {
  id: string;
  aId: string;
  bId: string;
  capacityGbps: number;
  trafficGbps: number;
  down: boolean;
  tier: number;
  length: number;
  builtAt: number;
}

export interface Package {
  id: string;
  name: string;
  speedMbps: number;
  price: number;
  segment: PackageSegment;
  active: boolean;
  subscribers: number;
}

export interface EnterpriseContract {
  id: string;
  clientName: string;
  districtId: string;
  buildingId: string;
  bandwidthGbps: number;
  monthlyRevenue: number;
  slaPercent: number;
  // Minutes of downtime accrued in the current month.
  downtimeMinutes: number;
  penaltyPaid: number;
  startedAt: number;
  termMonths: number;
  segment: 'business' | 'enterprise';
}

export interface ContractOffer extends Omit<EnterpriseContract, 'downtimeMinutes' | 'penaltyPaid' | 'startedAt'> {
  expiresAt: number;
  signingBonus: number;
}

export type IncidentKind =
  | 'fiber_cut'
  | 'router_failure'
  | 'switch_failure'
  | 'ddos'
  | 'power_outage'
  | 'cooling_failure'
  | 'dns_failure'
  | 'bgp_leak'
  | 'bad_upgrade'
  | 'overheating';

export interface Incident {
  id: string;
  kind: IncidentKind;
  title: string;
  description: string;
  targetId: string;
  targetType: 'node' | 'link';
  districtId: string;
  startedAt: number;
  // Game minutes of repair work remaining; null while unassigned.
  repairMinutesLeft: number | null;
  repairTotalMinutes: number;
  assignedTechId: string | null;
  affected: number;
  resolved: boolean;
  degrade: boolean;
}

export interface Technician {
  id: string;
  name: string;
  skill: number; // 1..5
  salary: number;
  experience: number;
  incidentId: string | null;
  gx: number;
  gy: number;
  homeGx: number;
  homeGy: number;
  state: 'idle' | 'driving' | 'working' | 'returning';
}

export type StaffRole =
  | 'network_engineer'
  | 'noc_engineer'
  | 'field_tech'
  | 'support'
  | 'sales'
  | 'security';

export interface Employee {
  id: string;
  name: string;
  role: StaffRole;
  salary: number;
  skill: number;
  experience: number;
}

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  days: number;
  requires: string[];
  unlocks: string[];
  branch: 'fixed' | 'mobile' | 'ops';
  tier: number;
}

export interface Competitor {
  id: string;
  name: string;
  color: string;
  aggression: number;
  // districtId -> 0..1 market share, derived each day from relative pull
  share: Record<string, number>;
  priceIndex: number;
  // Rivals run a balance sheet and spend it on rollout, price and technology.
  cash: number;
  // districtId -> 0..1 of the district their own access network reaches
  coverage: Record<string, number>;
  mobileCoverage: Record<string, number>;
  tech: number;
  lastMove: string | null;
}

export interface Loan {
  id: string;
  principal: number;
  remaining: number;
  // Annual rate, charged monthly on the outstanding balance.
  rateAnnual: number;
  monthlyPayment: number;
  termMonths: number;
  takenAt: number;
}

export interface Regulation {
  id: string;
  kind: 'coverage' | 'price_cap';
  title: string;
  detail: string;
  // Null for obligations that apply to the whole company.
  districtId: string | null;
  target: number;
  dueAt: number;
  fine: number;
  status: 'pending' | 'met' | 'failed';
}

export type ChurnReason = 'price' | 'outage' | 'congestion' | 'support';

export interface ChurnEvent {
  id: string;
  at: number;
  districtId: string;
  count: number;
  // Who took them. Null when they simply dropped off the network.
  toId: string | null;
  toName: string;
  reason: ChurnReason;
}

export interface SocialPost {
  id: string;
  handle: string;
  text: string;
  stars: number;
  at: number;
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}

export interface FinanceSnapshot {
  revenueResidential: number;
  revenueBusiness: number;
  revenueEnterprise: number;
  costSalaries: number;
  costPower: number;
  costMaintenance: number;
  costTransit: number;
  costMarketing: number;
  penalties: number;
}

export interface NetworkStats {
  demandGbps: number;
  servedGbps: number;
  coreUtilization: number;
  packetLoss: number; // 0..1
  latencyMs: number;
  health: number; // 0..100
  // districtId -> true when the district currently has no live path to core.
  outages: Record<string, boolean>;
}

export type OverlayMode = 'normal' | 'load' | 'coverage' | 'rivals';
export type Screen = 'map' | 'network' | 'company' | 'research';

export interface GameState {
  version: number;
  companyName: string;
  logo: string;
  difficulty: Difficulty;
  cityName: string;

  // Total elapsed game minutes since the start date.
  minutes: number;
  speed: Speed;

  money: number;
  reputation: number; // 0..100
  researchPoints: number;

  gridSize: number;
  buildings: Building[];
  districts: District[];
  nodes: NetNode[];
  links: NetLink[];

  packages: Package[];
  contracts: EnterpriseContract[];
  offers: ContractOffer[];

  incidents: Incident[];
  technicians: Technician[];
  employees: Employee[];

  researchDone: string[];
  researchActive: { id: string; daysLeft: number } | null;

  competitors: Competitor[];
  posts: SocialPost[];
  log: LogEntry[];

  stats: NetworkStats;
  finance: FinanceSnapshot;
  history: Array<{ month: number; revenue: number; expense: number; customers: number }>;
  monthAccumulator: { revenue: number; expense: number };

  marketingBudget: number;
  retentionBudget: number;
  churn: ChurnEvent[];

  // Daily peak demand in Gbps, oldest first. Feeds the forecast.
  demandHistory: number[];
  dayPeakDemand: number;

  regulations: Regulation[];
  nextRegulationAt: number;

  loans: Loan[];
  // Game minute your balance first went past the credit limit, null when solvent.
  insolventSince: number | null;
  gameOver: { reason: string; at: number } | null;
  transitTier: number;
  backupTransit: boolean;
  autoDispatch: boolean;

  spectrum: SpectrumHolding[];
  auction: Auction | null;
  nextAuctionAt: number;

  // A city-wide traffic surge in progress (match, concert, holiday).
  activeEvent: { name: string; mul: number; endsAt: number; blurb: string } | null;
  nextEventAt: number;
  nextGrowthAt: number;

  tutorialStep: number;
  tutorialDone: boolean;
  autosaveAt: number;
  rngSeed: number;
}
