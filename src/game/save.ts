import { SAVE_KEY, SAVE_VERSION } from './constants';
import type { GameState } from './types';

interface SaveSlot {
  version: number;
  savedAt: number;
  state: GameState;
}

export function saveGame(state: GameState) {
  try {
    const slot: SaveSlot = { version: SAVE_VERSION, savedAt: Date.now(), state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(slot));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const slot = JSON.parse(raw) as SaveSlot;
    if (slot.version !== SAVE_VERSION) return null;
    return slot.state;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveMeta(): { savedAt: number; company: string; customers: number } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const slot = JSON.parse(raw) as SaveSlot;
    const subs = slot.state.buildings.reduce(
      (s, b) => (b.segment === 'residential' ? s + b.households * b.connected : s),
      0,
    );
    return { savedAt: slot.savedAt, company: slot.state.companyName, customers: Math.round(subs) };
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
