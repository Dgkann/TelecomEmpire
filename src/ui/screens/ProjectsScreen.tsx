import { useMemo, useState } from 'react';
import {
  ACCEPTANCE_MINUTES,
  TENDER_PROGRAMMES,
  bidBond,
  bidScore,
  tenderBidIssue,
  tenderProgress,
} from '../../game/procurement';
import { MINUTES_PER_DAY } from '../../game/constants';
import { fmtMoneyExact } from '../../game/economy';
import type { CityTender, GameState } from '../../game/types';
import { useGame } from '../../store/gameStore';
import { t } from '../i18n';
import { SignalTrainingCard } from '../SignalTraining';

const timeLeft = (until: number, now: number) => {
  const hours = Math.max(0, Math.ceil((until - now) / 60));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
};

function DistrictDiagram({ game, tender }: { game: GameState; tender: CityTender }) {
  const scale = 8;
  return (
    <svg
      viewBox={`0 0 ${game.gridSize * scale + 8} ${game.gridSize * scale + 8}`}
      role="img"
      aria-label="Project district footprint"
      className="h-20 w-20 shrink-0 rounded bg-[#10232e] p-1 sm:h-40 sm:w-40 sm:p-2"
    >
      {game.districts.flatMap((d) =>
        d.cells.map((c) => (
          <rect
            key={`${d.id}-${c.gx}-${c.gy}`}
            x={c.gx * scale + 4}
            y={c.gy * scale + 4}
            width={7}
            height={7}
            rx={1}
            fill={d.id === tender.districtId ? '#d2a657' : '#3b535e'}
            opacity={d.id === tender.districtId ? 0.9 : 0.35}
          />
        )),
      )}
      {game.nodes.map((n) => (
        <circle
          key={n.id}
          cx={n.gx * scale + 7.5}
          cy={n.gy * scale + 7.5}
          r={2.5}
          fill={n.down ? '#d36e76' : '#80e0d0'}
        />
      ))}
    </svg>
  );
}

function TenderDetail({ tender }: { tender: CityTender }) {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const bid = useGame((s) => s.bidOnTender);
  const withdraw = useGame((s) => s.withdrawTender);
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const beginPlan = useGame((s) => s.beginBlueprint);
  const [price, setPrice] = useState(tender.playerBid?.price ?? Math.round((tender.budget * 0.8) / 50) * 50);
  const [message, setMessage] = useState('');
  const spec = TENDER_PROGRAMMES[tender.kind];
  const district = game.districts.find((d) => d.id === tender.districtId)!;
  const progress = useMemo(() => tenderProgress(game, tender), [game, tender]);
  const issue = tenderBidIssue(game, tender, price, locale);
  const phase = tender.status === 'open' ? 0 : tender.status === 'delivery' ? 1 : 2;
  const inspect = () => {
    focus(district.center.gx, district.center.gy);
    select({ type: 'district', id: district.id });
  };
  const results = [
    ...tender.rivals,
    ...(tender.playerBid ? [{ id: 'player', name: game.companyName, ...tender.playerBid }] : []),
  ]
    .map((b) => ({ ...b, score: bidScore(tender.budget, b.price, b.quality) }))
    .sort((a, b) => b.score - a.score || a.price - b.price || a.id.localeCompare(b.id));
  return (
    <article
      className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#142b36]"
      aria-label="Infrastructure tender"
    >
      <div className="border-b border-white/10 bg-[#1b3440] p-5 sm:p-6">
        <div className="mb-4 flex gap-1" aria-label="Project stages">
          {['Sealed bidding', 'Build & prove', 'Settlement'].map((label, i) => (
            <div
              key={label}
              className={`flex-1 border-t-2 pt-2 text-[11px] ${phase === i ? 'border-neon-amber text-neon-amber' : phase > i ? 'border-neon-cyan text-neon-cyan' : 'border-white/15 text-white/35'}`}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-neon-amber">City authority · {district.name}</p>
            <h2 className="project-title mt-2 font-semibold">{spec.title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{spec.brief}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <span>
                {t(locale, 'budget')}{' '}
                <strong className="block text-lg text-white">{fmtMoneyExact(tender.budget)}</strong>
              </span>
              <span>
                {tender.status === 'open'
                  ? 'Bidding closes in'
                  : tender.status === 'delivery'
                    ? 'Delivery deadline in'
                    : 'Outcome'}
                <strong className="block text-lg capitalize text-neon-amber">
                  {tender.status === 'open'
                    ? timeLeft(tender.closesAt, game.minutes)
                    : tender.status === 'delivery'
                      ? timeLeft(tender.dueAt!, game.minutes)
                      : tender.status}
                </strong>
              </span>
            </div>
          </div>
          <DistrictDiagram game={game} tender={tender} />
        </div>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <section>
          <h3 className="font-semibold">{t(locale, 'deliverySpecification')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-white/50">
            Build within {spec.days} days of award. Hold every condition for six consecutive game hours. Losing a
            condition restarts the acceptance test.
          </p>
          <ul className="mt-3 divide-y divide-white/10">
            {progress.requirements
              .filter((r) => r.target > 0)
              .map((r) => {
                const ready = r.current + 1e-9 >= r.target;
                const format = (n: number) =>
                  r.id === 'reach' ? Math.round(n * 100) + '%' : r.id === 'health' ? Math.round(n) + '%' : String(n);
                return (
                  <li className="py-2.5" key={r.id}>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="text-white/70">{r.label}</span>
                      <strong className={ready ? 'text-neon-cyan' : 'text-neon-amber'}>
                        {r.id === 'licence'
                          ? ready
                            ? 'Licensed'
                            : 'Licence needed'
                          : `${format(r.current)} / ${format(r.target)}`}
                      </strong>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded bg-white/10">
                      <div
                        className={ready ? 'h-full bg-neon-cyan' : 'h-full bg-neon-amber/70'}
                        style={{ width: Math.min(100, (r.current / r.target) * 100) + '%' }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn text-xs" onClick={inspect}>
              {t(locale, 'inspectProjectDistrict')}
            </button>
            {tender.status === 'delivery' && (
              <button
                className="btn-primary text-xs"
                disabled={!district.unlocked}
                onClick={() => {
                  focus(district.center.gx, district.center.gy);
                  beginPlan();
                }}
              >
                {t(locale, 'planDeliveryNetwork')}
              </button>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            The programme pays for commissioned infrastructure. It does not grant subscribers. Existing sites may
            qualify; only sites routed to a live core count.
          </p>
        </section>
        <section className="min-w-0 rounded border border-white/10 bg-black/15 p-4">
          {tender.status === 'open' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMessage(
                  bid(tender.id, price)
                    ? 'Sealed bid submitted. Your performance bond is held until settlement.'
                    : 'Bid unavailable. Review the deadline and available cash.',
                );
              }}
            >
              <h3 className="font-semibold">{t(locale, 'yourSealedBid')}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                Offer the payment you require for the complete job. Lowest cost contributes 70 points; reputation
                contributes 30.
              </p>
              <label className="mt-4 block text-xs text-white/60">
                {t(locale, 'requestedPayment')}
                <input
                  type="number"
                  min={Math.ceil(tender.budget * 0.65)}
                  max={tender.budget}
                  step={50}
                  value={Number.isNaN(price) ? '' : price}
                  onChange={(e) => {
                    setPrice(e.target.valueAsNumber);
                    setMessage('');
                  }}
                  className="mt-1 w-full rounded border border-white/20 bg-[#102633] px-3 py-2 text-lg font-semibold text-white"
                />
              </label>
              <input
                aria-label="Requested payment slider"
                type="range"
                min={Math.ceil(tender.budget * 0.65)}
                max={tender.budget}
                step={50}
                value={Number.isFinite(price) ? price : tender.budget}
                onChange={(e) => {
                  setPrice(Number(e.target.value));
                  setMessage('');
                }}
                className="mt-3 w-full accent-[#d2a657]"
              />
              <div className="flex justify-between text-[10px] text-white/45">
                <span>{fmtMoneyExact(Math.ceil(tender.budget * 0.65))} · aggressive</span>
                <span>{fmtMoneyExact(tender.budget)} · full budget</span>
              </div>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt>{t(locale, 'yourScoreAtReputation')}</dt>
                  <dd className="text-neon-amber">
                    {Number.isFinite(price) ? bidScore(tender.budget, price, game.reputation).toFixed(1) : '—'} / 100
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>10% performance bond</dt>
                  <dd>{Number.isFinite(price) ? fmtMoneyExact(bidBond(price)) : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t(locale, 'bondAlreadyHeld')}</dt>
                  <dd>{fmtMoneyExact(tender.bond)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t(locale, 'sealedRivalBids')}</dt>
                  <dd>{tender.rivals.length}</dd>
                </div>
              </dl>
              {tender.playerBid && (
                <p className="mt-3 rounded border border-neon-cyan/20 p-2 text-xs text-neon-cyan">
                  Submitted: {fmtMoneyExact(tender.playerBid.price)} · score{' '}
                  {bidScore(tender.budget, tender.playerBid.price, tender.playerBid.quality).toFixed(1)}. Reputation is
                  captured when you submit.
                </p>
              )}
              {issue && (
                <p role="alert" className="mt-3 text-xs text-neon-amber">
                  {issue}
                </p>
              )}
              <button className="btn-primary mt-4 w-full" disabled={!!issue}>
                {tender.playerBid ? 'Update sealed bid' : 'Submit sealed bid'}
              </button>
              {tender.playerBid && (
                <button
                  type="button"
                  className="btn mt-2 w-full text-xs"
                  onClick={() =>
                    setMessage(
                      withdraw(tender.id)
                        ? 'Bid withdrawn. Your full bond was returned.'
                        : 'Bidding has already closed.',
                    )
                  }
                >
                  {t(locale, 'withdrawBidRecoverBond')}
                </button>
              )}
              <p role="status" className="mt-2 text-xs text-neon-cyan">
                {message}
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-white/45">
                Losing bids recover their bond. Winners must finance construction; payment arrives after acceptance.
                Missing the deadline forfeits the bond and costs 5 reputation.
              </p>
            </form>
          ) : tender.status === 'delivery' ? (
            <>
              <p className="text-xs text-neon-cyan">Awarded to {game.companyName}</p>
              <h3 className="mt-2 text-xl font-semibold">{t(locale, 'proveTheNetwork')}</h3>
              <p className="mt-2 text-sm text-white/60">
                {progress.ready
                  ? 'All conditions met. Keep service healthy while the clock runs.'
                  : 'Complete the missing conditions to start the six-hour acceptance test.'}
              </p>
              <div className="mt-5 text-4xl font-semibold text-neon-amber">
                {(tender.qualifyingMinutes / 60).toFixed(1)}
                <span className="text-base text-white/40"> / 6h</span>
              </div>
              <div
                role="progressbar"
                aria-label="Continuous service acceptance"
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={tender.qualifyingMinutes}
                className="mt-3 h-2 overflow-hidden rounded bg-white/10"
              >
                <div
                  className="h-full bg-neon-amber"
                  style={{ width: (tender.qualifyingMinutes / ACCEPTANCE_MINUTES) * 100 + '%' }}
                />
              </div>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt>{t(locale, 'paymentOnAcceptance')}</dt>
                  <dd>{fmtMoneyExact(tender.playerBid!.price)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t(locale, 'bondReturnedOnSuccess')}</dt>
                  <dd>{fmtMoneyExact(tender.bond)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t(locale, 'completionReward')}</dt>
                  <dd>+5 reputation · {spec.reward} RP</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-white/50">
                Resume the simulation to run the acceptance test. Repairs, maintenance and independent paths help you
                keep the network operational.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-semibold">
                {tender.status === 'completed'
                  ? 'Infrastructure accepted'
                  : tender.status === 'failed'
                    ? 'Deadline missed'
                    : 'Tender awarded'}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {tender.status === 'completed'
                  ? `${fmtMoneyExact(tender.playerBid!.price)} paid, bond returned, +5 reputation and ${spec.reward} research points earned.`
                  : tender.status === 'failed'
                    ? 'Your performance bond was forfeited and reputation fell by 5. The built network remains yours.'
                    : tender.winnerId
                      ? `${tender.rivals.find((r) => r.id === tender.winnerId)?.name ?? 'Another operator'} won. Any player bond was returned in full.`
                      : 'No eligible bids were received.'}
              </p>
            </>
          )}
        </section>
        {tender.status !== 'open' && (
          <section className="min-w-0 lg:col-span-2">
            <h3 className="font-semibold">{t(locale, 'revealedBids')}</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-white/45">
                  <tr>
                    <th className="pb-2">{t(locale, 'operator')}</th>
                    <th className="pb-2 text-right">{t(locale, 'payment')}</th>
                    <th className="pb-2 text-right">{t(locale, 'reputation')}</th>
                    <th className="pb-2 text-right">{t(locale, 'score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-t border-white/10 ${r.id === tender.winnerId ? 'text-neon-cyan' : 'text-white/65'}`}
                    >
                      <td className="py-3 pr-3">
                        {r.name}
                        {r.id === tender.winnerId ? ' · Winner' : ''}
                      </td>
                      <td className="text-right">{fmtMoneyExact(r.price)}</td>
                      <td className="text-right">{r.quality.toFixed(0)}</td>
                      <td className="text-right">{r.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

export default function ProjectsScreen() {
  const game = useGame((s) => s.game)!;
  const locale = useGame((s) => s.locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tender =
    game.procurement.tenders.find((t) => t.id === selectedId) ??
    game.procurement.tenders.find((t) => t.status === 'open' || t.status === 'delivery') ??
    game.procurement.tenders[0];
  const completed = game.procurement.tenders.filter((t) => t.status === 'completed').length;
  return (
    <div className="screen-shell">
      <div className="mx-auto max-w-[1280px] space-y-5">
        <SignalTrainingCard />
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-neon-amber">{t(locale, 'municipalProcurementOffice')}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t(locale, 'cityInfrastructure')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              Compete for funded network projects. Price the job, secure the award, then deliver a network the city can
              trust.
            </p>
          </div>
          <div className="text-right text-xs text-white/50">
            <strong className="block text-2xl text-neon-cyan">{completed}</strong>accepted projects in recent history
          </div>
        </header>
        <div className="grid items-start gap-4 xl:grid-cols-[240px_1fr]">
          <aside className="space-y-3">
            <h2 className="text-sm font-semibold">{t(locale, 'projectRegister')}</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {game.procurement.tenders.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={tender?.id === t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`rounded border p-3 text-left ${tender?.id === t.id ? 'border-neon-amber/50 bg-neon-amber/10' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  <span className="text-[10px] capitalize text-neon-amber">
                    {t.status === 'open'
                      ? 'Bidding open'
                      : t.status === 'delivery'
                        ? 'Your delivery project'
                        : t.status}
                  </span>
                  <strong className="mt-1 block text-sm">{TENDER_PROGRAMMES[t.kind].title}</strong>
                  <span className="mt-1 block text-xs text-white/50">
                    {game.districts.find((d) => d.id === t.districtId)?.name}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-white/45">
              One live procurement at a time. A new call opens five days after settlement. The register keeps the last
              12 projects.
            </p>
          </aside>
          {tender ? (
            <TenderDetail key={tender.id} tender={tender} />
          ) : (
            <div className="panel p-8">
              <h2 className="text-xl font-semibold">{t(locale, 'nextCityCallPreparing')}</h2>
              <p className="mt-2 text-sm text-white/60">
                {game.procurement.nextTenderAt <= game.minutes
                  ? 'Resume the city clock to publish the first tender.'
                  : `Next opportunity in ${Math.ceil((game.procurement.nextTenderAt - game.minutes) / MINUTES_PER_DAY)} days.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
