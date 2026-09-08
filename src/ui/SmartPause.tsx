import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SMART_PAUSE_OPTIONS, type SmartPauseEvent } from '../game/smartPause';
import { fmtClock } from '../game/simulation';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { useDialogAccessibility } from './useDialogAccessibility';

function SettingsDialog({ close }: { close: () => void }) {
  const locale = useGame((s) => s.locale);
  const preferences = useGame((s) => s.smartPause);
  const setPreference = useGame((s) => s.setSmartPause);
  const [status, setStatus] = useState('');
  const ref = useDialogAccessibility(true, close);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#07121b]/80 p-4 backdrop-blur-sm" onClick={close}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Smart pause settings"
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
            <legend className="mb-2 text-sm font-semibold">Pause on</legend>
            <div className="divide-y divide-white/10">
              {SMART_PAUSE_OPTIONS.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    aria-label={option.label}
                    checked={preferences[option.id]}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#62c7bd]"
                    onChange={(e) =>
                      setStatus(
                        setPreference(option.id, e.target.checked)
                          ? 'Preferences saved for this browser.'
                          : 'Active for this tab. Browser storage could not save the preference.',
                      )
                    }
                  />
                  <span>
                    <strong className="block text-sm font-medium">{option.label}</strong>
                    <span className="mt-1 block text-xs leading-relaxed text-white/55">{option.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p role="status" className="text-xs text-neon-cyan">
            {status}
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            Off by default. These preferences apply to all save slots in this browser. Existing events will not pause
            the game again when you resume.
          </p>
          <button className="btn mt-4 w-full" onClick={close}>
            Done
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="relative rounded px-0.5 py-1 text-right hover:bg-white/5"
        aria-label="Smart pause settings"
        title="Choose which events pause the game"
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
    else if (event.kind === 'tenders') store.setScreen('projects');
    else store.setScreen(event.kind === 'market' ? 'market' : event.kind === 'research' ? 'research' : 'company');
  };
  return (
    <section
      aria-label="Smart pause notification"
      className="relative z-30 max-h-36 shrink-0 overflow-y-auto border-b border-neon-amber/30 bg-[#243339] px-3 py-2 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs font-semibold text-neon-amber">
          Smart pause · {fmtClock(notice.at)} ·{' '}
          {notice.events.length === 1 ? 'New event' : `${notice.events.length} new events`}
        </p>
        <div className="flex gap-2">
          <button
            className="btn-primary px-2 py-1 text-xs"
            disabled={blocked}
            onClick={() => setSpeed(notice.resumeSpeed)}
          >
            Resume {notice.resumeSpeed}×
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={dismiss}>
            Dismiss
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
              aria-label={'Review ' + event.title}
            >
              {event.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
