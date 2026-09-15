import { dataCenterOutlook } from '../game/dataCenterOutlook';
import { fmtMoneyExact } from '../game/economy';
import { useGame } from '../store/gameStore';

export default function DataCenterFinance({ nodeId, expanded = false }: { nodeId: string; expanded?: boolean }) {
  const game = useGame((s) => s.game)!;
  const tr = useGame((s) => s.locale) === 'tr';
  const quote = dataCenterOutlook(game, nodeId);
  if (!quote) return null;
  const { current, expansion } = quote;
  const blocked = expansion?.blockedBy;
  const blockedText =
    blocked === 'research'
      ? tr
        ? 'Genişletmek için önce Edge araştırmasını tamamla.'
        : 'Complete edge research before expanding.'
      : blocked === 'fault'
        ? tr
          ? 'Önce merkezdeki arızayı gider.'
          : 'Resolve the site fault first.'
        : blocked === 'maintenance'
          ? tr
            ? 'Önce planlı bakımın bitmesini bekle veya iptal et.'
            : 'Finish or cancel planned maintenance first.'
          : blocked === 'closed'
            ? tr
              ? 'Şirket kapalı; yatırım yapılamaz.'
              : 'The company is closed; investment is unavailable.'
            : blocked === 'funds'
              ? tr
                ? `${fmtMoneyExact(expansion!.cashMissing)} ek nakit gerekiyor.`
                : `${fmtMoneyExact(expansion!.cashMissing)} more cash needed.`
              : null;
  return (
    <section
      className="investment-preview text-xs"
      aria-label={tr ? 'Veri merkezi finansmanı' : 'Data centre finances'}
    >
      <h3 className="font-semibold text-neon-cyan">{tr ? 'Merkezin aylık hesabı' : 'Monthly site finances'}</h3>
      {!quote.connected && (
        <p className="mt-2 text-neon-amber">
          {tr
            ? 'Bağlantı yok veya merkez hizmet dışı. Gelir durdu; giderler sürüyor.'
            : 'Disconnected or out of service. Income has stopped; costs continue.'}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-white/55">{tr ? 'Barındırma geliri' : 'Hosting revenue'}</dt>
          <dd className="mt-1 font-semibold">{fmtMoneyExact(current.revenue)}</dd>
        </div>
        <div>
          <dt className="text-white/55">{tr ? 'Saha net katkısı' : 'Site net contribution'}</dt>
          <dd className={`mt-1 font-semibold ${current.net >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
            {fmtMoneyExact(current.net)}
          </dd>
        </div>
        <div>
          <dt className="text-white/55">{tr ? 'Elektrik' : 'Electricity'}</dt>
          <dd>{fmtMoneyExact(current.power)}</dd>
        </div>
        <div>
          <dt className="text-white/55">{tr ? 'Bakım' : 'Maintenance'}</dt>
          <dd>{fmtMoneyExact(current.maintenance)}</dd>
        </div>
      </dl>
      {expansion && (
        <details className="mt-3 border-t border-white/10 pt-3" open={expanded}>
          <summary className="cursor-pointer font-semibold">{tr ? 'Genişletme hesabı' : 'Expansion estimate'}</summary>
          <dl className="mt-2 space-y-2">
            <div>
              <dt className="text-white/55">{tr ? 'Yatırım bedeli' : 'Investment cost'}</dt>
              <dd>{fmtMoneyExact(expansion.cost)}</dd>
            </div>
            <div>
              <dt className="text-white/55">{tr ? 'Ek aylık net katkı' : 'Added monthly net contribution'}</dt>
              <dd className={expansion.addedNet >= 0 ? 'text-neon-lime' : 'text-neon-red'}>
                {fmtMoneyExact(expansion.addedNet)}
              </dd>
            </div>
            <div>
              <dt className="text-white/55">{tr ? 'Tahmini geri ödeme' : 'Estimated payback'}</dt>
              <dd>
                {expansion.paybackMonths === null
                  ? tr
                    ? 'Bu koşullarda geri ödeme beklenmiyor.'
                    : 'No payback expected under these conditions.'
                  : `${expansion.paybackMonths.toLocaleString(tr ? 'tr-TR' : 'en-US', { maximumFractionDigits: 1 })} ${tr ? 'oyun ayı' : 'game months'}`}
              </dd>
            </div>
            <div>
              <dt className="text-white/55">{tr ? 'Yatırım sonrası nakit' : 'Cash after investment'}</dt>
              <dd className={expansion.cashAfter < 0 ? 'text-neon-red' : ''}>{fmtMoneyExact(expansion.cashAfter)}</dd>
            </div>
          </dl>
          {blockedText && <p className="mt-2 text-neon-amber">{blockedText}</p>}
          {expansion.runwayMonths !== null && (
            <p className="mt-2 text-neon-amber">
              {tr
                ? `Şirket hâlâ aylık nakit kaybediyor. Kalan nakit yaklaşık ${expansion.runwayMonths.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} oyun ayı yeter.`
                : `The company still loses cash each month. Remaining cash lasts about ${expansion.runwayMonths.toFixed(1)} game months.`}
            </p>
          )}
        </details>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-white/45">
        {tr
          ? 'Mevcut talep, çalışma modu, paket kaybı ve enerji tarifesiyle tahmin edilir. Saha neti elektrik ve bakımı düşer; ortak personel, fiber, kredi ve araştırma giderlerini içermez. Şirketin nakit süresi hesabı personel ve kredi taksitlerini de içerir.'
          : 'Estimated at current demand, workload, packet loss and energy prices. Site net subtracts power and maintenance; shared staff, fibre, loans and research are excluded. Company cash runway also includes staff and loan payments.'}
      </p>
    </section>
  );
}
