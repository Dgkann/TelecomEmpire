import { MARKET_TACTICS, RIVAL_MOVES } from './competition';
import { TENDER_PROGRAMMES } from './procurement';
import type { GameState, Speed } from './types';
import { RANKS } from './progression';
import { researchById } from './research';
import { transitHeadroom } from './operations';

export const SMART_PAUSE_KEY = 'telecom-empire-smart-pause';
export const SMART_PAUSE_OPTIONS = [
  {
    id: 'market',
    label: 'Market competition',
    labelTr: 'Pazar rekabeti',
    detail: 'Pause for rival offensives and completed commercial operations.',
    detailTr: 'Rakip saldırılarında ve biten ticari operasyonlarda duraklat.',
  },
  {
    id: 'tenders',
    label: 'City project updates',
    labelTr: 'Şehir projesi gelişmeleri',
    detail: 'Pause for a new call, an award, completed delivery or a missed deadline.',
    detailTr: 'Yeni çağrı, ihale sonucu, tamamlanan teslim veya kaçırılan süre olduğunda duraklat.',
  },
  {
    id: 'incidents',
    label: 'New network incidents',
    labelTr: 'Yeni şebeke arızaları',
    detail: 'Stop before the outage continues through more simulation steps.',
    detailTr: 'Kesinti daha fazla simülasyon adımı sürmeden dur.',
  },
  {
    id: 'transit',
    label: 'Upstream transit full',
    labelTr: 'Üst bağlantı doldu',
    detail: 'Stop when upstream transit runs out, before every district loses satisfaction.',
    detailTr: 'Üst bağlantı dolduğunda, tüm ilçelerin memnuniyeti düşmeden önce dur.',
  },
  {
    id: 'offers',
    label: 'New contract offers',
    labelTr: 'Yeni sözleşme teklifleri',
    detail: 'Give yourself time to inspect the terms and service requirements.',
    detailTr: 'Şartları ve hizmet gereksinimlerini incelemek için zaman kazan.',
  },
  {
    id: 'research',
    label: 'Research completed',
    labelTr: 'Araştırma tamamlandı',
    detail: 'Choose the next technology or use your new capability.',
    detailTr: 'Sıradaki teknolojiyi seç ya da yeni yeteneğini kullan.',
  },
  {
    id: 'promotion',
    label: 'Operator promotion',
    labelTr: 'Operatör terfisi',
    detail: 'Review your new standing and the next growth target.',
    detailTr: 'Yeni konumunu ve sıradaki büyüme hedefini gözden geçir.',
  },
] as const;
export type SmartPauseKind = (typeof SMART_PAUSE_OPTIONS)[number]['id'];
export type SmartPausePreferences = Record<SmartPauseKind, boolean>;
export const DEFAULT_SMART_PAUSE: SmartPausePreferences = {
  market: false,
  tenders: false,
  incidents: false,
  transit: false,
  offers: false,
  research: false,
  promotion: false,
};
export interface SmartPauseEvent {
  kind: SmartPauseKind;
  id: string;
  title: string;
}
export interface SmartPauseNotice {
  at: number;
  resumeSpeed: Exclude<Speed, 0>;
  events: SmartPauseEvent[];
}

export function parseSmartPausePreferences(value: unknown): SmartPausePreferences {
  const result = { ...DEFAULT_SMART_PAUSE };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const { id } of SMART_PAUSE_OPTIONS)
    if (typeof (value as Record<string, unknown>)[id] === 'boolean') result[id] = (value as SmartPausePreferences)[id];
  return result;
}
export function loadSmartPausePreferences(): SmartPausePreferences {
  try {
    return parseSmartPausePreferences(JSON.parse(localStorage.getItem(SMART_PAUSE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SMART_PAUSE };
  }
}

// Compare each simulation step, not each rendered frame: 4x must stop at the first relevant event.
export function smartPauseEvents(
  before: GameState,
  after: GameState,
  preferences: SmartPausePreferences,
): SmartPauseEvent[] {
  if (after.gameOver) return [];
  const events: SmartPauseEvent[] = [];
  if (preferences.incidents) {
    const known = new Set(before.incidents.map((i) => i.id));
    for (const incident of after.incidents)
      if (!incident.resolved && !known.has(incident.id))
        events.push({ kind: 'incidents', id: incident.id, title: incident.title });
  }
  if (preferences.transit && transitHeadroom(before).use < 1 && transitHeadroom(after).use >= 1)
    events.push({ kind: 'transit', id: String(after.minutes), title: 'Upstream transit is full' });
  if (preferences.offers) {
    const known = new Set(before.offers.map((o) => o.id));
    for (const offer of after.offers)
      if (offer.expiresAt > after.minutes && !known.has(offer.id))
        events.push({ kind: 'offers', id: offer.id, title: 'New offer: ' + offer.clientName });
  }
  if (preferences.research) {
    const known = new Set(before.researchDone);
    for (const id of after.researchDone)
      if (!known.has(id))
        events.push({ kind: 'research', id, title: 'Research complete: ' + (researchById(id)?.name ?? id) });
  }
  if (preferences.promotion && after.rank > before.rank)
    events.push({ kind: 'promotion', id: String(after.rank), title: 'Promoted to ' + RANKS[after.rank].name });
  if (preferences.tenders) {
    for (const tender of after.procurement.tenders) {
      const prior = before.procurement.tenders.find((t) => t.id === tender.id);
      if (!prior || prior.status !== tender.status)
        events.push({
          kind: 'tenders',
          id: tender.id,
          title: TENDER_PROGRAMMES[tender.kind].title + ': ' + tender.status,
        });
    }
  }
  if (preferences.market) {
    for (const move of after.competition.moves)
      if (!before.competition.moves.some((m) => m.id === move.id))
        events.push({
          kind: 'market',
          id: move.id,
          title:
            (after.competitors.find((c) => c.id === move.rivalId)?.name ?? 'Rival') +
            ': ' +
            RIVAL_MOVES[move.kind].title,
        });
    for (const result of after.competition.history)
      if (!before.competition.history.some((o) => o.id === result.id))
        events.push({ kind: 'market', id: result.id, title: MARKET_TACTICS[result.kind].title + ' completed' });
  }
  return events;
}
