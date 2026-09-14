import { MINUTES_PER_DAY } from '../game/constants';
import { useGame } from '../store/gameStore';
import { scrollToAnchor } from './side/shared';

export default function ExerciseShortcut({ onNavigate }: { onNavigate?: () => void }) {
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const days = Math.max(0, Math.ceil((game.signalTraining.nextRewardAt - game.minutes) / MINUTES_PER_DAY));
  return (
    <button
      className="btn my-2 w-full whitespace-normal text-left text-xs"
      onClick={() => {
        useGame.getState().setScreen('projects');
        onNavigate?.();
        scrollToAnchor('network-exercises');
      }}
    >
      <span className="block font-semibold">{tr ? 'Kısa ağ görevleri' : 'Quick network exercises'}</span>
      <span className="mt-1 block text-white/60">
        {days === 0
          ? tr
            ? 'Haftalık ödül hazır · Arıza bul veya rota kur'
            : 'Weekly reward ready · Find a fault or build a route'
          : tr
            ? `Ödül ${days} oyun günü sonra · Şimdi ödülsüz alıştırma`
            : `Reward in ${days} game days · Practise without rewards now`}
      </span>
    </button>
  );
}
