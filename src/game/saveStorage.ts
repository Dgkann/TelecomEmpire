import { SAVE_KEY, SAVE_VERSION } from './constants';
import { migrate, normalizeAndValidate, parseSaveSlot } from './save';
import type { GameState } from './types';

interface SaveSlot {
  version: number;
  savedAt: number;
  state: GameState;
}

export const SAVE_SLOT_COUNT = 3;

const keyForSlot = (slot: number) => (slot === 0 ? SAVE_KEY : `${SAVE_KEY}-slot-${slot + 1}`);
const safeSlot = (slot: number) => Math.max(0, Math.min(SAVE_SLOT_COUNT - 1, Math.floor(slot)));

export function saveGame(state: GameState, slot = 0) {
  try {
    const normalized = normalizeAndValidate(state as unknown as Record<string, unknown>);
    if (!normalized) return false;
    const payload: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state: normalized };
    localStorage.setItem(keyForSlot(safeSlot(slot)), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot = 0): GameState | null {
  try {
    const raw = localStorage.getItem(keyForSlot(safeSlot(slot)));
    if (!raw) return null;
    const payload = parseSaveSlot(JSON.parse(raw));
    return payload ? migrate(payload.state, payload.version) : null;
  } catch {
    return null;
  }
}

export interface SaveMeta {
  slot: number;
  savedAt: number;
  company: string;
  city: string;
  customers: number;
  minutes: number;
}

export function saveMeta(slot = 0): SaveMeta | null {
  try {
    const resolvedSlot = safeSlot(slot);
    const raw = localStorage.getItem(keyForSlot(resolvedSlot));
    if (!raw) return null;
    const payload = parseSaveSlot(JSON.parse(raw));
    if (!payload) return null;
    const state = migrate(payload.state, payload.version);
    if (!state) return null;
    const fixedSubs = state.buildings.reduce(
      (sum, building) => (building.segment === 'residential' ? sum + building.households * building.connected : sum),
      0,
    );
    const mobileSubs = state.districts.reduce((sum, district) => sum + district.mobileSubs, 0);
    return {
      slot: resolvedSlot,
      savedAt: payload.savedAt,
      company: state.companyName,
      city: state.cityName,
      customers: Math.round(fixedSubs + mobileSubs) + state.contracts.length,
      minutes: state.minutes,
    };
  } catch {
    return null;
  }
}

export function listSaveMeta() {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => saveMeta(slot));
}

export function clearSave(slot = 0) {
  try {
    localStorage.removeItem(keyForSlot(safeSlot(slot)));
    return true;
  } catch {
    return false;
  }
}

export function exportSave(slot = 0): string | null {
  try {
    return localStorage.getItem(keyForSlot(safeSlot(slot)));
  } catch {
    return null;
  }
}

export function importSave(raw: string, slot = 0): GameState | null {
  try {
    const parsed = parseSaveSlot(JSON.parse(raw));
    if (!parsed) return null;
    const state = migrate(parsed.state, parsed.version);
    if (!state) return null;
    const payload: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state };
    localStorage.setItem(keyForSlot(safeSlot(slot)), JSON.stringify(payload));
    return state;
  } catch {
    return null;
  }
}
