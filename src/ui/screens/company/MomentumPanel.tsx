import { fmtMoney } from '../../../game/economy';
import { t } from '../../i18n';
import type { CompanyModel } from './model';

export default function MomentumPanel({ vm }: { vm: CompanyModel }) {
  const tr = vm.locale === 'tr';
  const perMonth = tr ? '/ay' : '/mo';
  const upTo = (amount: number) =>
    tr
      ? `Mevcut teslim kalitesiyle ayda en fazla ${fmtMoney(amount)}`
      : `Up to ${fmtMoney(amount)}/mo at current delivery quality`;
  return (
    <div className="panel panel-tone-amber p-5 lg:col-span-3">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(vm.locale, 'wholesalePartnerships')}
          </h2>
          <p className="mt-1 text-[11px] text-white/40">
            {tr
              ? 'Boştaki kapsamanı ortak markalara sat. Gelir hemen gelir; onların trafiği en düşük öncelikle yarışır.'
              : 'Sell spare reach to partner brands. Revenue arrives immediately; their traffic competes at the lowest priority.'}
          </p>
        </div>
        <div className="text-right">
          <div className="stat-label">{t(vm.locale, 'wholesaleRevenue')}</div>
          <div className="num text-lg font-semibold text-neon-lime">
            {fmtMoney(vm.money.revenueWholesale)}
            {perMonth}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 ${vm.game.wholesaleFixed ? 'border-neon-amber/40 bg-neon-amber/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}
        >
          <div>
            <div className="text-sm font-semibold">{t(vm.locale, 'fixedNetworkAccess')}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-white/40">
              {t(vm.locale, 'fixedNetworkAccessBlurb')}
            </div>
            <div className="num mt-1 text-[10px] text-neon-amber">{upTo(vm.fixedWholesalePotential)}</div>
          </div>
          <input
            type="checkbox"
            checked={vm.game.wholesaleFixed}
            onChange={vm.toggleWholesaleFixed}
            className="h-4 w-4 shrink-0 accent-[#f3b843]"
          />
        </label>
        <label
          className={`flex items-center justify-between gap-4 rounded-xl border p-3 ${vm.game.mvnoEnabled ? 'border-neon-violet/40 bg-neon-violet/[0.07]' : 'border-white/10 bg-white/[0.03]'} ${vm.mods.hasMobile && vm.game.spectrum.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
        >
          <div>
            <div className="text-sm font-semibold">{t(vm.locale, 'mvnoRadioAccess')}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-white/40">{t(vm.locale, 'mvnoRadioAccessBlurb')}</div>
            <div className="num mt-1 text-[10px] text-neon-violet">{upTo(vm.mvnoPotential)}</div>
          </div>
          <input
            type="checkbox"
            disabled={!vm.mods.hasMobile || !vm.game.spectrum.length}
            checked={vm.game.mvnoEnabled}
            onChange={vm.toggleMvno}
            className="h-4 w-4 shrink-0 accent-[#a78bfa]"
          />
        </label>
      </div>
    </div>
  );
}
