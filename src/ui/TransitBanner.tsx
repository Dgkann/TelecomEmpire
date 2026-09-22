import { fmtMoney } from '../game/economy';
import { transitHeadroom } from '../game/operations';
import { useGame } from '../store/gameStore';
import { scrollToAnchor } from './side/shared';

// A full upstream drags satisfaction down in every district at once and the map cannot show it,
// so it is spelled out here with the fix one click away.
export default function TransitBanner() {
  const game = useGame((s) => s.game);
  const tr = useGame((s) => s.locale) === 'tr';
  const setTransitTier = useGame((s) => s.setTransitTier);
  const setScreen = useGame((s) => s.setScreen);
  if (!game || game.gameOver) return null;
  const { peak, capacity, use, next } = transitHeadroom(game);
  if (use < 1) return null;
  const number = (value: number, digits: number) =>
    value.toLocaleString(tr ? 'tr-TR' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const figures = `${number(peak, 1)} / ${number(capacity, 0)} Gbps`;
  return (
    <section
      aria-label={tr ? 'Üst bağlantı uyarısı' : 'Upstream transit warning'}
      className="relative z-30 shrink-0 border-b border-neon-red/40 bg-[#35151d] px-3 py-2 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neon-red">
          {/* Only the unchanging sentence is announced; the live figures would repeat every step. */}
          <strong role="alert" className="font-semibold">
            {tr ? 'Üst bağlantı dolu.' : 'Upstream transit is full.'}
          </strong>{' '}
          {tr
            ? `${figures}. Tüm ilçelerde memnuniyet düşüyor; yeni noktalar bunu çözmez.`
            : `${figures}. Satisfaction is falling in every district; new sites will not fix it.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {next && (
            <button className="btn-primary px-2 py-1 text-xs" onClick={() => setTransitTier(game.transitTier + 1)}>
              {tr
                ? `${next.labelTr} al · ${next.capacity} Gbps · ${fmtMoney(next.monthly)}/ay`
                : `Switch to ${next.label} · ${next.capacity} Gbps · ${fmtMoney(next.monthly)}/mo`}
            </button>
          )}
          <button
            className="btn px-2 py-1 text-xs"
            onClick={() => {
              setScreen('network');
              scrollToAnchor(next ? 'transit' : 'interconnect');
            }}
          >
            {next
              ? tr
                ? 'Transit seçenekleri'
                : 'Transit options'
              : tr
                ? 'Bağlantı seçenekleri'
                : 'Interconnect options'}
          </button>
        </div>
      </div>
    </section>
  );
}
