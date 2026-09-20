#!/usr/bin/env node
// ===========================================================================
// Measure how well /api/state is actually collapsing at the CDN edge.
//
//   node scripts/measure-cache.js --url https://<site>.netlify.app
//
// Every response carries a distinct `serverNow`, so counting distinct values
// across many concurrent requests tells us exactly how many reached the
// origin. That number is the function-invocation bill for the event.
//
// Run this after every deploy that touches caching. Read-only and safe.
// ===========================================================================

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ') || true] })
)

const URL_BASE = (args.url || 'http://localhost:8888').replace(/\/$/, '')
const ROUNDS = Number(args.rounds) || 8
const CONCURRENCY = Number(args.concurrency) || 12
const GAP_MS = Number(args.gap) || 300

async function probe() {
  const res = await fetch(`${URL_BASE}/api/state`)
  const status = res.headers.get('cache-status') ?? ''
  const body = await res.json().catch(() => ({}))
  return { serverNow: body.serverNow, status, degraded: Boolean(body.degraded) }
}

const results = []
console.log(`\nMeasuring edge collapse → ${URL_BASE}`)
console.log(`${ROUNDS} rounds × ${CONCURRENCY} concurrent, ${GAP_MS}ms apart\n`)

for (let r = 0; r < ROUNDS; r++) {
  const batch = await Promise.all(Array.from({ length: CONCURRENCY }, probe))
  results.push(...batch)
  process.stdout.write(`  round ${r + 1}/${ROUNDS}\r`)
  await new Promise((res) => setTimeout(res, GAP_MS))
}

const total = results.length
const origin = new Set(results.map((r) => r.serverNow)).size
const hits = results.filter((r) => /hit/i.test(r.status)).length
const degraded = results.filter((r) => r.degraded).length

console.log(`\n${'─'.repeat(52)}`)
console.log(`  client requests      ${total}`)
console.log(`  origin fetches       ${origin}`)
console.log(`  edge HITs reported   ${hits}  (${Math.round((hits / total) * 100)}%)`)
console.log(`  collapse ratio       ${(total / origin).toFixed(1)}x`)

if (degraded) {
  console.log(`\n  ⚠ ${degraded}/${total} responses were DEGRADED — Supabase is not reachable.`)
  console.log(`    Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify, then redeploy.`)
}

// Project the event cost from the measured collapse.
const POLLS_PER_DELEGATE = 499        // adaptive schedule, full 30-question session
const PLAYERS = Number(args.players) || 1000
const projected = Math.round((PLAYERS * POLLS_PER_DELEGATE) / (total / origin))

console.log(`\n  Projected for ${PLAYERS} players over the session:`)
console.log(`    ~${projected.toLocaleString()} function invocations`)
console.log(`    Netlify free tier is 125,000/month → ${projected < 125000 ? '✓ within free tier' : '✗ needs Netlify Pro (2M, ~USD 19)'}`)
console.log()
