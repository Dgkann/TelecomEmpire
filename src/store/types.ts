import type { CapacityUpgrade } from '../game/capacityLab';
import type { BuildStep } from '../game/blueprint';
import type { NegotiationMode } from '../game/contracts';
import type { ExpansionKind } from '../game/expansion';
import type { FailureTarget } from '../game/failureDrill';
import type { RepairMode } from '../game/incidents';
import type { NewGameOptions } from '../game/newGame';
import type { SmartPauseKind, SmartPauseNotice, SmartPausePreferences } from '../game/smartPause';
import type {
  CampaignKind,
  DataCenterMode,
  EnergyPlan,
  GameState,
  InterconnectPlan,
  MaintenanceMode,
  MarketTactic,
  NodeKind,
  OverlayMode,
  Screen,
  Speed,
  StaffRole,
  TrafficPolicy,
} from '../game/types';
import type { Locale } from '../ui/i18n';

export type BuildTool = NodeKind | 'fiber' | null;

export interface Selection {
  type: 'node' | 'link' | 'district' | 'building';
  id: string;
}

export interface Toast {
  id: string;
  text: string;
  tone: 'good' | 'bad' | 'info';
  gx?: number;
  gy?: number;
}

export interface UiState {
  inspectedOfferId: string | null;
  smartPauseNotice: SmartPauseNotice | null;
  drillTarget: FailureTarget | null;
  autoConnect: boolean;
  planning: boolean;
  blueprint: BuildStep[];
  screen: Screen;
  overlay: OverlayMode;
  tool: BuildTool;
  linkFrom: string | null;
  selection: Selection | null;
  focusOn: { gx: number; gy: number; at: number } | null;
  openIncidentId: string | null;
  toasts: Toast[];
  soundOn: boolean;
  showHelp: boolean;
  showSaveManager: boolean;
  activeSaveSlot: number;
  persistenceError: string | null;
  locale: Locale;
}

export interface Store extends UiState {
  commissionUpgrades: (items: CapacityUpgrade[]) => boolean;
  launchMarketOperation: (districtId: string, kind: MarketTactic) => boolean;
  endMarketOperation: (id: string) => boolean;
  bidOnTender: (id: string, price: number) => boolean;
  withdrawTender: (id: string) => boolean;
  inspectOffer: (id: string | null) => void;
  smartPause: SmartPausePreferences;
  setSmartPause: (kind: SmartPauseKind, enabled: boolean) => boolean;
  dismissSmartPause: () => void;
  beginFailureDrill: (target: FailureTarget) => void;
  endFailureDrill: () => void;
  setAutoConnect: (value: boolean) => void;
  addBackupRoute: (nodeId: string) => void;
  beginBlueprint: () => void;
  discardBlueprint: () => void;
  undoBlueprint: () => void;
  commitBlueprint: () => void;
  game: GameState | null;
  started: boolean;
  newGame: (opts: NewGameOptions, slot?: number) => boolean;
  continueGame: (slot?: number) => boolean;
  resetSave: () => void;
  save: () => boolean;
  updateIdentity: (name: string, logo: string) => boolean;
  quitToMenu: () => boolean;
  advanceCampaign: () => boolean;
  tick: () => void;
  startSignalTraining: (size: 4 | 5, mode?: 'routing' | 'fault' | 'restoration') => void;
  rotateSignalTile: (index: number) => void;
  submitSignalTraining: () => boolean;
  closeSignalTraining: () => void;
  setSpeed: (speed: Speed) => void;
  setScreen: (screen: Screen) => void;
  setOverlay: (overlay: OverlayMode) => void;
  setTool: (tool: BuildTool) => void;
  select: (selection: Selection | null) => void;
  focus: (gx: number, gy: number) => void;
  openIncident: (id: string | null) => void;
  toast: (text: string, tone?: Toast['tone'], gx?: number, gy?: number) => void;
  dismissToast: (id: string) => void;
  toggleSound: () => void;
  setShowHelp: (v: boolean) => void;
  setShowSaveManager: (v: boolean) => void;
  setLocale: (locale: Locale) => void;
  saveToSlot: (slot: number) => boolean;
  placeNode: (kind: NodeKind, gx: number, gy: number) => void;
  clickNodeForLink: (nodeId: string) => void;
  cancelBuild: () => void;
  upgradeNode: (id: string) => void;
  repairNode: (id: string) => void;
  scheduleMaintenance: (id: string, mode: MaintenanceMode) => void;
  cancelMaintenance: (orderId: string) => void;
  sellNode: (id: string) => void;
  upgradeLink: (id: string) => void;
  sellLink: (id: string) => void;
  unlockDistrict: (id: string) => void;
  launchDistrict: (id: string, kind: ExpansionKind) => void;
  updatePackage: (id: string, patch: { price?: number; speedMbps?: number; active?: boolean; name?: string }) => void;
  startResearch: (id: string) => void;
  acceptOffer: (id: string, mode?: NegotiationMode) => void;
  declineOffer: (id: string) => void;
  dispatchTech: (incidentId: string, mode: RepairMode, techId?: string) => void;
  hireTechnician: () => void;
  hireEmployee: (role: StaffRole) => void;
  fireStaff: (id: string) => void;
  placeBid: (amount: number) => void;
  dismissAuction: () => void;
  setMarketing: (value: number) => void;
  setRetention: (value: number) => void;
  startCampaign: (districtId: string, kind: CampaignKind) => void;
  setTrafficPolicy: (policy: TrafficPolicy) => void;
  setInterconnectPlan: (plan: InterconnectPlan) => void;
  toggleWholesaleFixed: () => void;
  toggleMvno: () => void;
  setDataCenterMode: (nodeId: string, mode: DataCenterMode) => void;
  takeLoan: (principal: number, termMonths: number) => void;
  repayLoan: (id: string) => void;
  setTransitTier: (tier: number) => void;
  toggleBackupTransit: () => void;
  setEnergyPlan: (plan: EnergyPlan) => boolean;
  installSolar: (nodeId: string) => boolean;
  toggleAutoDispatch: () => void;
  advanceTutorial: (stepIndex: number) => void;
  skipTutorial: () => void;
  claimMilestone: (id: string) => void;
  resolveBoardDecision: (id: string, option: string) => void;
  acquireRival: (id: string) => void;
  claimCharter: () => void;
}
