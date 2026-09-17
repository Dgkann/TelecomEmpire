import { useState } from 'react';
import { plural } from '../../game/util';
import { useGame } from '../../store/gameStore';
import { t } from '../i18n';
import { districtPull, rivalPosture, rivalArpu } from '../../game/competitors';
import { customerGrowthSnapshot } from '../../game/simulation';
import {
  MARKET_TACTICS,
  RIVAL_MOVES,
  OPERATION_MINUTES,
  districtFixedCustomers,
  operationCost,
  operationIssue,
  marketEffects,
  servicePromiseReady,
} from '../../game/competition';
import { MINUTES_PER_DAY } from '../../game/constants';
import { fmtMoneyExact } from '../../game/economy';
import type { GameState, MarketTactic } from '../../game/types';
import TrendChart from '../TrendChart';

const signed = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1);
const daysLeft = (at: number, now: number) => Math.max(0, (at - now) / MINUTES_PER_DAY).toFixed(1);
const customerLabel = (n: number, tr: boolean) =>
  `${Math.round(n)} ${tr ? 'müşteri' : plural(Math.round(n), 'customer')}`;
const colours = { player: '#80c6b8', unserved: '#344954' };

function MarketMap({
  game,
  selected,
  onSelect,
  tr,
}: {
  game: GameState;
  selected: string;
  onSelect: (id: string) => void;
  tr: boolean;
}) {
  return (
    <svg
      viewBox={`-1 -1 ${game.gridSize + 2} ${game.gridSize + 2}`}
      className="mx-auto aspect-square w-full max-w-[410px]"
      aria-label={tr ? 'İlçe rekabet haritası' : 'District competition map'}
      role="group"
    >
      {game.districts.map((d) => {
        const pull = districtPull(game, d);
        const rival = [...pull.rivals].sort((a, b) => b.pull - a.pull)[0];
        const leader = !rival || pull.player >= rival.pull ? null : game.competitors.find((c) => c.id === rival.id);
        const pressure = game.competition.moves.some((m) => m.districtId === d.id && m.endsAt > game.minutes);
        return (
          <g
            key={d.id}
            role="button"
            tabIndex={0}
            aria-label={tr ? `${d.name} ilçesini incele` : `Inspect ${d.name}`}
            aria-pressed={selected === d.id}
            onClick={() => onSelect(d.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(d.id);
              }
            }}
            className="market-district cursor-pointer"
            style={{ '--district-colour': leader?.color ?? colours.player } as React.CSSProperties}
          >
            {d.cells.map((c) => (
              <rect
                key={`${c.gx}-${c.gy}`}
                x={c.gx}
                y={c.gy}
                width={0.93}
                height={0.93}
                rx={0.12}
                fill={leader?.color ?? colours.player}
                fillOpacity={selected === d.id ? 0.8 : 0.32}
                stroke={selected === d.id ? '#e2f2ed' : 'transparent'}
                strokeWidth={0.05}
              />
            ))}
            <circle
              cx={d.center.gx + 0.5}
              cy={d.center.gy + 0.5}
              r={pressure ? 1 : 0.6}
              fill={pressure ? '#ed9e77' : '#102632'}
              stroke={selected === d.id ? '#fff' : '#b2c7c8'}
              strokeWidth={0.12}
            />
            {pressure && (
              <text
                x={d.center.gx + 0.5}
                y={d.center.gy + 0.9}
                fontSize={1.3}
                textAnchor="middle"
                fill="#172631"
                fontWeight={700}
              >
                !
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DistrictDesk({ id }: { id: string }) {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const launch = useGame((s) => s.launchMarketOperation);
  const end = useGame((s) => s.endMarketOperation);
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const [kind, setKind] = useState<MarketTactic>('switchers');
  const [message, setMessage] = useState('');
  const district = game.districts.find((d) => d.id === id)!;
  const current = game.competition.operations.find((o) => o.districtId === id);
  const moves = game.competition.moves.filter((m) => m.districtId === id && m.endsAt > game.minutes);
  const growth = customerGrowthSnapshot(game, district);
  const pull = districtPull(game, district);
  const cost = operationCost(game, id, kind);
  const issue = operationIssue(game, id, kind, locale);
  const tr = locale === 'tr';
  const preview = (() => {
    const hypothetical = {
      ...game,
      competition: {
        ...game.competition,
        operations: [
          ...game.competition.operations.filter((o) => o.districtId !== id),
          {
            id: 'preview',
            districtId: id,
            kind,
            startedAt: game.minutes,
            endsAt: game.minutes + OPERATION_MINUTES,
            cost,
            baselineCustomers: 0,
            qualifiedMinutes: 0,
          },
        ],
      },
    };
    return customerGrowthSnapshot(hypothetical, district);
  })();
  const samples = game.competition.snapshots.flatMap((p) => {
    const d = p.districts.find((d) => d.id === id);
    return d ? [d.customers] : [];
  });
  const bars = [
    { id: 'player', name: game.companyName, value: pull.player, color: colours.player },
    ...pull.rivals.map((r) => ({
      id: r.id,
      name: game.competitors.find((c) => c.id === r.id)!.name,
      value: r.pull,
      color: game.competitors.find((c) => c.id === r.id)!.color,
    })),
  ].sort((a, b) => b.value - a.value);
  return (
    <section className="min-w-0" aria-label={tr ? 'İlçe rekabet masası' : 'District competition desk'}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs text-white/50">{t(locale, 'districtCommercialDesk')}</p>
          <h2 className="market-heading mt-1">{district.name}</h2>
        </div>
        <button
          className="btn text-xs"
          onClick={() => {
            focus(district.center.gx, district.center.gy);
            select({ type: 'district', id });
          }}
        >
          {t(locale, 'inspectNetwork')}
        </button>
      </div>
      <dl className="my-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-white/50">{t(locale, 'fixedCustomers')}</dt>
          <dd className="mt-1 text-xl font-semibold">
            {Math.round(districtFixedCustomers(game, id)).toLocaleString(tr ? 'tr-TR' : undefined)}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">{t(locale, 'fixedReach')}</dt>
          <dd className="mt-1 text-xl font-semibold">{Math.round(district.coverage * 100)}%</dd>
        </div>
        <div>
          <dt className="text-white/50">{t(locale, 'satisfaction')}</dt>
          <dd className="mt-1 text-xl font-semibold">
            {district.satisfaction.toFixed(0)}
            <span className="text-xs text-white/40"> /100</span>
          </dd>
        </div>
      </dl>
      {moves.map((m) => (
        <div key={m.id} className="mb-3 rounded border-l-2 border-[#ed9e77] bg-[#ed9e77]/10 p-3 text-xs" role="note">
          <strong className="text-[#f4b18f]">
            {game.competitors.find((c) => c.id === m.rivalId)?.name ?? (tr ? 'Rakip' : 'Rival')}:{' '}
            {tr ? RIVAL_MOVES[m.kind].titleTr : RIVAL_MOVES[m.kind].title}
          </strong>
          <p className="mt-1 text-white/65">
            {tr
              ? `${RIVAL_MOVES[m.kind].detailTr} ${daysLeft(m.endsAt, game.minutes)} gün kaldı.`
              : `${RIVAL_MOVES[m.kind].detail} ${daysLeft(m.endsAt, game.minutes)} days remaining.`}
          </p>
        </div>
      ))}
      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label={tr ? 'Yerel pazar cazibesi' : 'Local market appeal'}>
          <h3 className="text-sm font-semibold">{t(locale, 'whoWinsNextDecision')}</h3>
          <p className="mt-1 text-xs text-white/45">
            {tr
              ? 'Geçiş yapmayan müşteriler dahil pazar cazibesindeki pay. Bunlar hedeftir, mevcut abone payları değildir.'
              : 'Share of market appeal, including customers who do not switch. These are targets, not current subscriber shares.'}
          </p>
          <div className="mt-3 space-y-3">
            {bars.map((b) => (
              <div key={b.id}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span>{b.name}</span>
                  <span>{((b.value / pull.total) * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded bg-white/5">
                  <div
                    className="h-full rounded"
                    style={{ background: b.color, width: (b.value / pull.total) * 100 + '%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section aria-label={tr ? 'İlçe müşteri geçmişi' : 'District customer history'}>
          <h3 className="text-sm font-semibold">{t(locale, 'customerTrajectory')}</h3>
          <p className="mt-1 text-xs text-white/45">
            {tr
              ? `Son ${samples.length} günlük gözlem. Tüm pazar etkenleri dahil.`
              : `Last ${samples.length} daily observations. All market factors included.`}
          </p>
          {samples.length >= 2 ? (
            <div className="mt-3">
              <TrendChart
                tr={tr}
                series={[{ label: t(locale, 'fixedCustomers'), values: samples, color: colours.player }]}
                formatValue={(n) => n.toFixed(0)}
                height={105}
              />
            </div>
          ) : (
            <p className="mt-6 border-l-2 border-white/15 pl-3 text-xs text-white/45">
              {t(locale, 'dailySamplesAppear')}
            </p>
          )}
          <p className="mt-3 text-xs text-white/60">
            {tr ? 'Mevcut model:' : 'Current model:'}{' '}
            <strong className={growth.projectedDailyDelta >= 0 ? 'text-neon-cyan' : 'text-neon-red'}>
              {tr
                ? `günde ${signed(growth.projectedDailyDelta)} sabit müşteri`
                : `${signed(growth.projectedDailyDelta)} fixed customers/day`}
            </strong>
          </p>
        </section>
      </div>
      <section
        className="mt-6 rounded-lg border border-[#80c6b8]/25 bg-[#18323b] p-4 sm:p-5"
        aria-label={tr ? 'Ticari operasyon' : 'Commercial operation'}
      >
        {current ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-neon-cyan">{t(locale, 'operationInProgress')}</p>
                <h3 className="mt-1 text-lg font-semibold">
                  {tr ? MARKET_TACTICS[current.kind].titleTr : MARKET_TACTICS[current.kind].title}
                </h3>
              </div>
              <p className="text-sm text-neon-cyan">
                {daysLeft(current.endsAt, game.minutes)} {tr ? 'gün kaldı' : 'days left'}
              </p>
            </div>
            <div
              className="mt-4 h-1.5 rounded bg-black/20"
              role="progressbar"
              aria-label={tr ? 'Operasyon ilerlemesi' : 'Operation elapsed'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, (game.minutes - current.startedAt) / OPERATION_MINUTES) * 100)}
            >
              <div
                className="h-full rounded bg-neon-cyan"
                style={{ width: Math.min(100, ((game.minutes - current.startedAt) / OPERATION_MINUTES) * 100) + '%' }}
              />
            </div>
            <p className="mt-3 text-sm text-white/65">
              {tr ? MARKET_TACTICS[current.kind].detailTr : MARKET_TACTICS[current.kind].detail}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div>
                <dt className="text-white/45">{t(locale, 'programmePaid')}</dt>
                <dd>{fmtMoneyExact(current.cost)}</dd>
              </div>
              <div>
                <dt className="text-white/45">{t(locale, 'netFixedCustomerChange')}</dt>
                <dd>{signed(districtFixedCustomers(game, id) - current.baselineCustomers)}</dd>
              </div>
              <div>
                <dt className="text-white/45">{t(locale, 'liveAppealMultiplier')}</dt>
                <dd>{marketEffects(game, id).appeal.toFixed(2)}×</dd>
              </div>
            </dl>
            {current.kind === 'service' && (
              <div className="mt-4 border-t border-white/10 pt-3 text-xs">
                <strong className={servicePromiseReady(game, id) ? 'text-neon-cyan' : 'text-neon-amber'}>
                  {servicePromiseReady(game, id)
                    ? tr
                      ? 'Hizmet standardı şu an karşılanıyor'
                      : 'Service standard met now'
                    : tr
                      ? 'Hizmet standardı karşılanmıyor'
                      : 'Service standard not met'}
                </strong>
                <p className="mt-1 text-white/60">
                  {tr
                    ? `Uygun süre: iki haftalık sürenin %${((current.qualifiedMinutes / OPERATION_MINUTES) * 100).toFixed(1)} kadarı · gereken %80. Şebeke sağlığı %${game.stats.health.toFixed(0)}; ilçe kesintisi ${game.stats.outages[id] ? 'var' : 'yok'}.`
                    : `Qualified: ${((current.qualifiedMinutes / OPERATION_MINUTES) * 100).toFixed(1)}% of the fortnight / 80% required. Network health ${game.stats.health.toFixed(0)}%; district outage ${game.stats.outages[id] ? 'active' : 'clear'}.`}
                </p>
                <p className="mt-2 text-white/50">
                  {tr ? MARKET_TACTICS.service.tradeoffTr : MARKET_TACTICS.service.tradeoff}
                </p>
              </div>
            )}
            <button
              className="btn mt-4 text-xs"
              onClick={() =>
                setMessage(
                  end(current.id)
                    ? tr
                      ? 'Operasyon sonlandırıldı. Peşin ödenen bedel iade edilmez.'
                      : 'Operation ended. The upfront cost is not refunded.'
                    : tr
                      ? 'Operasyon artık mevcut değil.'
                      : 'Operation is no longer available.',
                )
              }
            >
              {tr ? 'Operasyonu bitir · iade yok' : 'End operation · no refund'}
              {current.kind === 'service' ? (tr ? ' · −3 itibar' : ' · −3 reputation') : ''}
            </button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold">{t(locale, 'chooseYourResponse')}</h3>
            <p className="mt-1 text-xs text-white/55">{t(locale, 'operationRulesBlurb')}</p>
            <div
              className="mt-4 grid gap-2 sm:grid-cols-3"
              role="radiogroup"
              aria-label={tr ? 'Pazar yanıtı' : 'Market response'}
            >
              {(Object.keys(MARKET_TACTICS) as MarketTactic[]).map((k) => (
                <label
                  key={k}
                  className={`cursor-pointer rounded border p-3 text-xs ${kind === k ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-white/10'}`}
                >
                  <input
                    type="radio"
                    name="market-tactic"
                    value={k}
                    checked={kind === k}
                    onChange={() => {
                      setKind(k);
                      setMessage('');
                    }}
                    className="mr-2 accent-teal-400"
                  />
                  {tr ? MARKET_TACTICS[k].titleTr : MARKET_TACTICS[k].title}
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-white/80">
              {tr ? MARKET_TACTICS[kind].detailTr : MARKET_TACTICS[kind].detail}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/50">
              {tr ? MARKET_TACTICS[kind].tradeoffTr : MARKET_TACTICS[kind].tradeoff}
            </p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-white/10 pt-4">
              <div>
                <p className="text-xs text-white/50">{t(locale, 'fullProgrammeCost')}</p>
                <strong className="text-xl">{fmtMoneyExact(cost)}</strong>
              </div>
              <div className="text-xs">
                <p className="text-white/50">{t(locale, 'dailyNetChangeToday')}</p>
                <p className="mt-1">
                  <span>{signed(growth.projectedDailyDelta)}</span>
                  <span className="mx-2 text-white/30">→</span>
                  <strong className="text-neon-cyan">
                    {signed(preview.projectedDailyDelta)} {tr ? 'müşteri' : 'customers'}
                  </strong>
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              {tr
                ? 'Bu bir model tahminidir, garantili büyüme değildir. Fiyatlar, rakip hamleleri, hizmet ve kapasite değişmeye devam eder.'
                : 'A model estimate, not guaranteed growth. Prices, rival moves, service and capacity keep changing.'}
            </p>
            {issue && (
              <p role="alert" className="mt-3 text-xs text-neon-amber">
                {issue}
              </p>
            )}
            <button
              className="btn-primary mt-4 w-full sm:w-auto"
              disabled={!!issue}
              onClick={() =>
                setMessage(
                  launch(id, kind)
                    ? tr
                      ? 'Program başladı. Etkisini görmek için saati ilerlet.'
                      : 'Programme launched. Advance the clock to see its effect.'
                    : tr
                      ? 'Başlatılamadı. Nakdini ve ilçenin uygunluğunu kontrol et.'
                      : 'Unable to launch. Review cash and district availability.',
                )
              }
            >
              {tr ? `${MARKET_TACTICS[kind].titleTr} başlat` : `Launch ${MARKET_TACTICS[kind].title}`}
            </button>
          </>
        )}
        <p role="status" className="mt-2 text-xs text-neon-cyan">
          {message}
        </p>
      </section>
    </section>
  );
}

export default function MarketScreen() {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const setScreen = useGame((s) => s.setScreen);
  const selected = useGame((s) => s.selection);
  const [id, setId] = useState(
    selected?.type === 'district' ? selected.id : game.districts.find((d) => d.unlocked)!.id,
  );
  const tr = locale === 'tr';
  const liveMoves = game.competition.moves.filter(
    (m) => m.endsAt > game.minutes && game.competitors.some((c) => c.id === m.rivalId),
  );
  return (
    <div className="screen-shell">
      <div className="mx-auto max-w-[1360px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{t(locale, 'cityIsContested')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">{t(locale, 'cityContestedBlurb')}</p>
          </div>
          <button className="btn text-xs" onClick={() => setScreen('company')}>
            {t(locale, 'companyFinances')}
          </button>
        </header>
        <div className="market-command-grid grid items-start gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside
            className="min-w-0 rounded-lg bg-[#132832] p-4"
            aria-label={tr ? 'Şehir pazar panosu' : 'City market board'}
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <h2 className="font-semibold">{t(locale, 'districtPressure')}</h2>
              <span className={liveMoves.length ? 'text-[#ed9e77]' : 'text-white/40'}>
                {liveMoves.length} {tr ? 'rakip hamlesi' : 'rival moves'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[180px_minmax(0,1fr)] xl:block">
              <MarketMap game={game} selected={id} onSelect={setId} tr={tr} />
              <div className="space-y-1" role="group" aria-label={tr ? 'İlçe seçici' : 'District selector'}>
                {game.districts.map((d) => (
                  <button
                    key={d.id}
                    aria-pressed={id === d.id}
                    onClick={() => setId(d.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-xs ${id === d.id ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5'}`}
                  >
                    <span>{d.name}</span>
                    <span className={liveMoves.some((m) => m.districtId === d.id) ? 'text-[#ed9e77]' : 'text-white/40'}>
                      {!d.unlocked
                        ? tr
                          ? 'Lisans gerekli'
                          : 'Licence needed'
                        : liveMoves.some((m) => m.districtId === d.id)
                          ? tr
                            ? 'Baskı altında'
                            : 'Under pressure'
                          : customerLabel(districtFixedCustomers(game, d.id), tr)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-white/45">{t(locale, 'districtPressureBlurb')}</p>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs text-white/45">
              {tr
                ? `Ticari kapasite: ${game.competition.operations.length} / 3 operasyon`
                : `Commercial capacity: ${game.competition.operations.length} / 3 operations`}
            </p>
          </aside>
          <div className="min-w-0 rounded-lg border border-white/10 bg-[#142b36] p-4 sm:p-6">
            <DistrictDesk key={id} id={id} />
          </div>
        </div>
        <section
          aria-label={t(locale, 'rivalIntelligence')}
          className="rounded-lg border border-white/10 bg-[#142b36] p-4 sm:p-5"
        >
          <h2 className="market-heading">{t(locale, 'rivalIntelligence')}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {game.competitors.map((c) => {
              const move = liveMoves.find((m) => m.rivalId === c.id);
              const posture = rivalPosture(game, c);
              return (
                <article key={c.id} className="border-t-2 pt-3" style={{ borderColor: c.color }}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="font-semibold" style={{ color: c.color }}>
                      {c.name}
                    </h3>
                    <span className="text-xs text-white/45">{tr ? posture.labelTr : posture.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/55">{tr ? posture.detailTr : posture.detail}</p>
                  <dl className="mt-3 flex flex-wrap gap-5 text-xs">
                    <div>
                      <dt className="text-white/40">{t(locale, 'cashReserves')}</dt>
                      <dd>{fmtMoneyExact(c.cash)}</dd>
                    </div>
                    <div>
                      <dt className="text-white/40">{t(locale, 'baseMonthlyArpu')}</dt>
                      <dd>{fmtMoneyExact(rivalArpu(c))}</dd>
                    </div>
                  </dl>
                  {move ? (
                    <button
                      className="mt-3 text-left text-xs text-[#ed9e77] underline underline-offset-4"
                      onClick={() => {
                        setId(move.districtId);
                        document.querySelector('.market-command-grid')?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      {tr ? RIVAL_MOVES[move.kind].titleTr : RIVAL_MOVES[move.kind].title} ·{' '}
                      {daysLeft(move.endsAt, game.minutes)}
                      {tr ? ' gün' : 'd'}
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-white/35">{t(locale, 'noActiveOffensive')}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <section
          className="rounded-lg border border-white/10 p-4 sm:p-5"
          aria-label={tr ? 'Operasyon sonuçları' : 'Operation results'}
        >
          <h2 className="market-heading">{t(locale, 'afterTheCampaign')}</h2>
          <p className="mt-1 text-xs text-white/50">
            {tr
              ? 'Gözlenen ilçe sonuçları pazardaki ve şebekedeki genel değişimleri de içerir; her aboneliğin programdan geldiği anlamına gelmez.'
              : 'Observed district results include the wider market and network changes; they are not a claim that the programme caused every sign-up.'}
          </p>
          {game.competition.history.length ? (
            <div className="mt-4 space-y-3">
              {game.competition.history.map((o) => (
                <article
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs"
                >
                  <div>
                    <strong className="text-sm">
                      {tr ? MARKET_TACTICS[o.kind].titleTr : MARKET_TACTICS[o.kind].title}
                    </strong>
                    <p className="mt-1 text-white/50">
                      {game.districts.find((d) => d.id === o.districtId)?.name} ·{' '}
                      {tr
                        ? `${o.cancelled ? 'Erken bitti' : 'Tamamlandı'} · ${Math.floor(o.finishedAt / MINUTES_PER_DAY) + 1}. gün`
                        : `${o.cancelled ? 'Ended early' : 'Completed'} · Day ${Math.floor(o.finishedAt / MINUTES_PER_DAY) + 1}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <span>
                      {fmtMoneyExact(o.cost)} {tr ? 'harcandı' : 'spent'}
                    </span>
                    <span className={o.customerDelta >= 0 ? 'text-neon-cyan' : 'text-neon-red'}>
                      {signed(o.customerDelta)} {tr ? 'sabit müşteri' : 'fixed customers'}
                    </span>
                    {o.reputationDelta !== 0 && (
                      <span className={o.reputationDelta > 0 ? 'text-neon-cyan' : 'text-neon-red'}>
                        {signed(o.reputationDelta)} {tr ? 'itibar' : 'reputation'}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-white/40">{t(locale, 'completeOperationBlurb')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
