import { nodeUtil } from '../../../game/network';
import { t } from '../../i18n';
import SiteIcon, { TierBadge } from '../../SiteIcon';
import { Meter } from './Meter';
import type { NetworkModel } from './model';

export default function SitesPanel({ m }: { m: NetworkModel }) {
  return (
    <div className={`panel panel-tone-green p-5 ${m.networkView === 'capacity' ? '' : 'hidden'}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">{t(m.locale, 'sites')}</h2>
          <p className="mt-1 text-[11px] text-white/40">
            A larger T-number means a larger equipment stack and more capacity.
          </p>
        </div>
        <div className="flex items-center gap-1" aria-label="Tier scale">
          {[1, 2, 3, 4, 5].map((tier) => (
            <TierBadge key={tier} tier={tier} maxTier={5} compact />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {m.game.nodes.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              m.focus(n.gx, n.gy);
              m.select({ type: 'node', id: n.id });
            }}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-black/15">
              <SiteIcon kind={n.kind} tier={n.tier} className="h-8 w-8" title={`${n.kind} site, Tier ${n.tier}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{n.name}</span>
                {n.down && <span className="chip border-neon-red/40 text-[10px] text-neon-red">DOWN</span>}
              </div>
              <Meter
                v={nodeUtil(n)}
                label={`T${n.tier} equipment`}
                right={`${n.trafficGbps.toFixed(1)}/${n.capacityGbps.toFixed(0)} Gbps`}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
