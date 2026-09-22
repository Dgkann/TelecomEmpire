import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SMART_PAUSE_OPTIONS, type SmartPauseEvent } from '../game/smartPause';
import { fmtClock } from '../game/simulation';
import { incidentCopy } from '../game/incidents';
import { researchById } from '../game/research';
import { researchCopy } from '../game/researchCopy';
import { RANKS } from '../game/progression';
import { TENDER_PROGRAMMES } from '../game/procurement';
import { MARKET_TACTICS, RIVAL_MOVES } from '../game/competition';
import type { CityTender, GameState } from '../game/types';
import { scrollToAnchor } from './side/shared';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { useDialogAccessibility } from './useDialogAccessibility';

const TENDER_STATUS: Record<CityTender['status'], [string, string]> = {
  open: ['call opened', 'çağrı açıldı'],
  delivery: ['won, delivery under way', 'kazanıldı, teslim sürüyor'],
  completed: ['delivered', 'teslim edildi'],
  failed: ['deadline missed', 'süre kaçırıldı'],
  lost: ['tender lost', 'ihale kaybedildi'],
};

// Events keep the English title they were raised with; this rebuilds it from the game in the reader's language.
function eventTitle(event: SmartPauseEvent, game: GameState | null, tr: boolean) {
  const lang = tr ? 1 : 0;
  if (event.kind === 'tenders') {
    const tender = game?.procurement.tenders.find((t) => t.id === event.id);
    if (tender)
      return `${tr ? TENDER_PROGRAMMES[tender.kind].titleTr : TENDER_PROGRAMMES[tender.kind].title}: ${TENDER_STATUS[tender.status][lang]}`;
  }
  if (!tr || !game) return event.title;
  if (event.kind === 'incidents') {
    const incident = game.incidents.find((i) => i.id === event.id);
    if (incident) return incidentCopy(incident, game, true).title;
  }
  if (event.kind === 'offers') return `Yeni teklif: ${event.title.replace(/^New offer: /, '')}`;
  if (event.kind === 'research') {
    const node = researchById(event.id);
    if (node) return `Araştırma tamamlandı: ${researchCopy(node, 'tr').name}`;
  }
  if (event.kind === 'promotion') {
    const rank = RANKS[Number(event.id)];
    if (rank) return `Terfi: ${rank.nameTr}`;
  }
  if (event.kind === 'market') {
    const move = game.competition.moves.find((m) => m.id === event.id);
    if (move)
      return `${game.competitors.find((c) => c.id === move.rivalId)?.name ?? 'Rakip'}: ${RIVAL_MOVES[move.kind].titleTr}`;
    const result = game.competition.history.find((o) => o.id === event.id);
    if (result) return `${MARKET_TACTICS[result.kind].titleTr} tamamlandı`;
  }
  if (event.kind === 'transit') return 'Üst bağlantı doldu';
  return event.title;
}

function SettingsDialog({ close }: { close: () => void }) {
  const locale = useGame((s) => s.locale);
  const preferences = useGame((s) => s.smartPause);
  const setPreference = useGame((s) => s.setSmartPause);
  const [status, setStatus] = useState('');
  const ref = useDialogAccessibility(true, close);
  const tr = locale === 'tr';
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#07121b]/80 p-4 backdrop-blur-sm" onClick={close}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={locale === 'tr' ? 'Akıllı duraklatma ayarları' : 'Smart pause settings'}
        tabIndex={-1}
        className="panel max-h-full w-full min-w-0 max-w-[440px] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-[#19333f] p-5">
          <h2 className="text-xl font-semibold">{t(locale, 'stopWhenDecisionMatters')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{t(locale, 'smartPauseBlurb')}</p>
        </div>
        <div className="p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t(locale, 'pauseOn')}</legend>
            <div className="divide-y divide-white/10">
              {SMART_PAUSE_OPTIONS.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={tr ? option.labelTr : option.label}
                    checked={preferences[option.id]}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#62c7bd]"
                    onChange={(e) =>
                      setStatus(
                        setPreference(option.id, e.target.checked)
                          ? tr
                            ? 'Tercihler bu tarayıcıya kaydedildi.'
                            : 'Preferences saved for this browser.'
                          : tr
                            ? 'Bu sekmede etkin. Tarayıcı depolaması tercihi kaydedemedi.'
                            : 'Active for this tab. Browser storage could not save the preference.',
                      )
                    }
                  />
                  <span>
                    <strong className="block text-sm font-medium">{tr ? option.labelTr : option.label}</strong>
                    <span className="mt-1 block text-xs leading-relaxed text-white/55">
                      {tr ? option.detailTr : option.detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p role="status" className="text-xs text-neon-cyan">
            {status}
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            {tr
              ? 'Varsayılan olarak kapalı. Bu tercihler bu tarayıcıdaki tüm kayıt yuvalarında geçerlidir. Devam ettiğinde mevcut olaylar oyunu yeniden duraklatmaz.'
              : 'Off by default. These preferences apply to all save slots in this browser. Existing events will not pause the game again when you resume.'}
          </p>
          <button className="btn mt-4 w-full" onClick={close}>
            {t(locale, 'done')}
          </button>
          <p className="mt-2 text-center text-[11px] text-white/45">{t(locale, 'gamePausedResume')}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SmartPauseSettings({ children }: { children: ReactNode }) {
  const preferences = useGame((s) => s.smartPause);
  const setSpeed = useGame((s) => s.setSpeed);
  const tr = useGame((s) => s.locale) === 'tr';
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="relative rounded px-0.5 py-1 text-right hover:bg-white/5"
        aria-label={tr ? 'Akıllı duraklatma ayarları' : 'Smart pause settings'}
        title={tr ? 'Hangi olayların oyunu duraklatacağını seç' : 'Choose which events pause the game'}
        onClick={(e) => {
          if (document.querySelector('[aria-modal="true"]')) return;
          e.currentTarget.focus();
          setSpeed(0);
          setOpen(true);
        }}
      >
        {children}
        {Object.values(preferences).some(Boolean) && (
          <span aria-hidden="true" className="absolute -right-0.5 top-0 h-1.5 w-1.5 rounded-full bg-neon-amber" />
        )}
      </button>
      {open && <SettingsDialog close={() => setOpen(false)} />}
    </>
  );
}

export function SmartPauseBanner() {
  const locale = useGame((s) => s.locale);
  const tr = locale === 'tr';
  const game = useGame((s) => s.game);
  const notice = useGame((s) => s.smartPauseNotice);
  const dismiss = useGame((s) => s.dismissSmartPause);
  const setSpeed = useGame((s) => s.setSpeed);
  const blocked = useGame((s) => s.planning || !!s.drillTarget);
  if (!notice) return null;
  const review = (event: SmartPauseEvent) => {
    const store = useGame.getState();
    if (store.planning || store.drillTarget) return;
    if (event.kind === 'incidents') {
      store.setScreen('map');
      if (store.game?.incidents.some((i) => i.id === event.id && !i.resolved)) store.openIncident(event.id);
    } else if (event.kind === 'offers') store.inspectOffer(event.id);
    else if (event.kind === 'transit') {
      store.setScreen('network');
      scrollToAnchor('transit');
    } else if (event.kind === 'tenders') store.setScreen('projects');
    else store.setScreen(event.kind === 'market' ? 'market' : event.kind === 'research' ? 'research' : 'company');
  };
  return (
    <section
      aria-label={tr ? 'Akıllı duraklatma bildirimi' : 'Smart pause notification'}
      className="relative z-30 max-h-36 shrink-0 overflow-y-auto border-b border-neon-amber/30 bg-[#243339] px-3 py-2 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs font-semibold text-neon-amber">
          {tr ? 'Akıllı duraklatma' : 'Smart pause'} · {fmtClock(notice.at)} ·{' '}
          {notice.events.length === 1
            ? tr
              ? 'Yeni olay'
              : 'New event'
            : tr
              ? `${notice.events.length} yeni olay`
              : `${notice.events.length} new events`}
        </p>
        <div className="flex gap-2">
          <button
            className="btn-primary px-2 py-1 text-xs"
            disabled={blocked}
            onClick={() => setSpeed(notice.resumeSpeed)}
          >
            {tr ? `${notice.resumeSpeed}× devam et` : `Resume ${notice.resumeSpeed}×`}
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={dismiss}>
            {t(locale, 'dismiss')}
          </button>
        </div>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {notice.events.map((event) => (
          <li key={event.kind + event.id}>
            <button
              disabled={blocked}
              onClick={() => review(event)}
              className="rounded text-left text-xs text-white/75 underline decoration-white/25 underline-offset-4 hover:text-white disabled:opacity-50"
              aria-label={(tr ? 'İncele: ' : 'Review ') + eventTitle(event, game, tr)}
            >
              {eventTitle(event, game, tr)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
