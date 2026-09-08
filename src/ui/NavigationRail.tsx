import { ProjectsIcon } from './icons';
import type { ComponentType, SVGProps } from 'react';
import type { Screen } from '../game/types';
import { useGame } from '../store/gameStore';
import { CompanyIcon, ExitIcon, HelpIcon, MapIcon, NetworkIcon, ResearchIcon, SaveIcon, SoundIcon } from './icons';
import { t, type TranslationKey } from './i18n';

const SCREENS: Array<{ id: Screen; label: TranslationKey; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { id: 'map', label: 'map', icon: MapIcon },
  { id: 'network', label: 'network', icon: NetworkIcon },
  { id: 'company', label: 'company', icon: CompanyIcon },
  { id: 'research', label: 'research', icon: ResearchIcon },
  { id: 'projects', label: 'projects', icon: ProjectsIcon },
];

export default function NavigationRail() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const setSaveManager = useGame((s) => s.setShowSaveManager);
  const quit = useGame((s) => s.quitToMenu);
  const soundOn = useGame((s) => s.soundOn);
  const toggleSound = useGame((s) => s.toggleSound);
  const setShowHelp = useGame((s) => s.setShowHelp);
  const locale = useGame((s) => s.locale);
  const setLocale = useGame((s) => s.setLocale);

  return (
    <nav
      aria-label={t(locale, 'gameScreens')}
      className="order-2 z-30 flex h-14 w-full shrink-0 flex-row items-center border-t border-white/[0.09] bg-[#0f181f] px-1 sm:order-none sm:h-auto sm:w-[68px] sm:flex-col sm:border-r sm:border-t-0 sm:px-0 sm:py-3"
    >
      <div className="hidden h-px w-8 bg-white/10 sm:mb-3 sm:block" />
      <div className="flex min-w-0 flex-1 flex-row justify-around gap-0.5 sm:flex-col sm:justify-start sm:gap-1.5">
        {SCREENS.map(({ id, label: labelKey, icon: Icon }) => {
          const active = screen === id || (id === 'company' && screen === 'market');
          const label = t(locale, labelKey);
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={`group relative flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm transition-colors sm:h-[54px] sm:w-[54px] sm:flex-none sm:gap-1 ${
                active
                  ? 'border border-white/[0.1] bg-white/[0.055] text-[#8fc0bb]'
                  : 'border border-transparent text-white/40 hover:bg-white/[0.04] hover:text-white/75'
              }`}
              aria-current={active ? 'page' : undefined}
              title={label}
              aria-label={label}
            >
              {active && (
                <span className="absolute -top-[3px] h-[2px] w-7 bg-neon-cyan sm:-left-[7px] sm:top-auto sm:h-7 sm:w-[2px]" />
              )}
              <Icon className="h-5 w-5" />
              <span className="font-display text-[9px] font-semibold max-[380px]:hidden sm:text-[10px] sm:uppercase sm:tracking-wider">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-row gap-0.5 border-l border-white/[0.07] pl-1 sm:flex-col sm:gap-1.5 sm:border-l-0 sm:border-t sm:pl-0 sm:pt-3">
        <button
          className="icon-button h-10 w-8 sm:h-9 sm:w-9"
          onClick={(event) => {
            event.currentTarget.focus();
            setSaveManager(true);
          }}
          title={t(locale, 'saveManager')}
          aria-label={t(locale, 'openSaveManager')}
        >
          <SaveIcon className="h-4 w-4" />
        </button>
        <button
          className="icon-button h-10 w-8 sm:h-9 sm:w-9"
          onClick={(event) => {
            event.currentTarget.focus();
            setShowHelp(true);
          }}
          title={t(locale, 'howToPlay')}
          aria-label={t(locale, 'howToPlay')}
        >
          <HelpIcon className="h-4 w-4" />
        </button>
        <button
          className="icon-button hidden h-10 w-8 sm:grid sm:h-9 sm:w-9"
          onClick={toggleSound}
          title={t(locale, 'toggleSound')}
          aria-label={t(locale, 'toggleSound')}
        >
          <SoundIcon off={!soundOn} className="h-4 w-4" />
        </button>
        <button
          className="icon-button h-10 w-8 font-mono text-[10px] sm:h-9 sm:w-9"
          onClick={() => setLocale(locale === 'en' ? 'tr' : 'en')}
          title={t(locale, 'language')}
          aria-label={t(locale, 'language')}
        >
          {locale === 'en' ? 'TR' : 'EN'}
        </button>
        <button
          className="icon-button h-10 w-8 hover:border-neon-red/30 hover:text-neon-red sm:h-9 sm:w-9"
          onClick={quit}
          title={t(locale, 'saveExit')}
          aria-label={t(locale, 'saveExit')}
        >
          <ExitIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
