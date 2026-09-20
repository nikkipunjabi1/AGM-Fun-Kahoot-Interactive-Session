#!/usr/bin/env node
// ===========================================================================
// Secret scan.   npm run check:secrets
//
// Exists because a real HOST_TOKEN once reached this PUBLIC repository by
// being typed into .env.example instead of .env. This makes that failure
// loud and automatic instead of something a human has to notice.
//
// Runs in CI on every push and pull request.
// ===========================================================================

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const problems = []

// --- 1. .env.example must be a template, not a filled-in config ------------
// Only these may carry a value: they are non-sensitive defaults.
const ALLOWED_WITH_VALUES = new Set([
  'GAME_CODE', 'QUESTION_DURATION_SECONDS', 'WINNER_COUNT', 'LATE_ANSWER_GRACE_MS',
])

if (existsSync('.env.example')) {
  for (const [n, raw] of readFileSync('.env.example', 'utf8').split('\n').entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, value] = match
    if (value && !ALLOWED_WITH_VALUES.has(key)) {
      problems.push(
        `.env.example:${n + 1} — ${key} has a value. This file is committed to a PUBLIC ` +
        `repo and must stay blank. Put real values in .env (gitignored) or in Netlify.`
      )
    }
  }
}

// --- 2. Credential shapes anywhere in tracked files -----------------------
const PATTERNS = [
  [/\bsb_secret_[A-Za-z0-9_-]{8,}/, 'Supabase secret key'],
  [/\bsb_publishable_[A-Za-z0-9_-]{8,}/, 'Supabase publishable key'],
  [/\beyJhbGciOi[A-Za-z0-9_-]{20,}/, 'JWT (possible legacy service_role key)'],
  [/\bghp_[A-Za-z0-9]{30,}/, 'GitHub personal access token'],
  [/\bnfp_[A-Za-z0-9]{30,}/, 'Netlify personal access token'],
]

// Files that legitimately DISCUSS these shapes (docs, this scanner itself).
const EXEMPT = new Set(['scripts/check-secrets.js', 'docs/DEPLOYMENT.md', '.env.example'])

let tracked = []
try {
  tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
} catch {
  console.log('Not a git repository — skipping tracked-file scan.')
}

for (const file of tracked) {
  if (EXEMPT.has(file)) continue
  if (/\.(png|jpe?g|svg|ico|eps|woff2?|mp4|zip)$/i.test(file)) continue
  let content
  try { content = readFileSync(file, 'utf8') } catch { continue }
  for (const [pattern, label] of PATTERNS) {
    if (pattern.test(content)) problems.push(`${file} — looks like a ${label}`)
  }
}

// --- 3. A real .env must never be tracked ---------------------------------
if (tracked.includes('.env')) {
  problems.push('.env is tracked by git. It must be gitignored — it holds real credentials.')
}

// --- report ----------------------------------------------------------------
console.log(`\nSecret scan\n${'─'.repeat(46)}`)
if (problems.length) {
  console.log(`✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}\n`)
  problems.forEach((p) => console.log(`   · ${p}`))
  console.log(`\nIf a credential already reached the remote, ROTATE IT. Removing the file`)
  console.log(`does not help — it stays in git history.\n`)
  process.exit(1)
}
console.log(`✓  No committed credentials found.\n`)
