import { clamp } from './util';
import type { Employee, GameState, StaffRole, Technician } from './types';

export const STAFF_ROLE_INFO: Record<StaffRole, { label: string; effect: string }> = {
  network_engineer: {
    label: 'Network engineer',
    effect: 'Reduces maintenance costs, improves equipment recovery, and generates research points.',
  },
  noc_engineer: {
    label: 'NOC engineer',
    effect: 'Reduces incident frequency and duration while accelerating research work.',
  },
  field_tech: {
    label: 'Field operations',
    effect: 'Coordinates field crews and shortens repair work across the company.',
  },
  support: {
    label: 'Customer support',
    effect: 'Raises satisfaction according to team skill and the number of customers served.',
  },
  sales: {
    label: 'Sales',
    effect: 'Improves customer growth, contract frequency, and contract signing bonuses.',
  },
  security: {
    label: 'Security',
    effect: 'Reduces DDoS frequency and the capacity lost during an attack.',
  },
};

function rolePower(state: GameState, role: StaffRole) {
  return state.employees
    .filter((employee) => employee.role === role)
    .reduce((sum, employee) => sum + employee.skill + Math.min(0.75, employee.experience / 480), 0);
}

export function staffModifiers(state: GameState) {
  const network = rolePower(state, 'network_engineer');
  const noc = rolePower(state, 'noc_engineer');
  const field = rolePower(state, 'field_tech');
  const support = rolePower(state, 'support');
  const sales = rolePower(state, 'sales');
  const security = rolePower(state, 'security');
  const customers =
    state.buildings.reduce((sum, building) => sum + building.households * building.connected, 0) +
    state.districts.reduce((sum, district) => sum + district.mobileSubs, 0);
  const supportLoad = Math.max(1, customers / 1500);

  return {
    maintenanceCostMul: clamp(1 - network * 0.025, 0.65, 1),
    healthRecoveryPerStep: network * 0.001,
    incidentRateMul: clamp(1 - noc * 0.035, 0.55, 1),
    incidentDurationMul: clamp(1 - noc * 0.03 - field * 0.02, 0.55, 1),
    supportSatisfaction: clamp((support * 2.2) / supportLoad, 0, 12),
    customerGrowthMul: clamp(1 + sales * 0.04, 1, 1.6),
    offerRateMul: clamp(1 + sales * 0.08, 1, 2),
    signingBonusMul: clamp(1 + sales * 0.03, 1, 1.4),
    ddosRateMul: clamp(1 - security * 0.08, 0.3, 1),
    ddosImpactMul: clamp(1 - security * 0.1, 0.35, 1),
    researchPointsPerDay: Math.max(0, Math.round(network + noc * 0.5)),
    researchSpeedMul: clamp(1 + network * 0.025 + noc * 0.01, 1, 1.35),
  };
}

export function trainEmployee(employee: Employee, amount = 1): Employee {
  const experience = employee.experience + amount;
  const skill = Math.min(5, Math.max(employee.skill, 1 + Math.floor(experience / 120)));
  return { ...employee, experience, skill };
}

export function trainTechnician(technician: Technician, amount = 30): Technician {
  const experience = technician.experience + amount;
  const skill = Math.min(5, Math.max(technician.skill, 1 + Math.floor(experience / 90)));
  return { ...technician, experience, skill };
}
