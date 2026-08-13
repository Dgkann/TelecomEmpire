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
    <nav aria-label="Game screens" className="z-30 flex w-[58px] shrink-0 flex-col items-center border-r border-white/[0.09] bg-[#0f181f] py-3 sm:w-[68px]">
      <div className="mb-3 h-px w-8 bg-white/10" />
      <div className="flex flex-1 flex-col gap-1.5">
        {SCREENS.map(({ id, label, icon: Icon }) => {
          const active = screen === id;
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={`group relative flex h-[52px] w-[50px] flex-col items-center justify-center gap-1 rounded-sm transition-colors sm:h-[54px] sm:w-[54px] ${
                active ? 'border border-white/[0.1] bg-white/[0.055] text-[#8fc0bb]' : 'border border-transparent text-white/40 hover:bg-white/[0.04] hover:text-white/75'
              }`}
              aria-current={active ? 'page' : undefined}
              title={label}
            >
              {active && <span className="absolute -left-[7px] h-7 w-[2px] bg-neon-cyan" />}
              <Icon className="h-5 w-5" />
              <span className="font-display text-[10px] font-semibold uppercase tracking-wider">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-white/[0.07] pt-3">
        <button className="icon-button" onClick={() => setSaveManager(true)} title="Save manager" aria-label="Open save manager"><SaveIcon className="h-4 w-4" /></button>
        <button className="icon-button" onClick={() => setShowHelp(true)} title="How to play" aria-label="How to play"><HelpIcon className="h-4 w-4" /></button>
        <button className="icon-button" onClick={toggleSound} title="Toggle sound" aria-label="Toggle sound"><SoundIcon off={!soundOn} className="h-4 w-4" /></button>
        <button className="icon-button hover:border-neon-red/30 hover:text-neon-red" onClick={quit} title="Save and exit" aria-label="Save and exit"><ExitIcon className="h-4 w-4" /></button>
      </div>
    </nav>
  );
}
