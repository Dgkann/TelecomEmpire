import { useMemo, useState } from 'react';
import { expansionProgress, expansionQuote, type ExpansionKind } from '../game/expansion';
import { computeRoutes } from '../game/network';
import { strongestRival } from '../game/competitors';
import { fmtMoneyExact, fmtNum } from '../game/economy';
import { useGame } from '../store/gameStore';

export function DistrictLaunchProgress({ districtId }: { districtId: string }) {
  const game = useGame((s) => s.game)!;
  const progress = useMemo(() => expansionProgress(game, districtId), [game, districtId]);
  if (!progress.sites.length) return null;
  return (
    <section className="rounded border border-white/10 bg-black/10 p-3" aria-label="District launch checklist">
      <h3 className="text-sm font-semibold">Establish your district</h3>
      <ul className="mt-2 space-y-2 text-xs">
        {[
          { done: progress.connected, text: 'Connect a fixed access site' },
          {
            done: progress.customers >= 100,
            text: 'Win 100 fixed customers',
            detail: `${Math.min(100, progress.customers)} / 100`,
          },
          { done: progress.protected, text: 'Protect a site with independent fibre paths' },
        ].map((item) => (
          <li key={item.text} className="flex items-start gap-2">
            <span
              className={item.done ? 'text-neon-cyan' : 'text-white/40'}
              aria-label={item.done ? 'Complete' : 'Pending'}
            >
              {item.done ? '✓' : '○'}
            </span>
            <span className="flex-1 text-white/70">{item.text}</span>
            {item.detail && <span className="text-neon-cyan">{item.detail}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-white/45">
        Grow coverage and offer competitive packages to attract subscribers. Select a site on the map to add backup
        fibre.
      </p>
    </section>
  );
}

export default function ExpansionPlanner() {
  const game = useGame((s) => s.game)!;
  const launch = useGame((s) => s.launchDistrict);
  const setScreen = useGame((s) => s.setScreen);
  const select = useGame((s) => s.select);
  const focus = useGame((s) => s.focus);
  const setTool = useGame((s) => s.setTool);
  const [kind, setKind] = useState<ExpansionKind>('access');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(() => {
    const routes = computeRoutes(game);
    return game.districts.map((d) => {
      const established = game.nodes.some((n) => n.districtId === d.id && (n.kind === 'pop' || n.kind === 'access'));
      return {
        district: d,
        established,
        quote: established ? null : expansionQuote(game, d.id, kind, routes),
        homes: game.buildings
          .filter((b) => b.districtId === d.id && b.segment === 'residential')
          .reduce((sum, b) => sum + b.households, 0),
        rival: strongestRival(game, d.id),
      };
    });
  }, [game, kind]);
  const selected = rows.find((r) => r.district.id === selectedId) ?? rows.find((r) => !r.established) ?? rows[0];
  if (!selected) return null;
  const { district, quote } = selected;
  const inspect = () => {
    setScreen('map');
    setTool(null);
    select({ type: 'district', id: district.id });
    focus(district.center.gx, district.center.gy);
  };
  return (
    <section className="mt-4" aria-label="Expansion planner">
      <h3 className="text-lg font-semibold">Where will you build next?</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/60">
        Compare local markets, choose your first site, and commission a connected network. A smaller launch preserves
        cash; a POP reaches more homes.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">Choose a district</legend>
          <div className="divide-y divide-white/10 rounded border border-white/10">
            {rows.map((row) => (
              <label
                key={row.district.id}
                className={`flex cursor-pointer items-start gap-3 px-3 py-3 ${district.id === row.district.id ? 'bg-neon-cyan/10' : 'hover:bg-white/[0.03]'}`}
              >
                <input
                  type="radio"
                  name="launch-district"
                  aria-label={row.district.name}
                  checked={district.id === row.district.id}
                  onChange={() => setSelectedId(row.district.id)}
                  className="mt-1 accent-[#62c7bd]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <strong>{row.district.name}</strong>
                    <span className={row.established ? 'text-white/50' : 'text-neon-amber'}>
                      {row.established
                        ? 'Network established'
                        : row.quote?.steps.length
                          ? fmtMoneyExact(row.quote.total)
                          : 'Launch unavailable'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {fmtNum(row.homes)} homes · {row.district.incomeLevel} income ·{' '}
                    {Math.round(row.district.demandFactor * 100)}% bandwidth appetite
                  </div>
                  <div className="mt-1 text-[11px] text-white/45">
                    {row.rival
                      ? `${row.rival.name} holds ${Math.round((row.rival.share[row.district.id] ?? 0) * 100)}% market share`
                      : 'No established rival'}
                    {!row.established && row.quote?.steps.length
                      ? ` · +${fmtNum(row.quote.homes)} reachable homes`
                      : ''}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/45">
            Launch totals include any required licence, one site and its shortest available fibre connection.
          </p>
        </fieldset>
        <div className="min-w-0 space-y-3 rounded border border-white/10 bg-black/10 p-4" aria-label="Launch quote">
          <h4 className="font-semibold">{district.name}</h4>
          {selected.established ? (
            <DistrictLaunchProgress districtId={district.id} />
          ) : (
            <>
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-semibold">Choose a starter network</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['access', 'pop'] as const).map((option) => (
                    <label
                      key={option}
                      className={`cursor-pointer rounded border p-3 ${kind === option ? 'border-neon-cyan/50 bg-neon-cyan/10' : 'border-white/10'}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="launch-kind"
                          aria-label={option === 'access' ? 'Access node' : 'POP'}
                          checked={kind === option}
                          onChange={() => setKind(option)}
                          className="accent-[#62c7bd]"
                        />
                        {option === 'access' ? 'Access node' : 'POP'}
                      </div>
                      <p className="mt-2 text-[11px] text-white/60">
                        {option === 'access' ? 'Lower cost, smaller reach' : 'Higher cost, wider reach'}
                      </p>
                    </label>
                  ))}
                </div>
              </fieldset>
              {quote && quote.steps.length > 0 && (
                <>
                  <dl className="space-y-2 text-xs">
                    {[
                      [
                        'District licence',
                        quote.licenceCost === 0 ? 'Already licensed' : fmtMoneyExact(quote.licenceCost),
                      ],
                      ['Starter site', fmtMoneyExact(quote.siteCost)],
                      ['Fibre connection', fmtMoneyExact(quote.fibreCost)],
                      ['Additional monthly upkeep', fmtMoneyExact(quote.monthlyCost)],
                    ].map(([label, value]) => (
                      <div className="flex justify-between gap-2" key={label}>
                        <dt className="text-white/55">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-semibold">
                      <dt>Total launch cost</dt>
                      <dd>{fmtMoneyExact(quote.total)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/55">Cash after launch</dt>
                      <dd className={game.money < quote.total ? 'text-neon-amber' : 'text-white/80'}>
                        {fmtMoneyExact(game.money - quote.total)}
                      </dd>
                    </div>
                  </dl>
                  <div className="border-l-2 border-neon-cyan pl-3">
                    <strong className="text-neon-cyan">+{fmtNum(quote.homes)} reachable homes</strong>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">
                      {quote.breakEvenCustomers !== null
                        ? `About ${quote.breakEvenCustomers} subscribers at your current package mix cover this network's added upkeep.`
                        : 'Activate a residential package to earn subscription revenue.'}{' '}
                      Customer sign-ups take time; reach is not a sales forecast. This excludes the initial investment
                      and any future transit upgrades.
                    </p>
                  </div>
                  <p className="text-[11px] text-white/50">
                    Fibre joins {game.nodes.find((n) => n.id === quote.placement?.peerId)?.name}. The launch uses one
                    path; add backup fibre after commissioning.
                  </p>
                </>
              )}
              {quote?.issue && (
                <p className="text-xs text-neon-amber">
                  {quote.issue}
                  {quote.fundingGap > 0 && quote.steps.length > 0
                    ? ` Need ${fmtMoneyExact(quote.fundingGap)} more.`
                    : ''}
                </p>
              )}
              <button
                className="btn-primary w-full"
                disabled={!quote || !!quote.issue}
                onClick={() => launch(district.id, kind)}
              >
                Commission starter network{quote?.steps.length ? ` · ${fmtMoneyExact(quote.total)}` : ''}
              </button>
            </>
          )}
          <button className="btn w-full text-xs" onClick={inspect}>
            Inspect district on map
          </button>
        </div>
      </div>
    </section>
  );
}
