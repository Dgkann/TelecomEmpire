import { useState } from 'react';
import { MINUTES_PER_DAY } from '../game/constants';
import { fmtMoney } from '../game/economy';
import { signalConnection, TRAINING_REWARD, TRAINING_RESEARCH, TRAINING_LAB_DAYS } from '../game/signalTraining';
import { useGame } from '../store/gameStore';
import { useDialogAccessibility } from './useDialogAccessibility';

export function SignalTrainingCard() {
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const start = useGame((s) => s.startSignalTraining);
  const training = game.signalTraining;
  const days = Math.max(0, Math.ceil((training.nextRewardAt - game.minutes) / MINUTES_PER_DAY));
  return (
    <section
      id="network-exercises"
      className="panel border-neon-cyan/30 p-4 sm:p-5"
      aria-label={tr ? 'Sinyal rotası mini oyunu' : 'Signal routing mini-game'}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">{tr ? 'Kısa ağ görevleri' : 'Quick network exercises'}</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/65">
            {tr
              ? 'Sıfırdan sinyal rotası kur veya çalışan hattaki tek yanlış kabloyu bul. Arıza bulma, kısa bir mola için uygundur. Şirket zamanı durur; süre sınırı, giriş ücreti ve başarısızlık cezası yok.'
              : 'Build a signal route or find the one incorrect cable in a working line. Fault finding is suited to a short break. Company time pauses; there is no timer, entry fee or failure penalty.'}
          </p>
          <p className="mt-2 text-xs text-neon-amber">
            {days === 0
              ? `${tr ? 'Tamamlama ödülü' : 'Completion reward'}: ${fmtMoney(TRAINING_REWARD)} + ${TRAINING_RESEARCH} ${tr ? 'AP' : 'RP'}`
              : tr
                ? `Ödül ${days} oyun günü sonra yenilenir. Şimdi ödülsüz alıştırma yapabilirsin.`
                : `Reward renews in ${days} game days. You can practise without rewards now.`}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {tr
              ? `Ödüllü görev, süren araştırmadan en fazla ${TRAINING_LAB_DAYS} günlük çalışma da düşürür. Araştırma yoksa bu bonus birikmez.`
              : `A rewarded exercise also removes up to ${TRAINING_LAB_DAYS} day of work from active research. This bonus does not bank when the lab is idle.`}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {tr
              ? 'Her 7 oyun gününde en fazla bir ödül. Tüm görevler aynı ödül hakkını paylaşır.'
              : 'At most one reward every 7 game days. All exercises share the same reward allowance.'}{' '}
            · {training.completed} {tr ? 'görev tamamlandı' : 'exercises completed'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={!!game.gameOver || !!game.auction}
            onClick={(event) => {
              event.currentTarget.focus();
              start(4, 'fault');
            }}
          >
            {tr ? 'Arıza bul · Kısa görev' : 'Find the fault · Quick exercise'}
          </button>
          <button
            className="btn-primary"
            disabled={!!game.gameOver || !!game.auction}
            onClick={(event) => {
              event.currentTarget.focus();
              start(4);
            }}
          >
            {tr ? 'Oyna · 4×4' : 'Play · 4×4'}
          </button>
          <button
            className="btn"
            disabled={!!game.gameOver || !!game.auction}
            onClick={(event) => {
              event.currentTarget.focus();
              start(5);
            }}
          >
            {tr ? 'Zorlu rota · 5×5' : 'Challenge · 5×5'}
          </button>
        </div>
      </div>
      {game.auction && (
        <p className="mt-2 text-xs text-neon-amber">
          {tr ? 'Önce açık spektrum ihalesini tamamla.' : 'Finish the open spectrum auction first.'}
        </p>
      )}
    </section>
  );
}

export default function SignalTrainingDialog() {
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const close = useGame((s) => s.closeSignalTraining);
  const rotate = useGame((s) => s.rotateSignalTile);
  const submit = useGame((s) => s.submitSignalTraining);
  const save = useGame((s) => s.save);
  const puzzle = game.signalTraining.active;
  const [message, setMessage] = useState('');
  const ref = useDialogAccessibility(!!puzzle, () => {
    setMessage('');
    close();
  });
  if (!puzzle) return null;
  const route = signalConnection(puzzle);
  const fault = puzzle.mode === 'fault';
  const directions = tr ? ['kuzey', 'doğu', 'güney', 'batı'] : ['north', 'east', 'south', 'west'];
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-3 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signal-title"
        aria-describedby="signal-instructions"
        tabIndex={-1}
        className="panel max-h-[calc(100dvh-1.5rem)] w-full max-w-[620px] overflow-y-auto p-4 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="signal-title" className="text-xl font-semibold">
              {fault ? (tr ? 'Arıza bulma' : 'Fault finding') : tr ? 'Sinyal rotası' : 'Signal routing'}
            </h2>
            <p className="mt-1 text-xs text-neon-amber">
              {tr ? 'Şirket saati duraklatıldı' : 'Company clock paused'} · {puzzle.moves} {tr ? 'hamle' : 'moves'}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label={tr ? 'Mini oyunu kapat' : 'Close mini-game'}
            onClick={() => {
              setMessage('');
              close();
            }}
          >
            ×
          </button>
        </div>
        <p id="signal-instructions" className="mt-3 text-sm leading-relaxed text-white/65">
          {fault
            ? tr
              ? 'Bu hatta yalnızca bir kablo yanlış yönde. Işıklı parçaları takip edip kesintiyi onar. Tıklama veya Enter/Boşluk kabloyu döndürür; Tab ile seçebilirsin.'
              : 'Just one cable is misaligned. Follow the lit tiles and repair the break. Click or press Enter/Space to rotate; use Tab to select a tile.'
            : tr
              ? 'Her tıklama kabloyu saat yönünde döndürür. Sol üstteki girişten sağ alttaki çıkışa kesintisiz bir yol kur. Tüm parçaları kullanman gerekmez. Klavyede Tab ile seç, Enter veya Boşluk ile döndür.'
              : 'Each click rotates a cable clockwise. Build an unbroken path from the top-left inlet to the bottom-right outlet. You do not need every tile. Use Tab to select and Enter or Space to rotate.'}
        </p>
        <div className="mx-auto mt-4 w-full" style={{ maxWidth: 'clamp(240px, calc(100dvh - 420px), 420px)' }}>
          <div className="mb-2 text-xs font-semibold text-neon-cyan">{tr ? 'Giriş →' : 'Inlet →'}</div>
          <div
            className="grid gap-1.5 rounded-lg border border-white/15 bg-black/25 p-2"
            style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}
            role="group"
            aria-label={tr ? 'Kablo panosu' : 'Cable board'}
          >
            {route.ports.map((ports, index) => (
              <button
                key={index}
                disabled={puzzle.completed}
                className={`aspect-square min-w-0 rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${route.lit.has(index) ? 'border-neon-cyan/70 bg-neon-cyan/15 text-neon-cyan' : 'border-white/15 bg-ink-800 text-white/45'}`}
                aria-label={`${tr ? 'Satır' : 'Row'} ${Math.floor(index / puzzle.size) + 1}, ${tr ? 'sütun' : 'column'} ${(index % puzzle.size) + 1}: ${directions.filter((_, d) => ports & (1 << d)).join(', ')}${route.lit.has(index) ? (tr ? ', sinyal var' : ', signal present') : ''}`}
                onClick={() => {
                  setMessage('');
                  rotate(index);
                }}
              >
                <svg viewBox="0 0 60 60" className="h-full w-full" aria-hidden="true">
                  {[
                    ['30', '0'],
                    ['60', '30'],
                    ['30', '60'],
                    ['0', '30'],
                  ].map(([x, y], d) =>
                    ports & (1 << d) ? (
                      <line key={d} x1="30" y1="30" x2={x} y2={y} stroke="currentColor" strokeWidth="7" />
                    ) : null,
                  )}
                  <circle cx="30" cy="30" r="6" fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
          <div
            className={`mt-2 text-right text-xs font-semibold ${route.connected ? 'text-neon-lime' : 'text-white/60'}`}
          >
            {tr ? '→ Çıkış' : '→ Outlet'}
          </div>
        </div>
        <div className="mt-4 rounded border border-white/10 bg-black/20 p-3 text-sm" role="status">
          {puzzle.completed
            ? puzzle.reward
              ? `${tr ? 'Bağlantı tamamlandı! Ödül alındı' : 'Connection complete! Reward received'}: ${fmtMoney(puzzle.reward)} + ${TRAINING_RESEARCH} ${tr ? 'AP' : 'RP'}`
              : tr
                ? 'Alıştırma tamamlandı! Bu tur ödülsüzdü.'
                : 'Practice complete! This round had no reward.'
            : route.connected
              ? tr
                ? 'Sinyal alıcıya ulaştı. Rotayı doğrulayabilirsin.'
                : 'Signal reached the receiver. You can verify the route.'
              : tr
                ? 'Sinyal henüz alıcıya ulaşmıyor. Işıklı parçaları takip et.'
                : 'The signal has not reached the receiver. Follow the illuminated cables.'}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!!puzzle.researchDaysSaved && (
            <p className="w-full text-xs text-neon-lime">
              {tr
                ? `Araştırmadan ${puzzle.researchDaysSaved.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} günlük çalışma düşüldü. Sonuç, şirket saatini devam ettirince işlenir.`
                : `${puzzle.researchDaysSaved.toLocaleString('en-US', { maximumFractionDigits: 2 })} day of research work saved. The result is processed when you resume company time.`}
            </p>
          )}
          {!puzzle.completed && (
            <button className="btn-primary" disabled={!route.connected} onClick={() => submit()}>
              {tr ? 'Rotayı doğrula' : 'Verify route'}
            </button>
          )}
          <button
            className="btn"
            onClick={() =>
              setMessage(
                save()
                  ? tr
                    ? 'Oyun ve rota kaydedildi.'
                    : 'Game and route saved.'
                  : tr
                    ? 'Kayıt başarısız. Depolama alanını kontrol et.'
                    : 'Save failed. Check available storage.',
              )
            }
          >
            {tr ? 'İlerlemeyi kaydet' : 'Save progress'}
          </button>
          <button
            className="btn"
            onClick={() => {
              setMessage('');
              close();
            }}
          >
            {puzzle.completed ? (tr ? 'Şirkete dön' : 'Return to company') : tr ? 'Rotayı bırak' : 'Leave route'}
          </button>
        </div>
        {message && (
          <p className="mt-2 text-xs text-neon-amber" role="status">
            {message}
          </p>
        )}
        <p className="mt-3 text-xs text-white/50">
          {tr
            ? 'Çıkınca saat duraklatılmış kalır. Yarım rotayı bırakmak ödül hakkını tüketmez.'
            : 'The clock stays paused when you leave. Leaving an unfinished route does not use your reward.'}
        </p>
      </div>
    </div>
  );
}
