# City rendering benchmark

## September 21, 2026 release check

Measured at game commit `9ba651c` on Windows with Node.js 26.5.0 and npm 11.17.0.
Browser samples ran sequentially, after the full E2E suite, at 1280 x 720 with
seed 4242. These are single diagnostic samples, not a before/after comparison
or an FPS guarantee. No runtime code changed during this release check.

| Metric                           | Standard construction burst | Large settled network with panning |
| -------------------------------- | --------------------------: | ---------------------------------: |
| Sites / fibre spans              |                     42 / 41 |                          152 / 151 |
| CPU slowdown                     |                          4x |                                 1x |
| Sample duration                  |                        10 s |                               30 s |
| Frames delivered                 |                         190 |                              1,375 |
| Frame interval, 95th percentile  |                    250.0 ms |                            33.4 ms |
| Maximum frame interval           |                    699.9 ms |                           133.4 ms |
| Simulation tick, 95th percentile |                     51.1 ms |                            20.4 ms |
| Long tasks / total time          |               43 / 4,726 ms |                         8 / 437 ms |
| Game minutes advanced            |                         660 |                              2,300 |

Both browser tests passed. The large-network sample reported no persistence
error and an autosave timestamp of game minute 2,910. The construction sample
did not reach an autosave. CPU-throttled construction still has visible stalls;
the large-network sample averaged about 46 frames per second, with occasional
long frames. These results do not establish a regression against historical
samples taken under different host conditions.

The separate 152-site traffic allocation benchmark measured a 3.68 ms median
and 5.06 ms p95. Reproduce the two browser configurations in PowerShell, using
a fresh shell for the default sample:

```powershell
npm run performance

$env:PERF_SITES = '150'
$env:PERF_DURATION = '30000'
$env:PERF_PAN = '1'
$env:PERF_SETTLED = '1'
$env:PERF_CPU_RATE = '1'
npm run performance

npm run performance:network
```

The full release check also passed TypeScript, ESLint, Prettier, production
build, all 729 simulation assertions and all 137 applicable E2E cases across
desktop Chromium, mobile Chromium and mobile WebKit. One desktop case was
skipped because it tests a narrow-screen-only component. The dependency audit
reported zero vulnerabilities. The checks did not change gameplay or balance.

The first Linux CI run exposed three WebKit exercise timeouts despite the local
pass. The worker-scoped `test.slow` callback extended its setup hook instead of
the running test's 45-second budget. The follow-up applies `test.slow` inside
each of the three board-solving tests. The injected-incident dispatch fixture
also pauses the simulation so random events cannot consume the available crew
while the test operates the dialog. These changes affect tests only.

## Earlier measurements

`npm run performance:network` isolates traffic allocation on a 152-site chain
with 15 service groups and three priorities. The shared-backhaul follow-up avoids
rechecking the same resource for every flow in a service, and computes automatic
balancing weights once per site per load calculation. Two paired samples reduced
median allocation time from 7.7–7.9 ms to 6.1–6.6 ms; all returned per-node,
per-link and per-service values matched the previous implementation exactly.
These are allocation timings on a synthetic deep chain, not whole-game FPS.

The subsequent 30-second settled/panning browser sample delivered 1,499 frames
(about 50 FPS), with a 33.4 ms p95 frame interval, a 100 ms maximum and two long
tasks totalling 105 ms. Simulation ticks had a 13.3 ms p95. Both autosaves passed.
Overall panning FPS remained similar to the prior release; this follow-up mainly
reduces traffic-calculation work and does not eliminate every rendering stall.

Run `npm run performance`. It builds an isolated E2E preview on port 4175, creates
a seeded city (328 buildings, 42 sites, 41 fibres), then records a 10-second
construction-burst / 4x gameplay sample with Chromium CPU throttled by a factor
of four. It does not open or change the player's port-4173 save data.

The test writes `performance.json` and `profile-city.png` to its Playwright output
directory. Set `PERF_OUTPUT` to preserve a JSON result elsewhere; set
`PERF_CPU_RATE=1` to profile without CPU throttling. Run samples without other
builds/tests in parallel. Compare several runs before treating small differences
as significant. Timings are diagnostic, not flaky CI pass/fail thresholds.

For larger scenarios, set `PERF_SITES=150` (152 total sites),
`PERF_DURATION=30000`, `PERF_PAN=1` and `PERF_SETTLED=1`. The settled fixture starts
near midnight with 65% building subscriptions to cover a daily transition and
autosave while panning. This is a synthetic stress fixture, not a progression
balance test. Set `PERF_PROFILE` to a path to capture a Chromium CPU profile.

## Network Lab update: larger networks

The 152-site, 151-fibre, 4× CPU-throttled construction sample exposed repeated
single-cut route searches in resilience checks. An iterative bridge traversal
now identifies all sites protected against one cut in a single topology pass.
Its result is checked against exhaustive cut tests over 24 generated topologies,
including multiple cores, failures and parallel spans.

With adaptive map detail, cached unchanged building paints and the new
resilience calculation, the same 10-second large-city fixture measured:

| Metric                           | Previous release | Network Lab update |
| -------------------------------- | ---------------: | -----------------: |
| Frame interval, 95th percentile  |         349.9 ms |            83.3 ms |
| Frames delivered                 |               83 |                396 |
| Total long-task time             |         7,789 ms |           2,751 ms |
| Simulation tick, 95th percentile |          90.7 ms |            61.1 ms |

The previous-release sample also captured a CPU profile, so treat precise
percentages as approximate. Panning now updates the camera's SVG transform at
most once per frame and commits React state on release; it no longer rebuilds
the full map tree on every pointer event.

The 30-second settled fixture (152 sites, continuous panning, 4× game speed,
unthrottled CPU) advanced 2,300 game minutes and completed two autosaves without
errors. Samples delivered roughly 50–57 FPS. The final sample had a 33.4 ms p95
frame interval and an 83.4 ms maximum; four long tasks totalled 218 ms. Occasional
stalls remain under this combined stress, so this is not a claim of locked 60 FPS.

Profiling also exposed audio-device startup on the first incident. Audio is now
prepared by a real menu/user gesture, suspended contexts do not queue silent
oscillators, and finished voices disconnect. Ground lighting changes one layer's
opacity instead of rewriting hundreds of tile colours. The benchmark now performs
a real menu click before setup to exercise that audio initialization path.

## September 8, 2026 optimization sample

Same machine, viewport (1280 x 720), seed (4242), setup and throttle:

| Metric                           |   Before |    After |
| -------------------------------- | -------: | -------: |
| Frame interval, 95th percentile  | 1,000 ms | 116.6 ms |
| Frames delivered during sample   |       28 |      353 |
| Simulation tick, 95th percentile |  74.3 ms |  15.0 ms |
| Total long-task time             | 9,559 ms | 2,519 ms |
| Game minutes advanced            |      120 |      760 |

The old renderer falls behind the simulation timer; the new renderer advances
more game time within the wall-clock sample. These measurements include initial
construction notifications and changing day/night lighting. They are not a
guarantee of a particular FPS on another device or in a larger saved city.

An additional sample without CPU throttling delivered 599 frames in 10 seconds,
with a 16.8 ms p95 frame interval, 33.4 ms maximum frame interval, no long tasks
and a 3.7 ms p95 simulation tick on this machine.

Changes responsible for the improvement:

- Render decorative building geometry into one bounded canvas, caching Path2D
  geometry independently of lighting. Keep selectable sites, fibres, map labels,
  placement targets and connection feedback as SVG.
- Reuse district geometry until its visible properties change, and quantize
  subtle building connection tint changes.
- Restrict continuous fibre effects to relevant highlighted routes, limit
  ambient cars, and release completed construction animations.
- Replace the full-screen SVG turbulence texture with a small CSS grain pattern.
- Bound concurrent construction notifications and skip obsolete dismissals.
- Reuse network routes while topology is unchanged; invalidate by values for
  failures, repairs, endpoints, lengths and core changes, including in-place edits.

The regular E2E suite also checks non-empty canvas output, night repainting and
site selection on desktop Chromium, mobile Chromium and mobile WebKit.
