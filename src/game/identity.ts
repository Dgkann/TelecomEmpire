import type { GameState } from './types';

export const COMPANY_EMBLEMS = [
  { symbol: '📡', name: 'Antenna' },
  { symbol: '🛰️', name: 'Satellite' },
  { symbol: '🌐', name: 'Globe' },
  { symbol: '⚡', name: 'Lightning' },
  { symbol: '🔷', name: 'Diamond' },
  { symbol: '🦈', name: 'Shark' },
  { symbol: '🐙', name: 'Octopus' },
  { symbol: '🚀', name: 'Rocket' },
] as const;

export function companyIdentityIssue(name: string, locale: 'en' | 'tr' = 'en') {
  const tr = locale === 'tr';
  if (!name.trim()) return tr ? 'Bir şirket adı gir.' : 'Enter a company name.';
  if (name.trim().length > 240) return tr ? '240 karakter veya daha kısa kullan.' : 'Use 240 characters or fewer.';
  if (Array.from(name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    return tr ? 'Kontrol karakteri içermeyen tek satır kullan.' : 'Use a single line without control characters.';
  return null;
}

// Existing imported emblems may be retained; newly chosen emblems come from the shared palette.
export function updateCompanyIdentity(state: GameState, name: string, logo: string): GameState | null {
  if (companyIdentityIssue(name) || (logo !== state.logo && !COMPANY_EMBLEMS.some((e) => e.symbol === logo)))
    return null;
  return { ...state, companyName: name.trim(), logo };
}
