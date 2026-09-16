import { MAINTENANCE_CONFIG } from '../../../game/strategy';
import { t } from '../../i18n';
import type { NetworkModel } from './model';

const STATUS_TR = { scheduled: 'PLANLANDI', active: 'SÜRÜYOR', completed: 'TAMAMLANDI' } as const;

export default function MaintenancePanel({ m }: { m: NetworkModel }) {
  const tr = m.locale === 'tr';
  return (
    <div
      id="maintenance"
      className={`panel panel-tone-amber scroll-mt-20 p-5 ${m.networkView === 'operations' ? '' : 'hidden'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(m.locale, 'maintenanceBoard')}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">{t(m.locale, 'maintenanceBoardBlurb')}</p>
        </div>
        <span className="chip border-neon-amber/30 text-[10px] text-neon-amber">
          {m.openMaintenance.length} {tr ? 'AÇIK' : 'OPEN'}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {m.openMaintenance.length ? (
          m.openMaintenance.map((order) => {
            const node = m.game.nodes.find((entry) => entry.id === order.nodeId);
            const technician = m.game.technicians.find((entry) => entry.id === order.technicianId);
            const waitDays = Math.max(0, Math.ceil((order.scheduledAt - m.game.minutes) / 1440));
            return (
              <button
                key={order.id}
                onClick={() => node && (m.focus(node.gx, node.gy), m.select({ type: 'node', id: node.id }))}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.07]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">
                    {node?.name ?? (tr ? 'Kaldırılmış nokta' : 'Removed site')}
                  </span>
                  <span
                    className={`chip text-[9px] ${order.status === 'active' ? 'border-neon-amber/40 text-neon-amber' : 'border-white/15 text-white/45'}`}
                  >
                    {tr ? STATUS_TR[order.status] : order.status.toUpperCase()}
                  </span>
                </div>
                <div className="num mt-1 text-[10px] text-white/40">
                  {tr ? MAINTENANCE_CONFIG[order.mode].labelTr.toLocaleUpperCase('tr-TR') : order.mode.toUpperCase()} ·{' '}
                  {order.status === 'active'
                    ? tr
                      ? `${Math.ceil(order.minutesLeft)} DK · ${technician?.name ?? 'EKİP'}`
                      : `${Math.ceil(order.minutesLeft)} MIN · ${technician?.name ?? 'CREW'}`
                    : waitDays
                      ? tr
                        ? `${waitDays} GÜN SONRA`
                        : `IN ${waitDays}D`
                      : tr
                        ? 'EKİP BEKLENİYOR'
                        : 'AWAITING CREW'}
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] text-white/35">
            {t(m.locale, 'noWorkOrders')}
          </div>
        )}
      </div>
    </div>
  );
}
