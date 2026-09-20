# Architecture

## Design goal

One 30-minute session. ~1,000 delegates in a single room in Dubai. Every submission recorded
accurately. Zero tolerance for a mid-session outage in front of the Chapter's largest audience
of the year.

That goal pushes toward **boring, cacheable, stateless** infrastructure over anything clever.

---

## The constraint that shapes everything

Netlify gives us a global CDN and short-lived serverless functions. It gives us **no persistent
process**, so no WebSocket server. The usual answer is a hosted realtime service, but every
option has a concurrent-connection ceiling that 1,000 players walks straight through:

| Service | Free tier ceiling | Verdict |
|---|---|---|
| Supabase Realtime | 200 concurrent | Not enough |
| Pusher | 100 concurrent | Not enough |
| Ably | 200 concurrent | Not enough |
| Firebase RTDB (Spark) | 100 concurrent | Not enough |
| Firebase RTDB (Blaze) | 200,000 concurrent | Works, but needs billing enabled |

So we removed the realtime dependency entirely.

---

## How state actually reaches 1,000 phones

**Polling a CDN-cached document.** Players ask `/api/state` roughly once per second. That
response carries a 1-second cache header, so Netlify's edge serves almost every one of those
requests from memory without touching our function.

```
Cache-Control: public, max-age=1, stale-while-revalidate=4
```

The critical insight: **all 1,000 delegates are in one room**, so they resolve to the same
Netlify edge PoP. That PoP fetches from origin at most once per second and fans the answer out
to everyone else.

```
1,000 phones × 1 poll/sec  =  1,000 requests/sec at the edge
                           =  ~1 request/sec at our function
                           =  ~1 query/sec at Postgres
```

There is no connection state anywhere, so there is nothing to exhaust, nothing to reconnect,
and a phone that locks its screen or drops off Wi-Fi simply resumes on its next poll.

**Trade-off, stated plainly:** question transitions land within ~1 second rather than ~150 ms.
For a room watching a projector, that is imperceptible — and it buys immunity from the failure
mode that would actually ruin the session.

---

## Keeping 1,000 timers in sync

Clients never trust their own clock. Every state response includes:

```json
{ "serverNow": 1760176800000, "questionStartedAt": 1760176795000, "durationMs": 15000 }
```

Each phone measures its offset from server time on every poll and counts down against the
corrected clock. A delegate whose phone clock is 4 minutes fast still sees the correct timer.

Answer timing is **never** taken from the client. The server computes elapsed time from its own
receipt timestamp, clamped to `[0, durationMs]`. A tampered client cannot claim a faster answer.

---

## Computing 1,000 personalised ranks with zero extra requests

Showing each delegate "you are 47th" would normally mean 1,000 uncacheable queries at once.
Instead, the leaderboard-phase state payload includes a **sorted array of every score**:

```json
{ "top": [{"name":"Ahmed K.","score":28450}, ...],
  "scores": [28450, 27900, 27100, ...] }
```

1,000 integers is ~2 KB gzipped. Each phone binary-searches its own score locally to find its
rank. The payload is identical for everyone, so it caches perfectly — 1,000 personalised
results from one cached response.

---

## Write path

Answers are the only genuinely uncacheable load.

```
1,000 answers spread across a 15-second window  →  ~66 writes/sec average
Opening burst (first 3 seconds, ~40% of answers) →  ~130 writes/sec peak
```

Netlify Functions autoscale to this comfortably. Supabase is reached over HTTP via PostgREST,
**not** a raw Postgres connection, so there is no pool to exhaust no matter how many function
instances spin up.

Duplicate and replayed submissions are rejected by the database itself:

```sql
UNIQUE (session_id, player_id, question_index)
```

An honest double-tap and a malicious replay hit the same constraint. The first answer stands.

### Budget check

| Item | Event total | Free tier | Headroom |
|---|---|---|---|
| Function invocations | ~35,000 | 125,000 / month | 3.5× |
| Postgres rows written | ~31,000 | 500 MB storage | ~600× |
| Postgres row size | ~120 bytes | — | ~4 MB total |
| Bandwidth | ~1.5 GB | 100 GB / month | 66× |

The event runs comfortably inside free tiers on both Netlify and Supabase.

---

## Database schema

```
sessions                     players                      answers
─────────                    ───────                      ───────
id            uuid pk        id          uuid pk          id             bigserial pk
code          text uniq      session_id  → sessions       session_id     → sessions
status        text           first_name  text             player_id      → players
phase         text           last_name   text             question_index int
question_index int           email       citext            choice         char(1)
question_started_at timestz  phone       text null        is_correct     bool
settings      jsonb          consent     bool             elapsed_ms     int
created_at    timestz        joined_at   timestz          points         int
                             user_agent  text             created_at     timestz

                             UNIQUE (session_id, email)   UNIQUE (session_id, player_id,
                                                                  question_index)
```

`player_scores` is a materialised-on-read view aggregating `answers` into total score and
total elapsed time, ordered for the leaderboard and the prize draw.

Full DDL: [`db/schema.sql`](../db/schema.sql).

---

## Where the answer key lives

The correct answers are in `netlify/functions/_lib/questions.js` — a **server-side module**.
Vite never bundles it, so it is not in any JavaScript the browser downloads. Clients receive
question text and the four options only; correctness comes back in the response to their own
submission, after they have committed to an answer.

> **This does not protect against someone reading this public GitHub repository.** See
> [OPERATIONS.md](OPERATIONS.md#repository-visibility) — the repo should be made private
> before event day.

---

## Game phases

```
  lobby ──► question ──► locked ──► reveal ──► leaderboard ──┐
              ▲                                              │
              └──────────────── next question ───────────────┘
                                                             │
                                          final ──► draw ──► ─┘
```

| Phase | Screen shows | Players see | Answers accepted |
|---|---|---|---|
| `lobby` | QR code + live join count | Registration form | — |
| `question` | Question, options, countdown | Four answer tiles | Yes |
| `locked` | "Time's up" | "Answer locked in" | No (grace window only) |
| `reveal` | Correct answer + distribution | Right/wrong + points | No |
| `leaderboard` | Top 10 | Their own score and rank | No |
| `final` | Final top 10 | Final score and rank | No |
| `draw` | Animated winner reveal | Winner names | No |

The host drives every transition manually — nothing advances on a timer the presenter cannot
override. If the room needs an extra 20 seconds, the host simply waits.
