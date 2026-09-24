import { reachGain } from '../game/reach';
import { investmentEstimate } from '../game/investment';
import { fmtMoney } from '../game/economy';
import type { NodeKind } from '../game/types';
import { useGame } from '../store/gameStore';
import { t } from './i18n';

export default function InvestmentPreview({ kind, nodeId }: { kind: NodeKind; nodeId?: string }) {
  const locale = useGame((s) => s.locale);
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const estimate = investmentEstimate(game, kind, nodeId);
  const node = nodeId ? game.nodes.find((n) => n.id === nodeId) : null;
  const reach = node && (kind === 'pop' || kind === 'access') ? reachGain(game, node.districtId, kind, node.id) : null;
  return (
    <div className="investment-preview" aria-label={tr ? 'Yatırım önizlemesi' : 'Investment preview'}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <div className="text-white/55">{tr ? 'Ek aylık gider' : 'Added monthly cost'}</div>
          <strong className="text-neon-amber">+{fmtMoney(estimate.monthlyCost)}</strong>
        </div>
        <div>
          <div className="text-white/55">{tr ? 'Kalan nakit' : 'Cash after purchase'}</div>
          <strong className={estimate.remaining < 0 ? 'text-neon-red' : 'text-white/85'}>
            {fmtMoney(estimate.remaining)}
          </strong>
        </div>
      </div>
      {reach && (
        <div className="mt-2 text-xs text-teal-200">
          {tr
            ? `+${reach.homes.toLocaleString('tr-TR')} potansiyel hane · kapsama %${Math.round(reach.before * 100)} → %${Math.round(reach.after * 100)}`
            : `+${reach.homes.toLocaleString('en-US')} potential homes · ${Math.round(reach.before * 100)}% → ${Math.round(reach.after * 100)}% reach`}
          <p className="mt-1 text-[10px] text-white/45">{t(locale, 'coverageSettlesBlurb')}</p>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-white/55">
        {kind === 'pop' || kind === 'access'
          ? tr
            ? `Sadece ek gideri karşılamak için yaklaşık ${estimate.breakEvenCustomers ?? '—'} yeni abone gerekir. `
            : `About ${estimate.breakEvenCustomers ?? '—'} new subscribers cover this extra upkeep alone. `
          : ''}
        {estimate.runwayMonths !== null
          ? tr
            ? `Mevcut gelirle nakit yaklaşık ${estimate.runwayMonths.toFixed(1)} ay yeter.`
            : `At current revenue, cash lasts about ${estimate.runwayMonths.toFixed(1)} months.`
          : tr
            ? 'Mevcut gelir, yeni aylık gideri karşılıyor.'
            : 'Current revenue covers the new monthly cost.'}
        {!nodeId && (tr ? ' Fiber bağlantı maliyeti hariç.' : ' Excludes fibre connection cost.')}
      </p>
    </div>
  );
}
