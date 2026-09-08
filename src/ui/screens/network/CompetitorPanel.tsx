import { SPECTRUM_BANDS } from '../../../game/constants';
import { rivalPosture } from '../../../game/competitors';
import { t } from '../../i18n';
import type { NetworkModel } from './model';

export default function CompetitorPanel({ m }: { m: NetworkModel }) {
  return (
    <div className={`panel panel-tone-violet p-5 ${m.networkView === 'interconnect' ? '' : 'hidden'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(m.locale, 'competitorIntelligence')}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">{t(m.locale, 'competitorIntelBlurb')}</p>
        </div>
        <button
          className="btn py-1.5 text-[10px]"
          onClick={() => {
            m.setOverlay('rivals');
            m.setScreen('map');
          }}
        >
          {t(m.locale, 'openOverlay')}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {m.game.competitors.map((rival) => {
          const strongest = [...m.game.districts].sort(
            (a, b) => (rival.share[b.id] ?? 0) - (rival.share[a.id] ?? 0),
          )[0];
          const avgCoverage =
            m.game.districts.reduce((sum, d) => sum + (rival.coverage[d.id] ?? 0), 0) /
            Math.max(1, m.game.districts.length);
          const rivalSpectrum = rival.spectrum
            .map((holding) => `${SPECTRUM_BANDS[holding.band].label} ×${holding.blocks}`)
            .join(', ');
          const posture = rivalPosture(m.game, rival);
          return (
            <button
              key={rival.id}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.07]"
              onClick={() => strongest && m.focus(strongest.center.gx, strongest.center.gy)}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <i className="h-2 w-2 rounded-full" style={{ background: rival.color }} />
                  {rival.name}
                </span>
                <span className="num text-[10px] text-white/45">PRICE {rival.priceIndex.toFixed(2)}×</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                <span
                  className="rounded border px-1.5 py-0.5 font-semibold"
                  style={{ borderColor: `${rival.color}66`, color: rival.color }}
                >
                  {posture.label}
                </span>
                <span className="truncate text-white/35">{posture.detail}</span>
              </div>
              <div className="mt-1 grid grid-cols-3 text-[10px] text-white/[0.42]">
                <span>{Math.round(avgCoverage * 100)}% cover</span>
                <span className="text-center">Tech {Math.round(rival.tech * 100)}</span>
                <span className="truncate text-right">Lead: {strongest?.name}</span>
              </div>
              <div className="mt-1 truncate text-[10px] text-white/35">Spectrum: {rivalSpectrum || 'none'}</div>
              {rival.lastMove && (
                <div className="mt-1 truncate text-[10px]" style={{ color: rival.color }}>
                  {rival.lastMove}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
