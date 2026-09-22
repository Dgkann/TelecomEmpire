# Changelog

## Unreleased

### Changed

- Early and mid-game research costs about 20% less: FTTH, NOC, GPON, 10G fibre,
  4G LTE, 100G backbone and edge computing. Later research is unchanged. In the
  release audit's strongest campaign policy, 5 of 6 seeds finished the campaign
  instead of 3, and finished runs took 671–785 days instead of 807–998.

### Performance

- The city canvas repaints only buildings whose appearance changed and blends
  precomputed daylight and night layers instead of repainting every hour.
- The map draws ground, borders and overlays, buildings and the network as
  separate layers, so animations and network updates leave the ground alone.

## 1.0.0 — 2026-09-21

First release. Save schema 26; saves from every earlier development build are
migrated on load.

### Game

- Build and run an ISP across a seeded five-district city: cores, POPs, access
  nodes, data centres, mobile towers and fibre, with traffic routed back to a
  core and loaded onto every site and span it crosses.
- Residential, mobile, business and enterprise customers; contracts with SLA
  penalties, flexible terms and premium counters; wholesale and MVNO access.
- Faults, field crews, scheduled and emergency repairs, planned maintenance and
  automatic dispatch.
- Research tree, spectrum auctions against rival bidders, rivals with their own
  networks, cash and spectrum, and company acquisitions.
- Loans and credit limits, a finance ledger, energy tariffs with a carbon levy,
  on-site generation, and data centres built and expanded in two stages.
- Network planning: drafted build plans, a capacity lab, failure drills, backup
  fibre recommendations, district launch quotes and smart pause.
- City tenders, district market operations, a strategy desk with city proposals
  and operator charters, five operator ranks, development goals, and a campaign
  across Marmara, Karadeniz and Ege.
- Signal routing, fault finding and network restoration exercises with a weekly
  reward.

### Interface

- English and Turkish throughout, including alerts, notifications, the event
  log, customer posts and the finance ledger. Money is shown in Turkish lira.
- Three save slots with import and export, desktop and phone layouts, keyboard
  shortcuts and adaptive map detail for large networks.

### Quality

- 731 headless simulation checks, 138 browser test cases on desktop Chromium,
  mobile Chromium and mobile WebKit (one phone-only case is skipped on desktop),
  and CI that also checks formatting, the dependency audit and that every commit
  in a pull request builds on its own.

### Known limitations

- Progress is stored in the browser's local storage; use save export to move or
  back up a game.
- With the CPU throttled four times, the construction burst in the performance
  benchmark still shows visible stalls.
- International expansion is not implemented.
