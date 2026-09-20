<div align="center">
  <img src="public/logos/pmi-uae-horizontal-color.svg" alt="PMI UAE Chapter" width="420">
  <h1>AGM 2026 — Interactive Quiz</h1>
  <p><strong>Growing in Unity &nbsp;|&nbsp; Leading Projects &nbsp;|&nbsp; Shaping Future</strong></p>
  <p>A self-hosted, PMI-branded live quiz built for the PMI UAE Chapter Annual Gathering<br>
  <em>11 October 2026 · Dubai · ~1,000 delegates · 30-minute session</em></p>
</div>

---

## What this is

A Kahoot-style live quiz that runs entirely on infrastructure PMI UAE controls. One big screen
drives the room, every delegate plays from their own phone, and **every single submission is
recorded** to a Postgres database you own and can export.

It was built specifically because the off-the-shelf option has real constraints for this event:

| | Kahoot 360 | This app |
|---|---|---|
| 1,000 concurrent players | Enterprise tier only | Yes, by design |
| PMI UAE branding | Limited theming | Full brand control |
| Raw submission data | Summary export | Every row, in your own SQL database |
| Attendee contact capture | Not supported | First/last name, email, optional phone |
| Cost for the event | Annual licence | ~USD 0 (free tiers) |

> If the build is ever at risk, Kahoot 360 remains a valid fallback — see
> [`docs/OPERATIONS.md`](docs/OPERATIONS.md#contingency-plans) for the switch-over plan.

---

## The four surfaces

| Route | Who uses it | Purpose |
|---|---|---|
| `/` | ~1,000 delegates, on their phones | Join, answer, see their score and rank |
| `/screen` | The main projector | QR to join, live question, timer, results, leaderboard, prize draw |
| `/host` | The presenter's laptop or tablet | Advance questions, lock answers, reveal, run the draw |
| `/admin` | Organiser | Live stats, per-question analytics, CSV export |

`/host` and `/admin` are gated behind `HOST_TOKEN`. `/screen` is read-only and safe to project.

---

## Why this architecture

Netlify is a static CDN plus serverless functions — it **cannot run a persistent WebSocket
server**. Rather than bolt on a realtime service with a concurrent-connection ceiling (Supabase
Realtime free tier stops at 200, Pusher at 100), the game state is distributed the way a CDN is
actually good at:

```
                       HOST (laptop)
                            │  advance / lock / reveal
                            ▼
                  Netlify Function  ──────────►  Supabase Postgres
                            │                      (durable record of
                            │                       every submission)
                            ▼
                    /api/state  ──►  Netlify CDN edge
                                     Cache-Control: max-age=1, SWR
                                          │
                     ┌────────────────────┼────────────────────┐
                     ▼                    ▼                    ▼
                  phone 1              phone 2   ...        phone 1000
                     └──────── answer POST ──────────────────────┘
                                        │
                                        ▼
                               Netlify Function → Postgres
```

**Why this holds up at 1,000 players:**

- **No connection ceiling.** Players poll a tiny JSON document instead of holding a socket open.
  There is nothing to exhaust.
- **The origin sees ~1 request per second, not 1,000.** All delegates are in one room in Dubai,
  so they hit one Netlify edge PoP. The 1-second cache collapses 1,000 polls into a single
  origin read.
- **Rank is computed on the phone, not the server.** The cached state payload carries a sorted
  array of every score (~2 KB gzipped). Each phone binary-searches its own score to find its
  rank — so 1,000 personalised ranks cost zero extra requests.
- **Writes are the only real load**, and they spread naturally across the 15-second answer
  window: ~66 writes/sec average. Supabase reaches Postgres over HTTP (PostgREST), so there is
  no connection pool to exhaust.

Full detail and the numbers behind it: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Session format

30 questions across 3 rounds, 15 seconds each, inside a 30-minute slot.

| Round | Theme | Questions |
|---|---|---|
| 1 | UAE Mega Projects | 10 |
| 2 | Sustainability Challenge | 10 |
| 3 | PMI UAE Chapter | 10 |

Minute-by-minute timings, host script and cue cards:
[`docs/RUN-OF-SHOW.md`](docs/RUN-OF-SHOW.md).

### Scoring

Kahoot-style speed-weighted scoring, computed **server-side** so it cannot be manipulated:

```
correct answer  →  500 + 500 × (1 − elapsed / duration)      # 1000 instant, 500 at the buzzer
wrong answer    →  0
no answer       →  0
```

### Picking the winners

Per the Chapter's decision: **top 5 by score**, tie-broken by lowest cumulative answer time.
A random draw is used *only* where genuinely tied players straddle the cut-off — if, say, six
people finish on identical score and identical time for the last two slots, those six go into an
animated on-screen spinner. The draw seed is recorded in the database so any result can be
audited afterwards. Winner count is configurable from 3 to 10 via `WINNER_COUNT`.

---

## Quick start

```bash
npm install
cp .env.example .env     # then fill in your Supabase keys and a HOST_TOKEN
npm run dev              # http://localhost:8888
```

Set up the database once, by pasting [`db/schema.sql`](db/schema.sql) into the Supabase SQL
editor. Step-by-step: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Other commands

```bash
npm run check                          # validate the question bank
npm run build && node scripts/mock-server.js   # preview every phase, no Supabase needed
node scripts/loadtest.js --url <site> --players 1000 --confirm   # see docs/LOAD-TESTING.md
```

`scripts/mock-server.js` serves the built app with a fake game state you drive from the URL
(`/screen?phase=reveal`, `/screen?phase=draw`, …), so the UI can be checked in every phase on a
laptop with no network.

---

## Documentation

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow, schema, scoring, caching, scale maths |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Supabase setup, Netlify setup, environment variables |
| [RUN-OF-SHOW.md](docs/RUN-OF-SHOW.md) | Minute-by-minute plan and host script |
| [OPERATIONS.md](docs/OPERATIONS.md) | Event-day runbook, failure modes, contingency plans |
| [LOAD-TESTING.md](docs/LOAD-TESTING.md) | How to simulate 1,000 players before the event |
| [BRANDING.md](docs/BRANDING.md) | PMI colour tokens, logo variant rules, accessibility |
| [BRANCHING.md](docs/BRANCHING.md) | Branch strategy and review gate before `main` |
| [BACKLOG.md](docs/BACKLOG.md) | Deferred items, open decisions and pre-event actions |
| [DATA-PRIVACY.md](docs/DATA-PRIVACY.md) | What is collected, consent, retention, deletion |

---

## ⚠️ Two things to action before event day

1. **This GitHub repository is public.** The answer key lives server-side only and is never
   sent to the browser — but it *is* readable in this repo's source. A determined delegate
   could find it. **Recommendation: switch the repository to Private before 11 October.**
   See [`docs/OPERATIONS.md`](docs/OPERATIONS.md#repository-visibility).
2. **Venue Wi-Fi is the single biggest risk to this session**, far more than the software.
   1,000 phones on one access point will fail regardless of how the app is built. The
   mitigations — and the offline fallback — are in
   [`docs/OPERATIONS.md`](docs/OPERATIONS.md#venue-network).

---

<div align="center">
  <sub>Built for PMI UAE Chapter · <a href="https://pmi-uae.org">pmi-uae.org</a></sub>
</div>
