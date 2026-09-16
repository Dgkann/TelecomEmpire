import { fmtMoneyExact } from '../../../game/economy';
import { plural } from '../../../game/util';
import type { FinanceCategory } from '../../../game/types';
import { t } from '../../i18n';
import type { CompanyModel } from './model';

const CATEGORY_TR: Record<FinanceCategory, string> = {
  residential: 'konut',
  mobile: 'mobil',
  business: 'ticari',
  enterprise: 'kurumsal',
  hosting: 'barındırma',
  wholesale: 'toptan',
  salaries: 'maaşlar',
  power: 'enerji',
  maintenance: 'bakım',
  transit: 'transit',
  marketing: 'pazarlama',
  retention: 'elde tutma',
  sla_penalty: 'SLA cezası',
  loan_draw: 'kredi kullanımı',
  loan_payment: 'kredi ödemesi',
  spectrum: 'spektrum',
  research: 'araştırma',
  staff: 'personel',
  strategic_investment: 'stratejik yatırım',
  company_acquisition: 'şirket satın alma',
  network_build: 'şebeke kurulumu',
  network_upgrade: 'şebeke yükseltmesi',
  network_service: 'şebeke servisi',
  district_licence: 'ilçe lisansı',
  incident_response: 'arıza müdahalesi',
  contract_bonus: 'sözleşme primi',
  campaign: 'kampanya',
  asset_sale: 'varlık satışı',
  milestone_reward: 'hedef ödülü',
  regulatory_fine: 'düzenleyici ceza',
  market_operation: 'pazar operasyonu',
  tender_bond: 'ihale teminatı',
  tender_payment: 'ihale ödemesi',
};

export default function LedgerPanel({ vm }: { vm: CompanyModel }) {
  const tr = vm.locale === 'tr';
  const entries = vm.game.ledger.length;
  return (
    <div className="panel panel-tone-green p-5 lg:col-span-2">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">
            {t(vm.locale, 'financeLedger')}
          </h2>
          <p className="mt-1 text-[11px] text-white/35">
            {tr
              ? 'İşletme geliri, şebeke projeleri, servis işleri, lisanslar, araştırma, personel, spektrum ve finansman tek yerde.'
              : 'Operating income, network projects, service work, licences, research, staffing, spectrum, and financing in one place.'}
          </p>
        </div>
        <span className="num text-[10px] text-white/35">
          {entries} {tr ? 'kayıt' : plural(entries, 'entry', 'entries')}
        </span>
      </div>
      {vm.game.ledger.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-[11px] text-white/40">
          {t(vm.locale, 'ledgerEmpty')}
        </div>
      ) : (
        <div className="scroll-thin max-h-[310px] overflow-y-auto rounded-lg border border-white/[0.07]">
          {vm.game.ledger.slice(0, 40).map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.06] px-3 py-2 last:border-0"
            >
              <span className="num text-[9px] uppercase text-white/30">
                {tr ? `${Math.floor(entry.at / 1440) + 1}. gün` : `Day ${Math.floor(entry.at / 1440) + 1}`}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12px] text-white/75">{entry.label}</div>
                <div className="text-[9px] uppercase tracking-wider text-white/30">
                  {tr ? CATEGORY_TR[entry.category] : entry.category.replace(/_/g, ' ')}
                </div>
              </div>
              <span
                className={`num text-[12px] font-semibold ${entry.amount >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}
              >
                {entry.amount >= 0 ? '+' : ''}
                {fmtMoneyExact(entry.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
