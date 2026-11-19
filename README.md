# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Sawiyanto95/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Sawiyanto95/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol in a sealed DefiLlama snapshot that records no token, ranked by what its
launch would be worth — as a static dashboard you can open with no network.

## What it ranks

The snapshot (14 Nov 2026, 758 protocols) is the only data source. A protocol ranks
when the snapshot records no token for it — no market cap, no CoinGecko id, no symbol —
**and** it is not a wrapped, staked or bridged product of a token that already trades.
That gives 198 rows: the 40-protocol watchlist, plus 158 more the radar found below the
$50M floor. The 144 pre-token protocols that are wrapped, staked or bridged products
are set aside with their reason, in the dashboard's Set aside tab — ranked as
“pre-token” they would be wrong, so they are shown, not hidden.

## The model (radar-2)

Implied value = TVL × 0.30 × growth × maturity × breadth, from the snapshot alone:

- **growth** = 1 + clamp(7d change, −50%, +150%) × 0.6
- **maturity** = 0.5 + min(age, 1460 days) / 1460 × 0.5 (age unknown: 365 days)
- **breadth** = 1 + 0.05 × min(chains − 1, 4)

No protocol name is special-cased. The dashboard shows each row's four factors, so the
arithmetic can be checked, and a sandbox tab re-ranks the board live under different
weights. Every row carries a six-step farm plan sized to that protocol — capital from
its TVL, hold time from its age, actions from its category and chains.

## The dashboard

`dashboard/` is a static page (index.html, app.css, app.js) that reads `data.js` and
needs no network. It has the board with search, category and chain filters, a
watchlist-only toggle and sorting; a detail view per protocol with the model breakdown
and the farm plan; a live-token tab for contrast; the set-aside list; and the model
sandbox.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json`
and `data.js`, copies `dashboard/` and `screenshots/` into the output directory,
and writes `dossier.json` with `vendor/makefun-board.ts`.

## Layout

- `main.ts` — the runner
- `lib/radar.ts` — the model: eligibility, scoring, farm plans, the dashboard payload
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged
- `dashboard/` — the static page
- `screenshots/` — the board, a detail view, a filtered view

---

<sub>Entered on [make.fun](https://make.fun/?ref=bc76ffwb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
