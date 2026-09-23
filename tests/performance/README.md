# City rendering benchmark

## September 24, 2026: stable map render inputs

The map now keeps each site and fibre object, and the arrays that hold them,
until something a glyph draws changes, with load bucketed to whole percentages.
Memoised glyphs therefore skip the ticks where nothing visible moved. Three
interleaved pairs on the large settled fixture (152 sites, 4x game speed, 4x CPU
throttling, GPU enabled, 10 s, no panning), switching only `MapView.tsx`:

| Metric (median of 3)            |   Before |    After |
| ------------------------------- | -------: | -------: |
| Frames delivered                |      464 |      479 |
| Frame interval, 95th percentile |  66.6 ms |  50.0 ms |
| Page script                     | 2,311 ms | 1,968 ms |
| Long-task time                  | 1,622 ms | 1,016 ms |

Script and long-task ranges did not overlap between the builds (2,230–2,374 ms
against 1,950–2,028 ms, and 1,368–2,046 ms against 864–1,106 ms). The single
longest frame was higher with the change (250–283 ms against 183–217 ms), so
occasional stalls remain. Every run advanced the same 760 game minutes.

```powershell
$env:PERF_GPU = '1'
$env:PERF_SITES = '150'
$env:PERF_SETTLED = '1'
npm run performance
```

## September 22, 2026: ground layer experiment (no change)

Drawing the ground tiles on a canvas, like the buildings, was the next candidate.
To bound the possible gain, a temporary test ran the same 10-second pan (40 sites,
4x game speed, 4x CPU throttling, GPU enabled) with the ground layer shown and
with it removed entirely (`display: none` on its 735 tiles), in four interleaved
pairs:

| Frames in 10 s | Pair 1 | Pair 2 | Pair 3 | Pair 4 | Median |
| -------------- | -----: | -----: | -----: | -----: | -----: |
| Ground shown   |    346 |    293 |    326 |    317 |  321.5 |
| Ground hidden  |    319 |    302 |    337 |    318 |  318.5 |

Removing the ground did not raise the frame count, so a canvas could not help and
the ground stays SVG. In a profiled sample of the same pan, the Performance domain
reported 9.1 s of main-thread task time, of which page script was 2.3 s, style
0.8 s and layout 0.3 s.

## September 22, 2026: map layers and the graphics card

By default Playwright's Chromium draws with SwiftShader, a software renderer, so
earlier samples measured CPU drawing rather than the graphics card players use.
`PERF_GPU=1` passes the flags that select the real GPU on Windows (verified as
Direct3D 11 on an RTX 4060 laptop GPU).

The map now draws four stacked layers: ground tiles, district borders with cars and
overlays, the building canvas, and the interactive network. Animations and network
updates no longer repaint the ground, and the building canvas moves with the
camera as a CSS transform. Screenshots of six scenes, including one taken in the
middle of a drag, matched the single-SVG map with zero differing pixels.

Four interleaved pairs per scenario with the GPU enabled, 4x CPU throttling:

| Frames in 10 s (median) | Single SVG | Layers | Pairs improved |
| ----------------------- | ---------: | -----: | -------------: |
| Construction burst      |        347 |    390 |         3 of 4 |
| Construction with pan   |        187 |    230 |         4 of 4 |

Sliding the layers with CSS during a drag, instead of updating the camera each
frame, was also tried; it lowered pan frames from about 162 to 106 in all four
pairs, so the camera is still applied per frame while dragging.

## September 22, 2026: building canvas

Profiles of the construction burst showed the building canvas repainting all 328
buildings whenever one customer threshold changed, and again at each of the 16
daily lighting steps. The canvas now keeps the city painted at full daylight and
at full night, blends the two for the current hour, and repaints only the area
around a building whose appearance changed. A lighting layer the current hour
does not show is caught up when it is next needed.

End-to-end frame counts on this host were too noisy to compare: the simulation
tick p95, which this change does not touch, ranged from 23 to 98 ms between
identical runs. Three interleaved CPU profiles per build at 4x throttling gave:

| Metric (10 s sample)                |       Before |      After |
| ----------------------------------- | -----------: | ---------: |
| Building canvas JavaScript          | 727–1,012 ms | 369–853 ms |
| Canvas time / simulation time (med) |         2.03 |       0.78 |

Partial repaints were checked against full repaints over a simulated day and a
half: at most 6 pixels differed, by at most 3/255, and the difference did not
accumulate. At intermediate hours the blend matches direct painting within 4/255
for over 99.5% of pixels; the rest are nearly transparent edge pixels. Native
SVG rasterisation of the network overlay is now the largest remaining cost.

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
