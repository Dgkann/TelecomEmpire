import { fmtMoney, fmtNum } from '../../../game/economy';
import { residentialSubs } from '../../../game/simulation';
import { t } from '../../i18n';
import { Meter } from './Meter';
import type { NetworkModel } from './model';

export default function DistrictsPanel({ m }: { m: NetworkModel }) {
  return (
    <div className={`panel panel-tone-violet p-5 ${m.networkView === 'capacity' ? '' : 'hidden'}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">{t(m.locale, 'districts')}</h2>
      <div className="flex flex-col gap-2">
        {m.game.districts.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              m.focus(d.center.gx, d.center.gy);
              m.select({ type: 'district', id: d.id });
            }}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08]"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: d.color }}>
                {d.name}
              </span>
              <span className="num text-[11px] text-white/45">
                {d.unlocked ? `${fmtNum(residentialSubs(m.game, d.id))} customers` : `Licence ${fmtMoney(d.entryCost)}`}
              </span>
            </div>
            <div className="mt-1.5 flex gap-3">
              <Meter v={d.coverage} label="Coverage" right={`${Math.round(d.coverage * 100)}%`} />
              <Meter v={d.satisfaction / 100} label="Satisfaction" right={`${Math.round(d.satisfaction)}%`} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
