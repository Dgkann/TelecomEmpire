import { networkReachGain } from '../game/reach';
import { useMemo } from 'react';
import { residentialPeakEstimate } from '../game/planCapacity';
import { projectBlueprint, MAX_PLAN_STEPS } from '../game/blueprint';
import { fmtMoney } from '../game/economy';
import { useGame } from '../store/gameStore';

export default function BlueprintBar() {
  const game = useGame((s) => s.game)!;
  const steps = useGame((s) => s.blueprint);
  const undo = useGame((s) => s.undoBlueprint);
  const commit = useGame((s) => s.commitBlueprint);
  const discard = useGame((s) => s.discardBlueprint);
  const tr = useGame((s) => s.locale) === 'tr';
  const preview = useMemo(() => projectBlueprint(game, steps, tr ? 'tr' : 'en'), [game, steps, tr]);
  const homes = useMemo(() => networkReachGain(game, preview.state), [game, preview.state]);
  const peak = useMemo(() => residentialPeakEstimate(preview.state), [preview.state]);
  return (
    <section
      className="panel pointer-events-auto w-[min(520px,100%)] border-neon-amber/40 p-3 lg:fixed lg:left-[84px] lg:top-[84px] lg:w-[280px]"
      aria-label={tr ? 'Ağ planı' : 'Network blueprint'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-neon-amber">
          {tr ? 'Ağ taslağı' : 'Network blueprint'} · {steps.length}/{MAX_PLAN_STEPS}
        </strong>
        <span className="text-[11px] text-white/55">
          {tr ? 'Zaman durdu · henüz satın alınmadı' : 'Paused · nothing purchased yet'}
        </span>
      </div>
      <div className="my-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-white/55">{tr ? 'Toplam yatırım' : 'Total investment'}</div>
          <b>{fmtMoney(preview.cost)}</b>
        </div>
        <div>
          <div className="text-white/55">{tr ? 'Ek aylık gider' : 'Added monthly cost'}</div>
          <b>{fmtMoney(preview.addedMonthlyCost)}</b>
        </div>
        <div>
          <div className="text-white/55">{tr ? 'Bağlantısız nokta' : 'Unconnected sites'}</div>
          <b className={preview.disconnected ? 'text-neon-amber' : 'text-neon-cyan'}>{preview.disconnected}</b>
        </div>
      </div>
      <p className="mb-2 text-xs text-teal-200">
        {tr
          ? `Kurulumdan sonra +${homes.toLocaleString('tr-TR')} potansiyel hane`
          : `+${homes.toLocaleString('en-US')} potential homes after commissioning`}
      </p>
      <p className="mb-2 text-[11px] text-white/65">
        {preview.error ??
          (tr
            ? 'Noktaları yerleştir, Fiber ile bağla. Kurulumdan önce tek tek geri alabilirsin.'
            : 'Place sites, then connect them with Fibre. Undo any step before commissioning.')}
      </p>
      <p className="mb-2 text-[11px] text-white/60">
        {tr ? 'Konut yoğun saat stres testi' : 'Residential peak stress test'}: {peak.demand.toFixed(1)} Gbps ·{' '}
        {tr ? 'karşılanan' : 'served'} {peak.demand ? Math.round((peak.served / peak.demand) * 100) : 100}% ·{' '}
        {tr ? 'en yüksek yol yükü' : 'highest path load'} {Math.round(peak.pressure * 100)}%.{' '}
        {tr
          ? 'Önbellek, transit ve diğer hizmetler hariç; mevcut abonelerle tahmin.'
          : 'Current subscribers only; excludes caches, transit and other services.'}
      </p>
      <div className="flex gap-2">
        <button className="btn flex-1 text-xs" onClick={undo} disabled={!steps.length}>
          {tr ? 'Geri al' : 'Undo'}
        </button>
        <button className="btn flex-1 text-xs" onClick={discard}>
          {tr ? 'Taslağı sil' : 'Discard plan'}
        </button>
        <button
          className="btn-primary flex-1 text-xs"
          disabled={!steps.length || !!preview.error || preview.disconnected > 0}
          onClick={commit}
        >
          {tr ? 'Tümünü kur' : 'Build all'}
        </button>
      </div>
    </section>
  );
}
