import { useState } from 'react';
import { createPortal } from 'react-dom';
import { COMPANY_EMBLEMS, companyIdentityIssue } from '../game/identity';
import { RANKS, meetsRank, rankOf } from '../game/progression';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { useDialogAccessibility } from './useDialogAccessibility';

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const locale = useGame((s) => s.locale);
  const game = useGame((s) => s.game)!;
  const update = useGame((s) => s.updateIdentity);
  const setScreen = useGame((s) => s.setScreen);
  const setTool = useGame((s) => s.setTool);
  const select = useGame((s) => s.select);
  const planning = useGame((s) => s.planning || !!s.drillTarget);
  const [name, setName] = useState(game.companyName);
  const [logo, setLogo] = useState(game.logo);
  const [selectedRank, setSelectedRank] = useState(Math.min(game.rank + 1, RANKS.length - 1));
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(false);
  const ref = useDialogAccessibility(true, onClose);
  const rank = RANKS[selectedRank];
  const earned = selectedRank <= game.rank;
  const issue = companyIdentityIssue(name);
  const changed = name.trim() !== game.companyName || logo !== game.logo;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-[#07121b]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Company profile"
        tabIndex={-1}
        className="panel max-h-full w-full min-w-0 max-w-[800px] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#19333f] px-5 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center rounded border border-teal-200/20 bg-[#102633] text-4xl"
              aria-hidden="true"
            >
              {logo}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-neon-cyan">
                {game.cityName} · {rankOf(game).name}
              </p>
              <h2 className="mt-1 break-words text-xl font-semibold">{name.trim() || game.companyName}</h2>
              <p className="mt-1 text-xs text-white/50">{t(locale, 'companyJourneyBlurb')}</p>
            </div>
          </div>
          <button className="btn shrink-0 px-2 text-xs" aria-label="Close company profile" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-5 p-5">
          <section aria-label="Company identity">
            <button
              className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              <span>{t(locale, 'companyIdentity')}</span>
              <span className="text-xs text-neon-cyan">{editing ? 'Hide editor −' : 'Edit name & emblem +'}</span>
            </button>
            {editing && (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (update(name, logo)) {
                    setName(name.trim());
                    setStatus('Company identity updated.');
                  } else setStatus('Check the company name and emblem.');
                }}
              >
                <label className="block text-xs text-white/60">
                  {t(locale, 'companyName')}
                  <input
                    className="mt-1 block w-full rounded border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
                    value={name}
                    maxLength={240}
                    onChange={(e) => {
                      setName(e.target.value);
                      setStatus('');
                    }}
                  />
                </label>
                <fieldset>
                  <legend className="mb-2 text-xs text-white/60">{t(locale, 'companyEmblem')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {COMPANY_EMBLEMS.map((emblem) => (
                      <label
                        key={emblem.name}
                        className={`relative grid h-10 w-10 cursor-pointer place-items-center rounded border text-xl ${logo === emblem.symbol ? 'border-neon-cyan bg-neon-cyan/10' : 'border-white/15 bg-black/10'}`}
                      >
                        <input
                          type="radio"
                          name="company-emblem"
                          aria-label={emblem.name}
                          checked={logo === emblem.symbol}
                          onChange={() => {
                            setLogo(emblem.symbol);
                            setStatus('');
                          }}
                          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded"
                        />
                        <span aria-hidden="true" className="pointer-events-none">
                          {emblem.symbol}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {issue && (
                  <p className="text-xs text-neon-amber" role="alert">
                    {issue}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn-primary text-xs" disabled={!!issue || !changed}>
                    {t(locale, 'applyIdentity')}
                  </button>
                  <p className="text-[11px] text-white/45">{t(locale, 'freeToChange')}</p>
                </div>
                <p role="status" className="text-xs text-neon-cyan">
                  {status}
                </p>
              </form>
            )}
          </section>
          <section className="border-t border-white/10 pt-4" aria-label="Operator journey">
            <h3 className="font-semibold">{t(locale, 'yourOperatorJourney')}</h3>
            <p className="mt-1 text-xs text-white/55">{t(locale, 'inspectLevelBlurb')}</p>
            <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-5" role="group" aria-label="Operator levels">
              {RANKS.map((r, index) => (
                <button
                  key={r.id}
                  aria-pressed={selectedRank === index}
                  onClick={() => setSelectedRank(index)}
                  className={`rounded border px-2 py-2 text-left text-xs ${selectedRank === index ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-white/10 bg-black/10'}`}
                >
                  <span className="mb-1 block text-[10px] text-white/45">
                    {index < game.rank
                      ? 'Earned'
                      : index === game.rank
                        ? 'Current level'
                        : index === game.rank + 1
                          ? 'Next level'
                          : 'Future level'}
                  </span>
                  <span className={index <= game.rank ? 'text-neon-cyan' : 'text-white/70'}>{r.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold">{rank.name}</h4>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-white/55">{rank.blurb}</p>
              </div>
              <div className="text-left text-xs sm:text-right">
                <strong className="text-neon-amber">×{rank.creditMultiplier.toFixed(1)} credit multiplier</strong>
                <p className="mt-1 text-[11px] text-white/40">{t(locale, 'creditDependsOnFinances')}</p>
              </div>
            </div>
            {selectedRank === 1 && <p className="mt-3 text-xs text-neon-cyan">{t(locale, 'chartersAfterDay30')}</p>}
            {selectedRank === 2 && (
              <p className="mt-3 text-xs text-neon-cyan">{t(locale, 'acquisitionsAtThisLevel')}</p>
            )}
            {earned ? (
              <p className="mt-4 rounded border border-neon-cyan/20 bg-neon-cyan/5 p-3 text-sm text-neon-cyan">
                {selectedRank === game.rank ? 'This is your current standing.' : 'You have already earned this level.'}{' '}
                Earned levels are retained when your customer count fluctuates.
              </p>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-white/10">
                  {rank.requirements.map((requirement) => {
                    const progress = requirement.progress(game);
                    const action = requirement.action(game);
                    return (
                      <li key={requirement.label} className="py-3">
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <span className="font-semibold">{requirement.label}</span>
                          <span className={progress >= 1 ? 'text-neon-cyan' : 'text-white/60'}>
                            {requirement.detail(game)}
                          </span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={requirement.label}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(progress * 100)}
                          className="my-2 h-1.5 overflow-hidden rounded bg-white/10"
                        >
                          <div className="h-full bg-neon-cyan" style={{ width: `${progress * 100}%` }} />
                        </div>
                        {progress >= 1 ? (
                          <span className="text-[11px] text-neon-cyan">{t(locale, 'requirementMet')}</span>
                        ) : (
                          <button
                            className="btn text-xs"
                            disabled={planning}
                            onClick={() => {
                              onClose();
                              setScreen(action.screen);
                              select(null);
                              setTool(action.tool ?? null);
                            }}
                          >
                            {action.label}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {planning && <p className="text-xs text-neon-amber">{t(locale, 'finishPlanFirst')}</p>}
                {selectedRank === game.rank + 1 && meetsRank(game, rank) && (
                  <p className="mt-3 text-sm text-neon-cyan">{t(locale, 'allRequirementsMet')}</p>
                )}
                {selectedRank > game.rank + 1 && (
                  <p className="mt-3 text-xs text-white/50">{t(locale, 'earnEarlierLevels')}</p>
                )}
              </>
            )}
          </section>
          <p className="border-t border-white/10 pt-3 text-[11px] text-white/45">
            {t(locale, 'simulationPausedResume')}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CompanyProfile() {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const setSpeed = useGame((s) => s.setSpeed);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label="Company profile"
        title="Company profile and operator journey"
        onClick={(e) => {
          if (document.querySelector('[aria-modal="true"]')) return;
          e.currentTarget.focus();
          setSpeed(0);
          setOpen(true);
        }}
        className="flex w-12 shrink-0 items-center justify-center border-r border-white/[0.07] px-1 text-left transition-colors hover:bg-white/5 sm:w-[160px] sm:justify-start sm:gap-2 sm:px-3 lg:w-[220px] lg:gap-3 lg:px-4"
      >
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-white/10 bg-black/15 text-lg">
          {game.logo}
          <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-ink-800 bg-neon-lime" />
        </span>
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block truncate text-[16px] font-semibold text-white/90">{game.companyName}</span>
          <span className="block truncate text-[11px] text-white/40">
            {game.cityName} <span className="px-1 text-white/20">/</span>{' '}
            <span className="text-neon-cyan/80">
              {locale === 'tr'
                ? [
                    'Yerel servis sağlayıcı',
                    'Şehir operatörü',
                    'Bölgesel operatör',
                    'Ulusal operatör',
                    'Küresel telekom',
                  ][game.rank]
                : rankOf(game).name}
            </span>
          </span>
        </span>
      </button>
      {open && <ProfileDialog onClose={() => setOpen(false)} />}
    </>
  );
}
