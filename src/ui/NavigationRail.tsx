import type { ComponentType, SVGProps } from 'react';
import type { Screen } from '../game/types';
import { useGame } from '../store/gameStore';
import { CompanyIcon, ExitIcon, HelpIcon, MapIcon, NetworkIcon, ResearchIcon, SaveIcon, SoundIcon } from './icons';

const SCREENS: Array<{ id: Screen; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'network', label: 'Network', icon: NetworkIcon },
  { id: 'company', label: 'Company', icon: CompanyIcon },
  { id: 'research', label: 'Research', icon: ResearchIcon },
];

export default function NavigationRail() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const setSaveManager = useGame((s) => s.setShowSaveManager);
  const quit = useGame((s) => s.quitToMenu);
  const soundOn = useGame((s) => s.soundOn);
  const toggleSound = useGame((s) => s.toggleSound);
  const setShowHelp = useGame((s) => s.setShowHelp);

  return (
    <nav
      aria-label="Game screens"
      className="order-2 z-30 flex h-14 w-full shrink-0 flex-row items-center border-t border-white/[0.09] bg-[#0f181f] px-1 sm:order-none sm:h-auto sm:w-[68px] sm:flex-col sm:border-r sm:border-t-0 sm:px-0 sm:py-3"
    >
      <div className="hidden h-px w-8 bg-white/10 sm:mb-3 sm:block" />
      <div className="flex min-w-0 flex-1 flex-row justify-around gap-0.5 sm:flex-col sm:justify-start sm:gap-1.5">
        {SCREENS.map(({ id, label, icon: Icon }) => {
          const active = screen === id;
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
            >
              {active && (
                <span className="absolute -top-[3px] h-[2px] w-7 bg-neon-cyan sm:-left-[7px] sm:top-auto sm:h-7 sm:w-[2px]" />
              )}
              <Icon className="h-5 w-5" />
              <span className="font-display text-[10px] font-semibold uppercase tracking-wider">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-row gap-0.5 border-l border-white/[0.07] pl-1 sm:flex-col sm:gap-1.5 sm:border-l-0 sm:border-t sm:pl-0 sm:pt-3">
        <button
          className="icon-button h-10 w-8 sm:h-9 sm:w-9"
          onClick={() => setSaveManager(true)}
          title="Save manager"
          aria-label="Open save manager"
        >
          <SaveIcon className="h-4 w-4" />
        </button>
        <button
          className="icon-button h-10 w-8 sm:h-9 sm:w-9"
          onClick={() => setShowHelp(true)}
          title="How to play"
          aria-label="How to play"
        >
          <HelpIcon className="h-4 w-4" />
        </button>
        <button
          className="icon-button hidden h-10 w-8 sm:grid sm:h-9 sm:w-9"
          onClick={toggleSound}
          title="Toggle sound"
          aria-label="Toggle sound"
        >
          <SoundIcon off={!soundOn} className="h-4 w-4" />
        </button>
        <button
          className="icon-button h-10 w-8 hover:border-neon-red/30 hover:text-neon-red sm:h-9 sm:w-9"
          onClick={quit}
          title="Save and exit"
          aria-label="Save and exit"
        >
          <ExitIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
