import { linkUtil } from '../../../game/network';
import { t } from '../../i18n';
import { Meter } from './Meter';
import type { NetworkModel } from './model';

export default function FibreSpansPanel({ m }: { m: NetworkModel }) {
  const tr = m.locale === 'tr';
  return (
    <div className={`panel panel-tone-blue p-5 ${m.networkView === 'capacity' ? '' : 'hidden'}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(m.locale, 'fibreSpans')}
      </h2>
      <p className="mb-3 text-[11px] text-white/40">{t(m.locale, 'fibreSpansBlurb')}</p>
      <div className="flex flex-col gap-2">
        {m.game.links.length === 0 && <p className="text-sm text-white/40">{t(m.locale, 'noFibreBuilt')}</p>}
        {m.game.links.map((l) => {
          const a = m.game.nodes.find((n) => n.id === l.aId);
          const b = m.game.nodes.find((n) => n.id === l.bId);
          const stranded = !l.down && !m.routes[l.aId] && !m.routes[l.bId];
          const standby = !l.down && !stranded && !m.usedSpans.has(l.id);
          return (
            <button
              key={l.id}
              onClick={() => {
                if (a) m.focus((a.gx + (b?.gx ?? a.gx)) / 2, (a.gy + (b?.gy ?? a.gy)) / 2);
                m.select({ type: 'link', id: l.id });
              }}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08]"
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm">
                  {a?.name} <span className="text-white/30">↔</span> {b?.name}
                </span>
                {l.down && (
                  <span className="chip border-neon-red/40 text-[10px] text-neon-red">{tr ? 'KESİK' : 'CUT'}</span>
                )}
                {stranded && (
                  <span
                    className="chip border-neon-red/40 text-[10px] text-neon-red"
                    title={tr ? 'İki uç da şu an bir çekirdeğe ulaşamıyor' : 'Neither end can reach a core right now'}
                  >
                    {t(m.locale, 'noRoute')}
                  </span>
                )}
                {standby && (
                  <span
                    className="chip border-white/20 text-[10px] text-white/50"
                    title={
                      tr
                        ? 'Bugün bu hattan trafik geçmiyor. İlçeyi yedekli tutan hat bu.'
                        : 'Nothing routes over this span today. It is what keeps the district redundant.'
                    }
                  >
                    {tr ? 'YEDEKTE' : 'STANDBY'}
                  </span>
                )}
              </div>
              <Meter
                v={linkUtil(l)}
                label={`${tr ? 'Seviye' : 'Tier'} ${l.tier} · ${l.length.toFixed(1)} km`}
                right={`${l.trafficGbps.toFixed(1)}/${l.capacityGbps.toFixed(0)} Gbps`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
