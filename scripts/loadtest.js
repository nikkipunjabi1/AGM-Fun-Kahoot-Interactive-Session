#!/usr/bin/env node
// ===========================================================================
// Load test harness — BL-05.
//
// Simulates delegates joining, polling state and answering, then reports
// whether the system actually behaved. Read docs/LOAD-TESTING.md before using.
//
//   node scripts/loadtest.js --url https://<site>.netlify.app \
//                            --token <HOST_TOKEN> --players 1000 --confirm
//
// WITHOUT --token the harness only simulates players; you drive the game from
// /host yourself. WITH --token it drives the whole run end to end.
//
// ⚠ This writes into whatever session GAME_CODE points at. Run it against a
//   test deploy, or reset the session afterwards — otherwise virtual players
//   appear on the live leaderboard.
// ===========================================================================

const args = parseArgs(process.argv.slice(2))

const URL_BASE = (args.url || 'http://localhost:8888').replace(/\/$/, '')
const PLAYERS = Number(args.players) || 50
const TOKEN = args.token || ''
const BURST = Boolean(args.burst)
const QUESTIONS = Number(args.questions) || 30
const DURATION_MS = Number(args.duration) || 15000

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ } else out[key] = true
  }
  return out
}

if (!args.confirm) {
  console.error(`
⚠  This writes virtual players into the session at ${URL_BASE}.
   Run it against a test deploy, or reset the session afterwards.

   Re-run with --confirm to proceed.
`)
  process.exit(1)
}

// --- metrics ----------------------------------------------------------------
const metrics = {
  joins: { ok: 0, fail: 0, ms: [] },
  answers: { ok: 0, duplicate: 0, tooLate: 0, stale: 0, fail: 0, ms: [] },
  polls: { ok: 0, fail: 0, ms: [] },
  errors: new Map(),
}

function note(err) {
  const key = String(err).slice(0, 120)
  metrics.errors.set(key, (metrics.errors.get(key) ?? 0) + 1)
}

async function timed(bucket, fn) {
  const t0 = performance.now()
  try {
    const result = await fn()
    bucket.ms.push(performance.now() - t0)
    return result
  } catch (err) {
    bucket.ms.push(performance.now() - t0)
    throw err
  }
}

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))])
}

// --- host control -----------------------------------------------------------
async function host(action, extra = {}) {
  if (!TOKEN) return null
  const res = await fetch(`${URL_BASE}/api/host-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ action, ...extra }),
  })
  if (!res.ok) throw new Error(`host ${action} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function getState() {
  return timed(metrics.polls, async () => {
    const res = await fetch(`${URL_BASE}/api/state`)
    if (!res.ok) throw new Error(`state ${res.status}`)
    metrics.polls.ok++
    return res.json()
  }).catch((err) => { metrics.polls.fail++; note(err); return null })
}

// --- virtual player ---------------------------------------------------------
const RUN_ID = Date.now().toString(36)

async function join(i) {
  return timed(metrics.joins, async () => {
    const res = await fetch(`${URL_BASE}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: `Load${i}`,
        lastName: `Test${RUN_ID}`,
        // Unique per run, so re-running does not collide with the previous run
        // via the (session, email) upsert.
        email: `loadtest-${RUN_ID}-${i}@example.invalid`,
        phone: '',
        consent: true,
      }),
    })
    const body = await res.json()
    if (!res.ok || !body.playerId) throw new Error(`join ${res.status}: ${body.error ?? ''}`)
    metrics.joins.ok++
    return body.playerId
  }).catch((err) => { metrics.joins.fail++; note(err); return null })
}

async function answer(playerId, questionIndex) {
  const choice = 'ABCD'[Math.floor(Math.random() * 4)]
  return timed(metrics.answers, async () => {
    const res = await fetch(`${URL_BASE}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, questionIndex, choice }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.accepted) { metrics.answers.ok++; return }
    if (body.code === 'DUPLICATE') { metrics.answers.duplicate++; return }
    if (body.code === 'TOO_LATE') { metrics.answers.tooLate++; return }
    if (body.code === 'STALE_QUESTION') { metrics.answers.stale++; return }
    metrics.answers.fail++
    note(`answer ${res.status}: ${body.error ?? 'unknown'}`)
  }).catch((err) => { metrics.answers.fail++; note(err) })
}

/** Run `tasks` with bounded concurrency so we exercise the service, not the laptop. */
async function pooled(tasks, limit = 120) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) await tasks[cursor++]()
  })
  await Promise.all(workers)
}

// --- run --------------------------------------------------------------------
async function main() {
  console.log(`\nLoad test → ${URL_BASE}`)
  console.log(`Players ${PLAYERS} · questions ${QUESTIONS} · ${BURST ? 'BURST (worst case)' : 'realistic spread'}`)
  console.log(TOKEN ? 'Driving the game with the host token.' : 'No token — drive the game yourself from /host.')
  console.log('─'.repeat(58))

  if (TOKEN) { await host('create'); await host('lobby') }

  // --- join ---------------------------------------------------------------
  const t0 = performance.now()
  const playerIds = []
  await pooled(
    Array.from({ length: PLAYERS }, (_, i) => async () => {
      const id = await join(i)
      if (id) playerIds.push(id)
    })
  )
  console.log(`Joined ${playerIds.length}/${PLAYERS} in ${Math.round(performance.now() - t0)} ms`)

  if (!playerIds.length) {
    console.error('\n✗ No players joined. Is the session open and GAME_CODE correct?\n')
    process.exit(1)
  }

  // --- play ---------------------------------------------------------------
  const played = new Set()

  for (let q = 0; q < QUESTIONS; q++) {
    if (TOKEN) await host(q === 0 ? 'start' : 'next')

    // Without a token the host drives from /host, so wait for a question we
    // have not already played rather than charging ahead and piling up
    // duplicate submissions against the previous one.
    const index = await waitForQuestion(played)
    if (index === null) {
      console.log(`\n  Timed out waiting for the host to advance. Stopping after ${played.size} question(s).`)
      break
    }
    played.add(index)

    // Real delegates do not answer in the same millisecond. Spreading the
    // submissions is what makes the non-burst run representative.
    await pooled(
      playerIds.map((id) => async () => {
        if (!BURST) await sleep(Math.random() * DURATION_MS * 0.8)
        await answer(id, index)
      }),
      BURST ? 400 : 150
    )

    // Poll once per player-batch, as the real clients would.
    await getState()

    if (TOKEN) { await host('lock'); await host('reveal') }
    process.stdout.write(`  Q${index + 1} done — ${metrics.answers.ok} accepted\r`)
  }

  if (TOKEN) { await host('final'); await host('draw', { winnerCount: 5 }) }

  report()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Block until the live question is one we have not played yet.
 * Returns its index, or null if the host never advanced.
 */
async function waitForQuestion(played, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let announced = false

  while (Date.now() < deadline) {
    const state = await getState()
    if (state?.phase === 'question' && !played.has(state.questionIndex)) {
      return state.questionIndex
    }
    if (!announced) {
      process.stdout.write(`  waiting for the host to open the next question…\r`)
      announced = true
    }
    await sleep(700)
  }
  return null
}

function report() {
  const a = metrics.answers
  const expected = metrics.joins.ok * QUESTIONS
  const acceptRate = expected ? (a.ok / expected) * 100 : 0

  console.log(`\n\n${'═'.repeat(58)}\nRESULTS\n${'═'.repeat(58)}`)

  console.log(`\nJoins      ok ${metrics.joins.ok}   failed ${metrics.joins.fail}`)
  console.log(`           p50 ${percentile(metrics.joins.ms, 50)} ms   p95 ${percentile(metrics.joins.ms, 95)} ms`)

  console.log(`\nState polls ok ${metrics.polls.ok}   failed ${metrics.polls.fail}`)
  console.log(`           p50 ${percentile(metrics.polls.ms, 50)} ms   p95 ${percentile(metrics.polls.ms, 95)} ms`)

  console.log(`\nAnswers    accepted ${a.ok}   duplicate ${a.duplicate}   too late ${a.tooLate}   stale ${a.stale}   failed ${a.fail}`)
  console.log(`           p50 ${percentile(a.ms, 50)} ms   p95 ${percentile(a.ms, 95)} ms`)
  console.log(`           acceptance ${acceptRate.toFixed(1)}% of ${expected} possible`)

  if (metrics.errors.size) {
    console.log(`\nErrors:`)
    for (const [msg, count] of [...metrics.errors].sort((x, y) => y[1] - x[1]).slice(0, 8)) {
      console.log(`  ${String(count).padStart(5)} × ${msg}`)
    }
  }

  // --- verdict, against the thresholds in docs/LOAD-TESTING.md ------------
  console.log(`\n${'─'.repeat(58)}`)
  const checks = [
    ['Join success ≥ 99%', (metrics.joins.ok / PLAYERS) * 100 >= 99],
    ['Answer acceptance ≥ 98%', acceptRate >= 98],
    ['Zero hard failures', a.fail === 0 && metrics.polls.fail === 0],
    ['State poll p95 < 1000 ms', percentile(metrics.polls.ms, 95) < 1000],
    [`Answer p95 < ${BURST ? 3000 : 2000} ms`, percentile(a.ms, 95) < (BURST ? 3000 : 2000)],
    ['No duplicate answers accepted', a.duplicate === 0 || a.ok + a.duplicate <= expected],
  ]
  for (const [label, pass] of checks) console.log(`  ${pass ? '✓' : '✗'}  ${label}`)

  const failed = checks.filter(([, pass]) => !pass).length
  console.log(`\n${failed === 0 ? '✓  PASS' : `✗  ${failed} check(s) FAILED`}`)
  console.log(`\nRemember to reset the session before the live event.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => { console.error('\n✗ Harness error:', err); process.exit(1) })
