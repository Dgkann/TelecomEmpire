import { fmtMoney } from '../../../game/economy';
import { plural } from '../../../game/util';
import { loanRate, monthlyDebtService } from '../../../game/finance';
import { t } from '../../i18n';
import type { CompanyModel } from './model';

export default function BorrowingPanel({ vm }: { vm: CompanyModel }) {
  return (
    <div className="panel panel-tone-amber p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-widest text-white/50">
        {t(vm.locale, 'borrowing')}
      </h2>
      <p className="mb-3 text-[11px] text-white/40">{t(vm.locale, 'borrowingBlurb')}</p>

      {vm.graceLeft !== null && (
        <div className="alert-blink mb-3 rounded-lg border border-neon-red/40 bg-neon-red/10 p-3">
          <div className="text-sm font-semibold text-neon-red">{t(vm.locale, 'pastCreditLimit')}</div>
          <div className="num text-[11px] text-white/60">
            {Math.ceil(vm.graceLeft)} {plural(Math.ceil(vm.graceLeft), 'day')} before the banks act
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="chip py-2">
          <div className="stat-label">{t(vm.locale, 'owed')}</div>
          <div className={`num text-sm ${vm.debt > 0 ? 'text-neon-amber' : 'text-white'}`}>{fmtMoney(vm.debt)}</div>
        </div>
        <div className="chip py-2">
          <div className="stat-label">{t(vm.locale, 'canBorrow')}</div>
          <div className="num text-sm text-neon-cyan">{fmtMoney(vm.headroom)}</div>
        </div>
        <div className="chip py-2">
          <div className="stat-label">{t(vm.locale, 'rate')}</div>
          <div className="num text-sm">{(loanRate(vm.game) * 100).toFixed(1)}%</div>
        </div>
      </div>

      {vm.game.loans.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {vm.game.loans.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div>
                <div className="num text-sm">{fmtMoney(l.remaining)} left</div>
                <div className="num text-[10px] text-white/40">
                  {fmtMoney(l.monthlyPayment)}/mo at {(l.rateAnnual * 100).toFixed(1)}%
                </div>
              </div>
              <button className="btn px-2 py-1 text-[11px]" onClick={() => vm.repayLoan(l.id)}>
                {t(vm.locale, 'clear')}
              </button>
            </div>
          ))}
          <div className="num mt-1 text-[11px] text-white/45">
            Debt service {fmtMoney(monthlyDebtService(vm.game))}/mo
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="stat-label">{t(vm.locale, 'drawDown')}</span>
          <span className="num text-lg font-semibold text-neon-cyan">{fmtMoney(vm.borrowAmount)}</span>
        </div>
        <input
          type="range"
          aria-label="Loan amount"
          min={0}
          max={Math.max(10000, vm.headroom)}
          step={5000}
          value={Math.min(vm.borrowAmount, vm.headroom)}
          onChange={(e) => vm.setBorrowAmount(Number(e.target.value))}
          className="mt-1 w-full"
        />
        <div className="num mt-1 flex justify-between text-[10px] text-white/35">
          <span>over 36 months</span>
          <span>about {fmtMoney(vm.estimatedPayment)}/mo</span>
        </div>
        <button
          className="btn-primary mt-2 w-full"
          disabled={vm.borrowAmount < 5000 || vm.borrowAmount > vm.headroom}
          onClick={() => vm.takeLoan(vm.borrowAmount, 36)}
        >
          {vm.borrowAmount > vm.headroom ? 'More than they will lend' : `Borrow ${fmtMoney(vm.borrowAmount)}`}
        </button>
      </div>
    </div>
  );
}
