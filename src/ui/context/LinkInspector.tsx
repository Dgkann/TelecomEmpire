import { FIBER_UPGRADE_COST_PER_UNIT } from '../../game/constants';
import { fmtMoneyExact } from '../../game/economy';
import { linkUtil } from '../../game/network';
import { t } from '../i18n';
import { TierBadge } from '../SiteIcon';
import { Bar } from './Bar';
import type { NetLink } from '../../game/types';
import type { ContextModel } from './model';

export default function LinkInspector({ cp, link }: { cp: ContextModel; link: NetLink }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-white/40">{t(cp.locale, 'fibreSpan')}</span>
          <TierBadge tier={link.tier} maxTier={cp.mods.maxLinkTier} compact />
        </div>
        <div className="text-base font-semibold leading-tight">
          {cp.game.nodes.find((n) => n.id === link.aId)?.name} ↔ {cp.game.nodes.find((n) => n.id === link.bId)?.name}
        </div>
        {link.down && <div className="mt-1 text-xs font-semibold text-neon-red">{t(cp.locale, 'spanDark')}</div>}
      </div>
      <Bar
        value={linkUtil(link)}
        label="Utilisation"
        right={`${link.trafficGbps.toFixed(1)} / ${link.capacityGbps.toFixed(0)} Gbps`}
      />
      {!link.down && (
        <button
          className="btn w-full border-orange-300/30 text-xs text-orange-200"
          onClick={() => cp.beginDrill({ type: 'link', id: link.id })}
        >
          {t(cp.locale, 'testFibreCut')}
        </button>
      )}
      <div className="text-[11px] text-white/45">Length {link.length.toFixed(1)} km</div>
      {cp.nextLinkCapacity !== null && (
        <div className="flex items-center justify-between rounded-lg border border-neon-blue/15 bg-neon-blue/[0.045] px-3 py-2 text-[11px]">
          <span className="text-white/45">{t(cp.locale, 'afterOpticsUpgrade')}</span>
          <span className="num font-semibold text-neon-blue">
            {link.capacityGbps.toFixed(0)}G → {cp.nextLinkCapacity.toFixed(0)}G
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={link.tier >= cp.mods.maxLinkTier}
          onClick={() => cp.upgradeLink(link.id)}
        >
          Upgrade optics · {fmtMoneyExact(Math.round(link.length * FIBER_UPGRADE_COST_PER_UNIT * link.tier))}
        </button>
        <button className="btn-danger" onClick={() => cp.sellLink(link.id)}>
          {t(cp.locale, 'remove')}
        </button>
      </div>
    </div>
  );
}
