import { fmtMoney, monthlyBreakdown } from '../../../game/economy';
import { useGame } from '../../../store/gameStore';
import { t, type TranslationKey } from '../../i18n';
import type { ChurnReason } from '../../../game/types';

export const CHURN_REASON: Record<ChurnReason, TranslationKey> = {
  price: 'churnPrice',
  outage: 'churnOutage',
  congestion: 'churnCongestion',
  support: 'churnSupport',
  coverage: 'churnCoverage',
  competition: 'churnCompetition',
  satisfaction: 'churnSatisfaction',
};

export const HIRE_ROLES = ['network_engineer', 'noc_engineer', 'support', 'sales', 'security'] as const;

export function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-white/55">{label}</span>
      <span className={`num ${tone ?? 'text-white'}`}>{value}</span>
    </div>
  );
}

export function GrowthDriver({
  label,
  value,
  fill,
  tone,
}: {
  label: string;
  value: string;
  fill: number;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-white/[0.07] bg-black/15 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="text-white/45">{label}</span>
        <span className="num font-semibold" style={{ color: tone }}>
          {value}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, fill))}%`, background: tone }}
        />
      </div>
    </div>
  );
}

export function ProfitBridge({ money }: { money: ReturnType<typeof monthlyBreakdown> }) {
  const locale = useGame((s) => s.locale);
  const network = money.costPower + money.costMaintenance + money.costTransit;
  const growth = money.costMarketing + money.costRetention;
  const other = Math.max(0, money.totalCost - network - money.costSalaries - growth);
  const deductions = [
    { label: 'Network', value: network, color: '#7199bd' },
    { label: 'People', value: money.costSalaries, color: '#9183ad' },
    { label: 'Growth', value: growth, color: '#d2a657' },
    ...(other > 0.5 ? [{ label: 'Other', value: other, color: '#9aa7ad' }] : []),
  ];
  let remaining = money.totalRevenue;
  const floor = Math.min(0, money.profit);
  const ceiling = Math.max(1, money.totalRevenue);
  const span = ceiling - floor;
  const zeroLeft = ((0 - floor) / span) * 100;

  return (
    <div className="mt-4 border-t border-white/[0.07] pt-4" aria-label="Monthly profit bridge">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="stat-label">{t(locale, 'monthlyProfitBridge')}</div>
          <div className="text-[10px] text-white/40">{t(locale, 'whereRevenueGoes')}</div>
        </div>
        <div className={`num text-sm font-semibold ${money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
          {money.profit >= 0 ? '+' : ''}
          {fmtMoney(money.profit)}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[68px_minmax(0,1fr)_64px] items-center gap-2 text-[10px]">
          <span className="text-white/55">{t(locale, 'revenue')}</span>
          <span className="relative h-2 overflow-hidden rounded-sm bg-white/[0.05]">
            <i
              className="absolute h-full rounded-sm bg-neon-lime/75"
              style={{ left: `${((0 - floor) / span) * 100}%`, width: `${(money.totalRevenue / span) * 100}%` }}
            />
            <b className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${zeroLeft}%` }} />
          </span>
          <span className="num text-right text-neon-lime">{fmtMoney(money.totalRevenue)}</span>
        </div>
        {deductions.map((item) => {
          const after = remaining - item.value;
          const left = ((Math.min(remaining, after) - floor) / span) * 100;
          const width = (item.value / span) * 100;
          remaining = after;
          return (
            <div key={item.label} className="grid grid-cols-[68px_minmax(0,1fr)_64px] items-center gap-2 text-[10px]">
              <span className="text-white/55">{item.label}</span>
              <span className="relative h-2 overflow-hidden rounded-sm bg-white/[0.05]">
                <i
                  className="absolute h-full rounded-sm"
                  style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0.8, width)}%`, background: item.color }}
                />
                <b className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${zeroLeft}%` }} />
              </span>
              <span className="num text-right text-white/55">−{fmtMoney(item.value)}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-[68px_minmax(0,1fr)_64px] items-center gap-2 border-t border-white/[0.06] pt-1.5 text-[10px]">
          <span className="font-semibold text-white/75">Net</span>
          <span className="relative h-2 overflow-hidden rounded-sm bg-white/[0.05]">
            <i
              className={`absolute h-full rounded-sm ${money.profit >= 0 ? 'bg-neon-lime' : 'bg-neon-red'}`}
              style={{
                left: `${((Math.min(0, money.profit) - floor) / span) * 100}%`,
                width: `${(Math.abs(money.profit) / span) * 100}%`,
              }}
            />
            <b className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${zeroLeft}%` }} />
          </span>
          <span className={`num text-right font-semibold ${money.profit >= 0 ? 'text-neon-lime' : 'text-neon-red'}`}>
            {money.profit >= 0 ? '+' : ''}
            {fmtMoney(money.profit)}
          </span>
        </div>
      </div>
    </div>
  );
}
