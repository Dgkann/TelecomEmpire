# Telecom Empire

A browser tycoon game about running an ISP. You start with one core router, one
POP and 200 customers in a single district, and grow from there by laying fibre,
placing sites and keeping the whole thing standing up under load.

Play it in the browser at https://dgkann.github.io/TelecomEmpire/. Every push
to `main` that passes CI is published there. To run it locally instead:

```bash
npm ci
npm run dev
```

Use Node.js 20.19+, 22.13+, or 24+ and npm, matching the lint tooling's supported
Node releases. Open http://localhost:5173.
The current release is 1.1.0 (see [CHANGELOG.md](CHANGELOG.md)); the save schema is 26.

The game runs entirely in the browser. Save slots and preferences use this
browser's local storage; use the save manager's export/import controls to move
a game between browsers or devices. English and Turkish are available from the
main menu. Money is displayed in Turkish lira in both languages.

## Playing it

Build a POP in a district, run fibre back to a core, and customers start
signing up. Revenue pays for capacity, capacity carries more customers, then you
do it again in the next district.

Things worth knowing:

- **Network → Network Lab** pauses play to capture a planning snapshot. Rehearse
  1–4× offered demand or one fibre cut, compare each district's delivery before
  and after upgrades, then commission up to 32 site, fibre and transit changes
  in one order. Capital spend and extra monthly costs are shown separately.
  Refresh to use newer network conditions; stale or unaffordable orders cannot
  partially spend your cash. This is a capacity test, not a subscriber forecast.
- The map's **FX** menu offers Auto, Full detail and Performance. Auto reduces
  ambient effects in large networks or after sustained slow frames. Alerts and
  interactive network controls remain available in every mode.
- Fibre colour is utilisation. Green under 50%, yellow to 75%, orange to 90%,
  red above that. The dashes crawl faster on busy spans.
- Demand peaks around 19:00–20:00 at about 1.5× the midday load, so a span that
  looks fine at midday can be red by eight in the evening.
- A site with one fibre path goes dark the moment that span is cut. The context
  panel tells you which sites are single-path.
- Emergency repairs are fast and expensive. Scheduled repairs are cheap and
  leave customers offline for hours.
- Contract offers can be signed as quoted, softened to a more forgiving SLA
  for less revenue, or countered at a premium with a chance the client walks.
- Site servicing is now planned work: urgent windows cost more, overnight
  windows wait for 02:00, and both consume a real field crew while the site is down.
- The Network screen controls QoS priorities, IXP/CDN interconnection and data
  centre workloads; every option trades capacity or resilience against cost.
- District campaigns target acquisition, retention, business leads or mobile
  adoption, while wholesale and MVNO access sell spare reach at the price of load.
- Once you research 4G you need spectrum. Low bands reach further, high bands
  carry more, and rivals bid against you at every auction.

Drag to pan, scroll to zoom, click things to inspect them. Space pauses,
1/2/3 set speed, Esc cancels a build.

### Building a stronger operator

The live operations panel includes thirteen development goals, shown one at a
time in the order players usually reach them. The first six cover the opening:
connect two POPs, reach 400 fixed subscribers, protect a serving site with an
independent path, operate in two districts, sign a contract and finish two
research projects. Five more carry the middle of the game: 2,000 fixed
subscribers, three districts, four research projects, three contracts at once
and four protected sites. The last two are 100 mobile subscribers and a first
data centre. Each goal has a one-time cash and research grant; claim it in the
panel when its conditions are met. On phones, open Actions to see the goals.
Grants are recorded separately from operating income, survive saving/loading,
and reset when a campaign moves to a new city.

Research needs both cash and research points. Points beyond a project's
requirement take 1,200 ₺ each off its bill, up to 40% of the price, and are
spent with it. Network engineers produce most points: a new hire costs 120,000 ₺
plus 64,000 ₺ a month, and while research runs, an engineer of average skill
earns about that much back in credit. The Staff panel works this out for the
company's current research and says when banked points already cover the next
project's full credit.

Upstream transit is shared by every district. When the last step's peak traffic
fills it, a red banner under the top bar shows traffic against capacity and
offers the next transit tier at its monthly price; a full upstream lowers
satisfaction in every district, and new sites do not help. At the top tier the
banner links to the interconnect options instead.

Selecting a construction tool shows extra monthly power/maintenance expense,
cash remaining and an approximate runway at current revenue, including loan
payments. POP and access previews also show how many subscribers would cover
the additional upkeep alone. These are planning estimates: future growth,
faults and new fibre expenses can change the result. Node upgrade panels show
the same expense estimate next to the capacity comparison.

While placing a site, the dashed amber line suggests the nearest live network
connection and quotes its separate fibre cost. Building the site does not
automatically purchase that connection. Use Fibre to complete the route.

The city uses distinct residential, commercial and public buildings, parks,
seeded rooftops (parapets, water tanks, antennas with aviation lights, shop
awnings), warm night windows, street lamps that come on at dusk, a night sky
and street traffic. Traffic animation pauses with the game,
and reduced-motion preferences are respected: interface animations skip their
movement and new connections are not ringed on the map. The camera refits after a screen
resize; zoom controls remain available on touch devices. Construction can be
cancelled with the close button or Escape, including when a tool has focus.

Save schema 18 migrates older networks with an empty development-grant history.

## Layout

Game logic is plain TypeScript with no React imports. The UI reads state and
calls actions, nothing more.

```
src/
  game/            simulation, no React anywhere
    types.ts       domain model
    constants.ts   balance dials
    cityGen.ts     districts and buildings from a seed
    network.ts     routing, capacity loading, redundancy checks
    simulation.ts  the tick
    economy.ts     revenue, costs, package appeal
    incidents.ts   fault templates and repair options
    spectrum.ts    sealed-bid auctions
    research.ts    tech tree
    names.ts       generated people, firms and social posts
    lang.ts        language for generated log, feed and ledger lines
    save.ts        schema migrations and save validation
    saveStorage.ts localStorage slots and import/export
  store/
    gameStore.ts   zustand: game state, UI state, player actions
  ui/
    MapView.tsx    isometric SVG city and network
    iso.ts         projection helpers
    ...            top bar, build bar, panels, screens
tools/
  balance.ts       plays a year headless and prints the economy
  mobile-check.ts  forces a game to 4G and checks spectrum actually does something
```

### The tick

One step is five game minutes:

1. Work out per-district demand from subscribers, package speeds, the
   time-of-day curve and any city event running.
2. Dijkstra out from every live core so each site knows its route home.
3. Push demand along those routes. Every node and span picks up load, and the
   worst-loaded thing on the path is what customers actually feel.
4. Turn that pressure into packet loss and latency, then into satisfaction,
   churn, growth, reputation and the odd angry post.
5. Move money, run incidents and maintenance, drive technicians, tick research
   and auctions.

Two constants matter more than the rest: `OVERSUBSCRIPTION` (how much of a
subscriber's headline speed is really on the wire at peak) and
`CONTRACT_CONTENTION` (the same thing for business circuits). Both are in
`src/game/constants.ts`.

### Checks

```bash
npm run check
```

Runs the invariant suite in `tools/checks.ts` headless and exits non-zero on the
first failure. It plays a year and asserts nothing goes NaN or out of range,
round-trips a save, migrates a version 1 save, proves a dual-homed site survives
a cut while a single-homed one does not, and proves spectrum actually moves
tower reach, capacity and mobile revenue. Run it after touching any constant.

The suite also covers economic transactions, service allocation, campaigns,
energy, procurement, district competition, exercises and staged data centres.
For the complete release checks:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run audit
npx playwright install chromium webkit
npm run e2e
npm run check
```

On Linux, use `npx playwright install --with-deps chromium webkit` to install
the browser system dependencies too. E2E tests cover desktop Chromium, mobile
Chromium and mobile WebKit. They start their own production preview on port
4175, which must be free. `npm run performance` uses the same port, so run it
after E2E finishes. See [performance measurements](tests/performance/README.md)
for the rendering and network benchmarks. `npm run release:audit` runs a longer
diagnostic playthrough and writes a JSON report; it is not a pass/fail test.

```bash
npm run balance        # a year of play, printed month by month
npm run mobile-check   # forces a game to 4G and reports the mobile side
```

Those two print numbers for a human to read rather than asserting, which is
useful when tuning.

### Saves

`SAVE_VERSION` in `src/game/constants.ts` is the schema version. Adding a field
to `GameState` means adding an entry to `MIGRATIONS` in `src/game/save.ts`,
keyed by the version it upgrades from. Without one, existing saves load with
the field missing. `npm run check` covers the migration path.

Recent migration steps are:

| Schema | Change                                                                         |
| ------ | ------------------------------------------------------------------------------ |
| 22     | Rescale stored money by 20 to match the updated economy.                       |
| 23     | Add energy contracts, starting existing networks on the spot tariff.           |
| 24     | Add persistent signal exercise progress and reward cooldowns.                  |
| 25     | Allow small, tier-zero data centres; existing full centres retain their tiers. |
| 26     | Add restoration exercises while preserving existing boards and reward timers.  |

Imports validate both structure and entity references. Saves from a newer schema
are refused. The older schema numbers in the feature notes below describe when
those systems were introduced, rather than the current schema.

Note that JSON has no `Infinity`, so any field relying on it needs reviving on
load. `nextAuctionAt` is the current example.

### Commit hygiene

```bash
npm run verify-commits              # everything not on origin/main
npm run verify-commits main..HEAD   # an explicit range
```

Checks out every commit in the range into a throwaway worktree and builds it
there, so a branch never contains a commit that only compiles because of a
later one. CI runs the same script over the commits in a pull request.

## Scope

One active city with five districts at a time. Residential customers, business and enterprise
contracts with SLA penalties, planned maintenance and field crews, district
campaigns, QoS policy, peering/CDN agreements, wholesale/MVNO partnerships,
configurable data-centre workloads, research, AI competitors, city events,
city growth, and the mobile layer (towers, coverage, spectrum auctions, mobile
plans).

Campaign play now carries the operator through Marmara, Karadeniz and Ege. International expansion is not implemented.

## Energy, data centres and exercises

Network energy controls offer a variable spot tariff, a one-year fixed contract
and certified renewable electricity. Fixed contracts carry an early exit cost;
renewable power avoids the carbon levy. Research unlocks site solar installations
that reduce purchased power. The energy panel shows the financial tradeoffs.

Data centres start as a small 10 Gbps facility costing ₺1.2 million after 100G
backbone research. Edge-computing research unlocks the ₺3.2 million expansion to
a full facility. The first stage advances the campaign goal, but expansion is
required to complete it. Finance and workload controls expose the operating
costs and income of the selected stage.

The Projects screen includes signal routing and network restoration exercises.
Boards preserve progress through saves, support touch and keyboard interaction,
and pause simulation time while open. An eligible completion pays ₺30,000 and
3 research points and removes up to one day from active research. Rewards share
a seven-game-day cooldown; practice during the cooldown cannot earn them again.
The preview shows the actual available reward, and optional hints do not reduce it.

## Language behaviour

Management screens, alerts, contract offers, auctions, save messages and research
guidance have English and Turkish copy. New event-log lines, customer posts and
finance-ledger entries use the language selected when they are generated.
Existing saved text keeps its original language when the player switches languages.

## Network planning and strategy

Use **Plan network / Ağ planla** on the map to draft up to 30 sites and fibre spans. Time pauses and no money is spent until **Build all**. Every proposed site must route to a live core. Undo or discard before leaving the map. Drafts are temporary; saved games contain commissioned infrastructure only. The residential peak stress test uses existing customers and excludes caching, transit and non-residential services; it is not a forecast of total future traffic.

Open **Company → Strategy desk** (or the map's shortcut) for city proposals, competitors and operator charters. Proposals show costs and consequences before selection. Well-served districts (40% coverage, 65 satisfaction) grow over time; new homes do not automatically become subscribers. Recently developed buildings have amber markers for seven game days.

Acquisitions unlock at Regional Operator rank. Review the company price, connected POP integration cost and added monthly upkeep before purchase. Only licensed districts are integrated; spectrum transfers, but rival treasury and mobile customers do not. At least one independent competitor must remain. Acquisition is blocked during a spectrum auction.

Save schema 19 migrates existing saves and validates strategy history, decisions, development and acquisitions. City Operator charters start after day 30 and offer 90-day challenges with progressively higher targets.

Browser tests run a Vite production build with an explicit VITE_E2E=true flag, served through preview on port 4175. The normal build has no window.__game test hook. Test output goes to dist-e2e; npm run build still produces the regular dist directory. CI also checks Prettier formatting.

## City interaction update

The map now has an elevated city foundation, district navigation with live coverage, isolated-site labels and fibre load badges. Select a district shortcut to focus the camera and open its controls.

When placing a non-core site outside blueprint mode, enable **Include fibre to nearest live site** to commission the site and backhaul in one transaction. The hover price includes both; insufficient cash or missing backhaul prevents the whole purchase. Manual placement remains the default.

Select a connected site to review **Build backup fibre** when an independent alternative exists. Recommendations test every link cut on the primary path and exclude peers behind the same upstream bottleneck. The purchase is validated again against the current network.

## Reach and failure planning

Site hover previews and upgrade cards report incremental potential homes using the same fixed-coverage target as the simulation. Blueprint totals count only connected infrastructure and respect the research coverage ceiling. These are potential homes, not instant subscribers.

Select an operational site or span and choose **Test site failure** or **Test fibre cut**. The paused, hypothetical drill highlights affected districts and disconnected sites and compares residential peak delivery before and after the loss. It excludes mobile, business, cache and upstream-transit effects. **End drill** or Escape returns to normal inspection; infrastructure and cash are unchanged.

Field response: choose a crew using travel plus repair time, compare scheduled and emergency work, and follow restoration estimates while the crew drives and repairs. Automatic Dispatch prioritizes the recorded customer impact of waiting incidents (oldest first on ties) and selects the quickest available crew. Standard repairs retain their existing negative-cash allowance; emergency call-outs require cash upfront.

District expansion: Company → Strategy desk → Expansion compares residential homes, income, bandwidth appetite and rival share. Choose an access node or POP starter plan; a single atomic purchase acquires any missing licence and builds the shortest available fibre connection to a live site. The quote includes capital, upkeep and potential reach, without granting subscribers. District checklists track a live site, 100 fixed customers and an independently protected site.

Company profile: click the company name or emblem in the top bar to pause and open your operator journey. Rename the company, choose an emblem, inspect all five ranks and navigate directly from unmet requirements to growth, district exploration, research or data-centre construction. Brand changes are free and persist through ordinary game saves; rank eligibility and rewards retain their existing rules.

Smart pause: click the clock in the top bar to select automatic stops for new incidents, full upstream transit, contract offers, completed research and promotions. Disabled by default; preferences persist in this browser across save slots. Accelerated play stops after the first five-minute step containing an enabled event and lists all simultaneous events. Review links keep time paused; Resume restores the previous speed, while Dismiss only hides the notice.

City infrastructure procurement (save schema 20): the Projects screen hosts rotating school, emergency-service and district rollout tenders. Sealed bids score price at 70% and reputation at 30%, with a real 10% performance bond. A winning operator must deliver licensed, routed access sites, programme-specific reach and independent paths, and at least 80% live-site condition for six continuous hours before the deadline. A cut resets acceptance. Success pays the requested amount, refunds the bond and grants 5 reputation plus research points; failure forfeits the bond and costs 5 reputation. Losing or withdrawn bids recover their bond. The project district is marked on the map, and smart pause can stop on project updates. Older saves migrate without any bond or bid being created.

District competition (save schema 21): open Company → Open market control, or use Open district competition from a selected district. A geography-based market board compares the same local appeal used by the customer simulation, and a 30-day history tracks actual fixed customers. Up to three paid 14-day operations can run citywide, one per district: switcher assistance raises appeal by 28%; loyalty raises appeal by 6% and reduces fixed-customer losses by 45%; service promises raise appeal by 20% only while fixed reach is at least 40%, satisfaction 70, global network health 90 and the district is not in outage. Meeting the standard for 80% of the fortnight earns 3 reputation; missing it or cancelling costs 3. All programme costs are upfront, scaled to district size, and cancellation does not refund them. Results show observed customer changes, not causal attribution.

Rivals periodically fund local price offensives, publicity campaigns or permanent fibre rollout from their own cash. They prioritise districts with an existing player base and active player operations. Temporary moves expire after 10 days; fibre coverage remains. Acquired rivals lose active pressure. Smart pause can stop for new rival moves or completed operations. Existing saves migrate with no purchased operation and a two-day grace period before the first rival initiative.
