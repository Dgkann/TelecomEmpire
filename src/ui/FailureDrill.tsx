import type { FailureReport } from '../game/failureDrill';
import type { GameState } from '../game/types';
import { useGame } from '../store/gameStore';
import { t } from './i18n';
import { isoX, isoY, tileDiamond } from './iso';

export function FailureFootprint({ game, report }: { game: GameState; report: FailureReport }) {
  const locale = useGame((s) => s.locale);
  const affected = report.districts.filter((d) => d.loss > 0.001 || d.disconnectedSites > 0);
  return (
    <g
      aria-label={locale === 'tr' ? 'Simüle edilen arıza izi' : 'Simulated failure footprint'}
      style={{ pointerEvents: 'none' }}
    >
      {affected.map((d) => (
        <g key={d.id}>
          {game.districts
            .find((x) => x.id === d.id)!
            .cells.map((c) => (
              <polygon
                key={`${c.gx},${c.gy}`}
                points={tileDiamond(c.gx, c.gy, 0.08)}
                fill="#ec8866"
                fillOpacity={0.12 + d.loss * 0.32}
                stroke="#e59d74"
                strokeOpacity={0.28}
                strokeWidth={0.7}
              />
            ))}
        </g>
      ))}
      {report.lostSites.map((n) => (
        <g key={n.id}>
          <circle
            cx={isoX(n.gx, n.gy)}
            cy={isoY(n.gx, n.gy) - 8}
            r={25}
            fill="none"
            stroke="#ffc28a"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <text
            x={isoX(n.gx, n.gy)}
            y={isoY(n.gx, n.gy) - 39}
            textAnchor="middle"
            fontSize={8}
            fill="#ffd3a7"
            stroke="#142534"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {t(locale, 'wouldDisconnect')}
          </text>
        </g>
      ))}
    </g>
  );
}

export default function FailureDrillPanel({ report }: { report: FailureReport }) {
  const locale = useGame((s) => s.locale);
  const game = useGame((s) => s.game)!;
  const end = useGame((s) => s.endFailureDrill);
  const tr = locale === 'tr';
  const target =
    report.target.type === 'node'
      ? game.nodes.find((n) => n.id === report.target.id)?.name
      : tr
        ? 'Seçili fiber hat'
        : 'Selected fibre span';
  const affected = report.districts.filter((d) => d.loss > 0.001 || d.disconnectedSites > 0);
  const ratio = (v: number) => (report.before.demand ? Math.round((v / report.before.demand) * 100) : 100);
  return (
    <section
      aria-label={t(locale, 'failureDrill')}
      className="panel absolute bottom-3 left-3 right-3 z-30 border-orange-300/40 p-4 lg:bottom-auto lg:right-auto lg:top-3 lg:w-[280px]"
    >
      <div className="flex justify-between gap-2">
        <h2 className="text-sm font-semibold text-orange-200">{t(locale, 'failureDrill')}</h2>
        <span className="text-[10px] text-white/55">{t(locale, 'pausedHypothetical')}</span>
      </div>
      <p className="mt-1 truncate text-xs text-white/65">{target}</p>
      <div className="my-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] text-white/50">{t(locale, 'residentialPeakDelivery')}</div>
          <strong className="text-xl text-teal-200">
            {ratio(report.before.served)}% <span className="text-white/30">→</span>{' '}
            <span className={report.lostGbps > 0.001 ? 'text-orange-200' : 'text-teal-200'}>
              {ratio(report.after.served)}%
            </span>
          </strong>
        </div>
        <div className="text-right">
          <strong className="text-xl">{report.lostSites.length}</strong>
          <div className="text-[10px] text-white/50">{tr ? 'bağlantısı kopan nokta' : 'sites disconnected'}</div>
        </div>
      </div>
      <p className="text-xs text-white/65">
        {report.lostGbps > 0.001
          ? tr
            ? `${report.lostGbps.toFixed(2).replace('.', ',')} Gbps ek talep karşılanamaz.`
            : `${report.lostGbps.toFixed(2)} Gbps of additional demand would go unserved.`
          : tr
            ? 'Bu testte ek konut talebi kaybolmuyor.'
            : 'No additional residential demand is lost in this test.'}
      </p>
      <details className="mt-2 text-xs" open={affected.length > 0}>
        <summary className="cursor-pointer text-orange-200">
          {tr ? 'Etkilenen ilçeler' : 'Affected districts'} · {affected.length}
        </summary>
        <div className="mt-2 max-h-28 space-y-2 overflow-auto">
          {affected.map((d) => (
            <div key={d.id}>
              <div className="flex justify-between gap-2">
                <span>{d.name}</span>
                <span>
                  {Math.round(d.before * 100)}% → {Math.round(d.after * 100)}%
                </span>
              </div>
              <div className="mt-1 h-1 bg-orange-300/25">
                <div className="h-full bg-teal-300/70" style={{ width: `${d.after * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </details>
      <p className="mt-3 text-[10px] leading-relaxed text-white/45">
        {tr
          ? 'Yoğun saatteki mevcut konut müşterileri. Transit, önbellek, mobil ve ticari talep hariç. Turuncu işaretler simüle edilen etkiyi gösterir; gerçek şebeke değişmez.'
          : 'Current residential customers at peak. Excludes transit, caches, mobile and business demand. Orange marks show the simulated impact; the real network is unchanged.'}
      </p>
      <button className="btn-primary mt-3 w-full text-xs" onClick={end}>
        {t(locale, 'endDrill')}
      </button>
    </section>
  );
}
