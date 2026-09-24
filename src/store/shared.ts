import type { PackageSegment } from '../game/types';
import { SAVE_SLOT_COUNT } from '../game/saveStorage';
import type { GameState } from '../game/types';
import type { Locale } from '../ui/i18n';
import type { StoreApi } from 'zustand';
import type { Store, UiState } from './types';

// Helpers the action slices share.

export type SetState = StoreApi<Store>['setState'];
export type GetState = StoreApi<Store>['getState'];

export function initialLocale(): Locale {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('telecom-empire-locale') === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

// Toasts and banners disappear with the session, so they are phrased in the current language on the spot.
export const say = (locale: Locale, en: string, tr: string) => (locale === 'tr' ? tr : en);

export const SEGMENT_TR: Record<PackageSegment, string> = {
  residential: 'konut',
  business: 'kurumsal',
  enterprise: 'büyük kurumsal',
  mobile: 'mobil',
};

export const initialUi: UiState = {
  inspectedOfferId: null,
  smartPauseNotice: null,
  drillTarget: null,
  autoConnect: false,
  planning: false,
  blueprint: [],
  screen: 'map',
  overlay: 'normal',
  tool: null,
  linkFrom: null,
  selection: null,
  focusOn: null,
  openIncidentId: null,
  toasts: [],
  soundOn: true,
  showHelp: false,
  showSaveManager: false,
  activeSaveSlot: 0,
  persistenceError: null,
  locale: initialLocale(),
};

export function withGame(set: (fn: (s: Store) => Partial<Store>) => void, mutate: (g: GameState) => void) {
  set((s) => {
    if (!s.game) return {};
    const g: GameState = { ...s.game };
    mutate(g);
    return { game: g };
  });
}

export const isSaveSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOT_COUNT;
