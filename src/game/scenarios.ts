import { MINUTES_PER_DAY } from './constants';
import { plural } from './util';
import { cityShare, customerCount } from './progression';
import type { GameState, ScenarioId } from './types';

export interface ScenarioObjective {
  label: string;
  labelTr: string;
  progress: (state: GameState) => number;
  detail: (state: GameState) => string;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  nameTr: string;
  description: string;
  descriptionTr: string;
  deadlineDays: number | null;
  objectives: ScenarioObjective[];
}

const bounded = (value: number) => Math.max(0, Math.min(1, value));

const customers = (target: number): ScenarioObjective => ({
  label: `${target.toLocaleString()} ${plural(target, 'customer')}`,
  labelTr: `${target.toLocaleString('tr-TR')} müşteri`,
  progress: (state) => bounded(customerCount(state) / target),
  detail: (state) => `${Math.round(customerCount(state)).toLocaleString()} / ${target.toLocaleString()}`,
});

const districts = (target: number): ScenarioObjective => ({
  label: `${target} ${plural(target, 'district')} licensed`,
  labelTr: `${target} ilçe lisansı`,
  progress: (state) => bounded(state.districts.filter((district) => district.unlocked).length / target),
  detail: (state) => `${state.districts.filter((district) => district.unlocked).length} / ${target}`,
});

const reputation = (target: number): ScenarioObjective => ({
  label: `${target} reputation`,
  labelTr: `${target} itibar`,
  progress: (state) => bounded(state.reputation / target),
  detail: (state) => `${Math.round(state.reputation)} / ${target}`,
});

const debtFree: ScenarioObjective = {
  label: 'No outstanding loans',
  labelTr: 'Ödenmemiş kredi yok',
  progress: (state) => (state.loans.length === 0 && state.money >= 0 ? 1 : 0),
  detail: (state) =>
    state.loans.length === 0 && state.money >= 0
      ? 'clear'
      : `${state.loans.length} ${plural(state.loans.length, 'loan')}`,
};

const marketShare = (target: number): ScenarioObjective => ({
  label: `${Math.round(target * 100)}% city share`,
  labelTr: `%${Math.round(target * 100)} şehir payı`,
  progress: (state) => bounded(cityShare(state) / target),
  detail: (state) => `${Math.round(cityShare(state) * 100)}% / ${Math.round(target * 100)}%`,
});

const mobile: ScenarioObjective = {
  label: 'Launch mobile service',
  labelTr: 'Mobil hizmeti başlat',
  progress: (state) => (state.researchDone.includes('mobile_4g') ? 1 : 0),
  detail: (state) => (state.researchDone.includes('mobile_4g') ? 'launched' : 'not launched'),
};

const dataCentre: ScenarioObjective = {
  label: 'Build a full data centre',
  labelTr: 'Tam kapasiteli veri merkezi kur',
  progress: (state) =>
    state.nodes.some((node) => node.kind === 'datacenter' && node.tier >= 1)
      ? 1
      : state.nodes.some((node) => node.kind === 'datacenter')
        ? 0.25
        : 0,
  detail: (state) => `${state.nodes.filter((node) => node.kind === 'datacenter' && node.tier >= 1).length} / 1`,
};

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'freeplay',
    name: 'Free play',
    nameTr: 'Serbest oyun',
    description: 'Build without a deadline. Reaching Global Telecom remains the long-term victory.',
    descriptionTr: 'Süre sınırı olmadan büyü. Uzun vadeli zafer hedefi Küresel Telekom seviyesidir.',
    deadlineDays: null,
    objectives: [],
  },
  {
    id: 'rapid_expansion',
    name: 'Rapid expansion',
    nameTr: 'Hızlı genişleme',
    description: 'Prove the first network can fund a second district before the launch window closes.',
    descriptionTr: 'İlk şebekenin ikinci ilçeyi finanse edebildiğini süre dolmadan kanıtla.',
    deadlineDays: 180,
    objectives: [customers(1500), districts(2)],
  },
  {
    id: 'service_standard',
    name: 'Service standard',
    nameTr: 'Hizmet standardı',
    description: 'Grow across the city while keeping the operator trusted.',
    descriptionTr: 'Operatörün itibarını koruyarak şehir genelinde büyü.',
    deadlineDays: 450,
    objectives: [customers(5000), districts(4), reputation(75), mobile],
  },
  {
    id: 'debt_free',
    name: 'Debt-free growth',
    nameTr: 'Borçsuz büyüme',
    description: 'Reach scale with a clean balance sheet.',
    descriptionTr: 'Temiz bir bilançoyla hedef müşteri ölçeğine ulaş.',
    deadlineDays: 365,
    objectives: [customers(5000), districts(3), debtFree],
  },
  {
    id: 'market_leader',
    name: 'Market leader',
    nameTr: 'Pazar lideri',
    description: 'Build the full-service operator that leads the final city.',
    descriptionTr: 'Son şehirde lider olan tam hizmet operatörünü kur.',
    deadlineDays: 540,
    objectives: [customers(12000), districts(5), marketShare(0.45), mobile, dataCentre],
  },
];

export const CAMPAIGN_STAGES = [
  { cityName: 'Marmara', scenarioId: 'rapid_expansion' as const },
  { cityName: 'Karadeniz', scenarioId: 'service_standard' as const },
  { cityName: 'Ege', scenarioId: 'market_leader' as const },
];

export const scenarioById = (id: ScenarioId) => SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];

export function scenarioStatus(state: GameState) {
  const scenario = scenarioById(state.scenarioId);
  const objectives = scenario.objectives.map((objective) => ({
    label: objective.label,
    labelTr: objective.labelTr,
    detail: objective.detail(state),
    progress: objective.progress(state),
  }));
  const complete = objectives.length > 0 && objectives.every((objective) => objective.progress >= 1);
  const elapsedDays = state.minutes / MINUTES_PER_DAY;
  const daysLeft = scenario.deadlineDays === null ? null : Math.max(0, Math.ceil(scenario.deadlineDays - elapsedDays));
  const expired = scenario.deadlineDays !== null && elapsedDays > scenario.deadlineDays && !complete;
  return { scenario, objectives, complete, expired, daysLeft };
}
