import { NODE_SPECS, nodeUpgradeCost } from '../../game/constants';
import { fmtMoneyExact } from '../../game/economy';
import { nodeUtil } from '../../game/network';
import { MAINTENANCE_CONFIG, maintenanceCost } from '../../game/strategy';
import type { MaintenanceMode } from '../../game/types';
import { t } from '../i18n';
import SiteIcon, { TierBadge } from '../SiteIcon';
import InvestmentPreview from '../InvestmentPreview';
import DataCenterFinance from '../DataCenterFinance';
import { Bar } from './Bar';
import type { NetNode } from '../../game/types';
import type { ContextModel } from './model';

export default function NodeInspector({ cp, node }: { cp: ContextModel; node: NetNode }) {
  // Destructured so TypeScript can narrow it inside the conditional below.
  const { nodeMaintenance } = cp;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 pr-6">
        <SiteIcon
          kind={node.kind}
          tier={node.tier}
          className="h-11 w-11 shrink-0"
          title={
            node.kind === 'datacenter' && node.tier === 0
              ? cp.locale === 'tr'
                ? 'Küçük veri merkezi'
                : 'Small data centre'
              : `${NODE_SPECS[node.kind].label}, Tier ${node.tier}`
          }
        />
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-white/40">{NODE_SPECS[node.kind].label}</span>
            <TierBadge tier={node.tier} maxTier={cp.nodeMaxTier} compact />
          </div>
          <div className="truncate text-lg font-semibold leading-tight">{node.name}</div>
          {node.down && <div className="mt-1 text-xs font-semibold text-neon-red">{t(cp.locale, 'outOfService')}</div>}
        </div>
      </div>

      <Bar
        value={nodeUtil(node)}
        label="Capacity"
        right={`${node.trafficGbps.toFixed(1)} / ${node.capacityGbps.toFixed(0)} Gbps`}
      />
      {node.kind === 'datacenter' && node.tier === 0 && (
        <section
          className="panel p-3 text-xs"
          aria-label={cp.locale === 'tr' ? 'Küçük veri merkezi' : 'Small data centre'}
        >
          <p>
            {cp.locale === 'tr'
              ? 'İlk aşama · 10 Gbps. Tam merkezin %25 barındırma geliri, elektrik ve bakım gideri.'
              : 'First stage · 10 Gbps. 25% of full hosting revenue and site operating costs.'}
          </p>
          <p className="mt-2">
            {cp.locale === 'tr'
              ? 'Edge araştırması + 3.200.000 ₺ → 40 Gbps tam merkez. Kampanya için genişletmen gerekir.'
              : 'Edge research + 3,200,000 ₺ → 40 Gbps full centre. Expand to meet the campaign objective.'}
          </p>
        </section>
      )}
      <Bar value={1 - node.health / 100} label="Wear" right={`${Math.round(node.health)}% health`} />

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="chip">
          <div className="stat-label">{t(cp.locale, 'pathToCore')}</div>
          <div className={cp.connected ? 'text-neon-lime' : 'text-neon-red'}>{cp.connected ? 'Live' : 'Isolated'}</div>
        </div>
        <div className="chip">
          <div className="stat-label">{t(cp.locale, 'redundancy')}</div>
          <div className={cp.redundant ? 'text-neon-lime' : 'text-neon-amber'}>
            {node.kind === 'core' ? 'n/a' : cp.redundant ? 'Protected' : 'Single path'}
          </div>
        </div>
      </div>

      {!node.down && (
        <button
          className="btn w-full border-orange-300/30 text-xs text-orange-200"
          onClick={() => cp.beginDrill({ type: 'node', id: node.id })}
        >
          {t(cp.locale, 'testSiteFailure')}
        </button>
      )}
      {cp.backup && (
        <div className="rounded-md border border-teal-300/25 bg-teal-300/5 p-3">
          <div className="text-xs font-semibold text-teal-200">{t(cp.locale, 'protectAgainstCut')}</div>
          <p className="my-2 text-[11px] text-white/60">
            Independent path via {cp.backup.node.name}. Validated against every cut on the current route.
          </p>
          <button
            className="btn-primary w-full text-xs"
            disabled={cp.game.money < cp.backup.cost}
            onClick={() => cp.addBackupRoute(node.id)}
          >
            Build backup fibre · {fmtMoneyExact(cp.backup.cost)}
          </button>
        </div>
      )}
      {!cp.redundant && node.kind !== 'core' && (
        <p className="text-[11px] leading-snug text-white/45">{t(cp.locale, 'protectAgainstCutBlurb')}</p>
      )}

      {cp.nextNodeCapacity !== null && (
        <div className="rounded-lg border border-neon-cyan/15 bg-neon-cyan/[0.045] p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="stat-label">{t(cp.locale, 'upgradePreview')}</div>
            <div className="num text-[10px] font-semibold text-neon-lime">
              +{Math.round((cp.nextNodeCapacity / Math.max(0.01, node.capacityGbps) - 1) * 100)}% capacity
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="rounded-md border border-white/[0.08] bg-black/10 p-2 text-center">
              <TierBadge tier={node.tier} maxTier={cp.nodeMaxTier} compact />
              <div className="num mt-1 text-sm text-white/55">{node.capacityGbps.toFixed(1)}G</div>
            </div>
            <span className="text-neon-cyan/60">→</span>
            <div className="rounded-md border border-neon-cyan/25 bg-neon-cyan/[0.06] p-2 text-center">
              <TierBadge tier={node.tier + 1} maxTier={cp.nodeMaxTier} compact />
              <div className="num mt-1 text-sm font-semibold text-neon-cyan">{cp.nextNodeCapacity.toFixed(1)}G</div>
            </div>
          </div>
        </div>
      )}

      {node.kind === 'datacenter' ? (
        <DataCenterFinance nodeId={node.id} />
      ) : (
        cp.nextNodeCapacity !== null && <InvestmentPreview kind={node.kind} nodeId={node.id} />
      )}
      {nodeMaintenance ? (
        <div className="rounded-lg border border-neon-amber/25 bg-neon-amber/[0.06] p-2.5">
          <div className="flex items-center justify-between">
            <span className="stat-label text-neon-amber">{t(cp.locale, 'plannedWork')}</span>
            <span className="chip border-neon-amber/30 text-[9px] text-neon-amber">
              {nodeMaintenance.status.toUpperCase()}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-white/55">
            {MAINTENANCE_CONFIG[nodeMaintenance.mode].label} ·{' '}
            {nodeMaintenance.status === 'active'
              ? `${Math.ceil(nodeMaintenance.minutesLeft)} minutes left`
              : 'waiting for its window and a free crew'}
          </div>
          {nodeMaintenance.status === 'scheduled' && (
            <button
              className="btn mt-2 w-full py-1 text-[11px]"
              onClick={() => cp.cancelMaintenance(nodeMaintenance.id)}
            >
              Call it off and refund {fmtMoneyExact(nodeMaintenance.cost)}
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="stat-label mb-1.5">{t(cp.locale, 'maintenanceWindow')}</div>
          <div
            className={`mb-2 rounded-md px-2 py-1.5 text-[10px] leading-snug ${cp.maintenanceCover.safe ? 'bg-neon-lime/10 text-neon-lime' : 'bg-neon-red/10 text-neon-red'}`}
          >
            {cp.maintenanceCover.safe
              ? `${cp.maintenanceCover.others} other site${cp.maintenanceCover.others > 1 ? 's' : ''} can carry the district while this one is off.`
              : 'Nothing else serves this district, so the work will black it out.'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['urgent', 'overnight', 'defer'] as MaintenanceMode[]).map((mode) => (
              <button
                key={mode}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-left hover:border-neon-amber/35 hover:bg-neon-amber/[0.06]"
                onClick={() => cp.scheduleMaintenance(node.id, mode)}
              >
                <span className="block text-[11px] font-semibold">{MAINTENANCE_CONFIG[mode].label}</span>
                <span className="num mt-0.5 block text-[10px] text-neon-amber">
                  {mode === 'defer' ? 'Free' : fmtMoneyExact(maintenanceCost(node, mode))}
                </span>
                <span className="mt-1 block text-[9px] leading-snug text-white/35">
                  {mode === 'urgent'
                    ? 'Now · short outage'
                    : mode === 'overnight'
                      ? '02:00 · lower cost'
                      : `Health ${Math.round(node.health)}% and falling`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={node.tier >= cp.nodeMaxTier} onClick={() => cp.upgradeNode(node.id)}>
          {node.tier >= cp.nodeMaxTier
            ? node.kind === 'datacenter' && node.tier === 0
              ? cp.locale === 'tr'
                ? 'Edge araştırması gerekiyor'
                : 'Edge research required'
              : 'Max tier'
            : `${node.kind === 'datacenter' && node.tier === 0 ? (cp.locale === 'tr' ? 'Tam merkeze genişlet' : 'Expand to full centre') : 'Upgrade'} · ${fmtMoneyExact(nodeUpgradeCost(node.kind, node.tier))}`}
        </button>
        <button
          className="btn"
          onClick={() => {
            cp.setTool('fiber');
            cp.clickNodeForLink(node.id);
          }}
        >
          {t(cp.locale, 'addFibre')}
        </button>
        <button className="btn-danger" onClick={() => cp.sellNode(node.id)}>
          {t(cp.locale, 'decommission')}
        </button>
      </div>
    </div>
  );
}
