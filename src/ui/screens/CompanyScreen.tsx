import StrategyDesk from '../StrategyDesk';
import { useGame } from '../../store/gameStore';
import { t } from '../i18n';
import ScenarioCard from '../ScenarioCard';
import { useCompanyModel } from './company/model';
import StandingPanel from './company/StandingPanel';
import WholesalePanel from './company/WholesalePanel';
import MomentumPanel from './company/MomentumPanel';
import PackagesPanel from './company/PackagesPanel';
import FinancesPanel from './company/FinancesPanel';
import LedgerPanel from './company/LedgerPanel';
import ContractsPanel from './company/ContractsPanel';
import BorrowingPanel from './company/BorrowingPanel';
import ChurnPanel from './company/ChurnPanel';
import StaffPanel from './company/StaffPanel';

export default function CompanyScreen() {
  const vm = useCompanyModel();

  return (
    <div className="screen-shell">
      <div className="mx-auto grid max-w-[1240px] gap-5 lg:grid-cols-3">
        <div className="flex flex-wrap items-end justify-between gap-4 lg:col-span-3">
          <div>
            <div className="stat-label text-neon-cyan">{t(vm.locale, 'commercialControl')}</div>
            <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
              {t(vm.locale, 'operatorPerformance')}
            </h1>
            <p className="mt-1 text-[13px] text-white/45">{t(vm.locale, 'operatorPerformanceBlurb')}</p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-right ${vm.money.profit >= 0 ? 'border-neon-lime/20 bg-neon-lime/[0.05]' : 'border-neon-red/30 bg-neon-red/[0.07]'}`}
          >
            <div className="stat-label">{t(vm.locale, 'operatingPosition')}</div>
            <div className={`text-sm font-semibold ${vm.money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
              {vm.money.profit >= 0 ? 'Profitable' : 'Costs exceed revenue'}
            </div>
          </div>
        </div>
        <button className="market-entry lg:col-span-3" onClick={() => useGame.getState().setScreen('market')}>
          <span>
            <strong className="block text-lg">{t(vm.locale, 'openMarketControl')}</strong>
            <span className="mt-1 block text-xs text-white/60">{t(vm.locale, 'marketControlBlurb')}</span>
          </span>
          <span className="shrink-0 text-sm text-[#ed9e77]">
            {vm.game.competition.moves.filter((move) => move.endsAt > vm.game.minutes).length} rival moves
          </span>
        </button>
        <ScenarioCard game={vm.game} />
        <StrategyDesk />

        <StandingPanel vm={vm} />
        <WholesalePanel vm={vm} />
        <MomentumPanel vm={vm} />
        <PackagesPanel vm={vm} />
        <FinancesPanel vm={vm} />
        <LedgerPanel vm={vm} />
        <ContractsPanel vm={vm} />
        <BorrowingPanel vm={vm} />
        <ChurnPanel vm={vm} />
        <StaffPanel vm={vm} />
      </div>
    </div>
  );
}
