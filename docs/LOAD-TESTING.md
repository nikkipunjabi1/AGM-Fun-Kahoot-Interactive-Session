# Load testing

Do this at least once before the event, on the real production deploy, at full scale. Finding a
limit at 09:00 on 11 October is not the plan.

## The included harness

[`scripts/loadtest.js`](../scripts/loadtest.js) simulates realistic players: they join, poll
state on a jittered ~1 s interval, and answer each question at a randomised point inside the
window — because real humans do not all answer at second 0.

```bash
# Smoke test — 50 players
node scripts/loadtest.js --url https://<site>.netlify.app --players 50

# Full scale
node scripts/loadtest.js --url https://<site>.netlify.app --players 1000

# Pessimistic: everyone answers instantly (worst-case write burst)
node scripts/loadtest.js --url https://<site>.netlify.app --players 1000 --burst
```

Run it against a **test session**, then reset before the event.

## What good looks like

| Metric | Target | Concerning |
|---|---|---|
| Join success rate | 100% | < 99% |
| Answer acceptance rate | > 99.5% | < 98% |
| State poll p95 latency | < 300 ms | > 1000 ms |
| Answer POST p95 latency | < 800 ms | > 2000 ms |
| Errors (5xx) | 0 | any |
| Duplicate answers accepted | **0** | any — this is a correctness bug |

## Reading the results

**High state-poll latency** means the CDN cache is not being hit. Check that `/api/state`
returns `Cache-Control: public, max-age=1, stale-while-revalidate=4` and that
`Netlify-Cdn-Cache-Control` is not being overridden:

```bash
curl -sI https://<site>.netlify.app/api/state | grep -i cache
```

**High answer latency under `--burst`** is expected and acceptable — real players never all
answer in the same 100 ms. Judge on the non-burst run.

**Any duplicate answers accepted** is a correctness failure, not a performance one. The
`UNIQUE (session_id, player_id, question_index)` constraint should make it impossible; if the
harness reports one, stop and investigate before the event.

## Caveat on what this proves

The harness runs from one machine over one connection. It proves **the backend holds**. It
cannot prove the venue Wi-Fi holds — that is a different risk, addressed in
[OPERATIONS.md](OPERATIONS.md#venue-network), and it is the more likely one to bite you.

## Cleaning up afterwards

```sql
DELETE FROM sessions WHERE code LIKE 'LOADTEST%';
```

`ON DELETE CASCADE` removes the players and answers with it.
