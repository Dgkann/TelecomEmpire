import { fmtMoney, priceIndex } from '../../game/economy';
import { networkResilience, regulationCopy, regulationProgress } from '../../game/regulator';
import { t } from '../i18n';
import type { SideModel } from './model';

export default function ObligationsSection({ sp }: { sp: SideModel }) {
  const { locale, game, tr, focus, select, activeSection, setMobileOpen, obligations } = sp;
  return (
    <>
      {activeSection === 'obligations' && (
        <>
          {obligations.map((r) => {
            const progress = regulationProgress(game, r);
            const daysLeft = Math.max(0, Math.ceil((r.dueAt - game.minutes) / 1440));
            const district = r.districtId ? game.districts.find((entry) => entry.id === r.districtId) : null;
            const current =
              r.kind === 'coverage'
                ? (district?.coverage ?? 0)
                : r.kind === 'price_cap'
                  ? priceIndex(game)
                  : networkResilience(game);
            const copy = regulationCopy(r, game, tr);
            const targetText =
              r.kind === 'price_cap'
                ? tr
                  ? `en fazla ${r.target.toFixed(2)}×`
                  : `${r.target.toFixed(2)}× max`
                : tr
                  ? `%${Math.round(r.target * 100)}`
                  : `${Math.round(r.target * 100)}%`;
            const currentText =
              r.kind === 'price_cap'
                ? tr
                  ? `şu an ${current.toFixed(2)}×`
                  : `${current.toFixed(2)}× now`
                : tr
                  ? `şu an %${Math.round(current * 100)}`
                  : `${Math.round(current * 100)}% now`;
            const urgent = daysLeft <= 7 && progress < 1;
            return (
              <div
                key={r.id}
                className={`pointer-events-auto panel overflow-hidden p-3 ${urgent ? 'border-neon-red/55' : 'border-neon-amber/45'}`}
              >
                <div className={`absolute inset-y-0 left-0 w-0.5 ${urgent ? 'bg-neon-red' : 'bg-neon-amber'}`} />
                <div className="flex items-center justify-between">
                  <div
                    className={`text-[10px] font-semibold uppercase tracking-widest ${urgent ? 'text-neon-red' : 'text-neon-amber'}`}
                  >
                    {copy.title}
                  </div>
                  <div className={`num text-[10px] ${urgent ? 'text-neon-red' : 'text-white/55'}`}>
                    {daysLeft}
                    {tr ? ' gün kaldı' : 'd left'}
                  </div>
                </div>
                <div className="mt-1 text-[11px] leading-snug text-white/65">{copy.detail}</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="rounded-sm bg-black/20 px-2 py-1.5">
                    <div className="text-white/40">{t(locale, 'current')}</div>
                    <div className="num text-white/80">{currentText}</div>
                  </div>
                  <div className="rounded-sm bg-black/20 px-2 py-1.5">
                    <div className="text-white/40">{t(locale, 'target')}</div>
                    <div className="num text-neon-amber">{targetText}</div>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress * 100}%`,
                      background: progress >= 1 ? '#76b98a' : urgent ? '#d36e76' : '#d2a657',
                    }}
                  />
                </div>
                <div
                  className={`mt-2 rounded-sm border px-2 py-1.5 ${progress >= 1 ? 'border-neon-lime/25 bg-neon-lime/[0.06]' : 'border-neon-red/25 bg-neon-red/[0.07]'}`}
                >
                  <div className="text-[9px] uppercase tracking-wider text-white/45">
                    {progress >= 1 ? (tr ? 'Durum' : 'Status') : tr ? 'Süre riski' : 'Deadline risk'}
                  </div>
                  <div
                    className={`num text-[11px] font-semibold ${progress >= 1 ? 'text-neon-lime' : 'text-neon-red'}`}
                  >
                    {progress >= 1
                      ? tr
                        ? 'Yolunda · +4 itibar'
                        : 'On track · +4 reputation'
                      : tr
                        ? `${fmtMoney(r.fine)} ceza · −8 itibar`
                        : `${fmtMoney(r.fine)} fine · −8 reputation`}
                  </div>
                </div>
                {district && (
                  <button
                    className="mt-2 w-full rounded-sm border border-neon-cyan/25 bg-neon-cyan/[0.06] px-2 py-1.5 text-[10px] font-semibold text-neon-cyan hover:bg-neon-cyan/[0.12]"
                    onClick={() => {
                      focus(district.center.gx, district.center.gy);
                      select({ type: 'district', id: district.id });
                      setMobileOpen(false);
                    }}
                  >
                    {tr ? `${district.name} ilçesini haritada aç →` : `Open ${district.name} on map →`}
                  </button>
                )}
              </div>
            );
          })}
          {obligations.length === 0 && (
            <div className="panel p-4 text-center">
              <div className="text-xs font-semibold text-neon-lime">
                {tr ? 'Bekleyen son tarih yok' : 'No deadlines pending'}
              </div>
              <div className="mt-1 text-[10px] text-white/40">
                {tr ? 'Şu an bekleyen düzenleyici yükümlülük yok.' : 'Regulatory obligations are currently clear.'}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
