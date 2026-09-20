#!/usr/bin/env node
// ===========================================================================
// Mock server — preview the UI without Supabase or Netlify.
//
// Serves dist/ plus a fake /api/state you can drive from the URL, so the
// screen, player and console layouts can be checked in every phase during
// design work or a rehearsal on a laptop with no network.
//
//   npm run build && node scripts/mock-server.js
//   http://localhost:4173/screen?phase=question
//
// Phases: lobby round question locked reveal leaderboard final draw
// ===========================================================================

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const PORT = Number(process.env.PORT) || 4173
const DIST = join(import.meta.dirname, '..', 'dist')

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
}

const NAMES = ['Ahmed K.', 'Priya S.', 'Omar B.', 'Lina M.', 'Raj P.', 'Sara A.',
               'Yusuf H.', 'Mei L.', 'Fatima Z.', 'Daniel O.']

// A realistic 1,000-player score spread, so the rank binary search and the
// leaderboard are exercised with something like real data.
const SCORES = Array.from({ length: 1000 }, (_, i) => Math.max(0, 28000 - i * 27 - (i % 13) * 40))
  .sort((a, b) => b - a)

let phase = 'lobby'
let questionIndex = 0
let startedAt = Date.now()
let mockPlayerSeq = 0
const mockAnswered = new Set()

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { return {} }
}

function state() {
  const base = {
    ok: true, exists: true, code: 'AGM2026', phase, questionIndex,
    totalQuestions: 30, serverNow: Date.now(),
    questionStartedAt: startedAt, durationMs: 15000,
    remainingMs: Math.max(0, startedAt + 15000 - Date.now()),
    playerCount: 842,
    rounds: [
      { id: 1, title: 'UAE Mega Projects', subtitle: 'Shaping the skyline, the grid and the rails' },
      { id: 2, title: 'Sustainability Challenge', subtitle: 'Net zero, circular economy and green delivery' },
      { id: 3, title: 'PMI UAE Chapter', subtitle: 'How well do you know your Chapter?' },
    ],
  }

  const question = {
    index: questionIndex, number: questionIndex + 1, total: 30, round: 1,
    roundTitle: 'UAE Mega Projects',
    roundSubtitle: 'Shaping the skyline, the grid and the rails',
    inRound: questionIndex + 1, roundTotal: 10,
    text: 'What is the revised planned capacity of the Mohammed bin Rashid Solar Park by 2030?',
    options: ['3,000 MW', '5,000 MW', 'Over 8,000 MW', '15,000 MW'],
  }

  if (['question', 'locked', 'reveal'].includes(phase)) base.question = question

  if (phase === 'round') {
    base.roundIntro = { round: 2, title: 'Sustainability Challenge',
      subtitle: 'Net zero, circular economy and green delivery', questions: 10 }
  }

  if (phase === 'reveal') {
    base.correctAnswer = 'C'
    base.distribution = {
      responses: 812, correct: 337,
      counts: { A: 121, B: 246, C: 337, D: 108 }, avgElapsedMs: 7400,
    }
  }

  if (['leaderboard', 'final', 'draw'].includes(phase)) {
    base.leaderboard = NAMES.map((name, i) => ({
      rank: i + 1, name, score: SCORES[i], correct: 30 - i,
    }))
    base.scores = SCORES
    base.rankedCount = SCORES.length
  }

  if (phase === 'draw') {
    base.draw = {
      winnerCount: 5, drawUsed: true, seed: 1760176800000, slotsDrawn: 2,
      tiedGroup: [
        { name: 'Lina M.', score: 26800, totalMs: 214000 },
        { name: 'Raj P.', score: 26800, totalMs: 214000 },
        { name: 'Sara A.', score: 26800, totalMs: 214000 },
        { name: 'Yusuf H.', score: 26800, totalMs: 214000 },
      ],
      winners: NAMES.slice(0, 5).map((name, i) => ({
        position: i + 1, playerId: `mock-${i}`, name,
        fullName: `${name.replace(/ .$/, '')} Al Mansoori`,
        email: `player${i}@example.com`,
        score: SCORES[i], correct: 30 - i, totalMs: 210000 + i * 900,
      })),
    }
  }

  return base
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.searchParams.has('phase')) {
    const next = url.searchParams.get('phase')
    if (next !== phase) { phase = next; startedAt = Date.now() }
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify(state()))
  }

  // Minimal join/answer so scripts/loadtest.js can be smoke-tested against
  // the mock before it is ever pointed at the real deploy. Duplicate answers
  // are rejected here too, so the harness's duplicate detection is exercised.
  if (url.pathname === '/api/join' && req.method === 'POST') {
    const id = `mock-${(mockPlayerSeq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, playerId: id, firstName: 'Mock', sessionCode: 'MOCK' }))
  }

  if (url.pathname === '/api/answer' && req.method === 'POST') {
    const body = await readBody(req)
    const key = `${body.playerId}:${body.questionIndex}`
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (mockAnswered.has(key)) {
      return res.end(JSON.stringify({ ok: false, error: 'Already answered', code: 'DUPLICATE' }))
    }
    mockAnswered.add(key)
    return res.end(JSON.stringify({
      ok: true, accepted: true, isCorrect: body.choice === 'C',
      points: body.choice === 'C' ? 800 : 0, elapsedMs: 4000,
      totalScore: 800, correctCount: 1, answered: 1,
    }))
  }

  // Everything else privileged is stubbed out — this server is layout only.
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, mock: true }))
  }

  const routes = { '/': 'index.html', '/host': 'host.html', '/screen': 'screen.html', '/admin': 'admin.html' }
  const rel = routes[url.pathname] ?? url.pathname.slice(1)
  // Contain path traversal — this still only ever runs locally.
  const file = join(DIST, normalize(rel).replace(/^(\.\.[/\\])+/, ''))

  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found. Run `npm run build` first.')
  }
}).listen(PORT, () => {
  console.log(`Mock server  →  http://localhost:${PORT}`)
  console.log('Phases: lobby round question locked reveal leaderboard final draw')
  console.log(`e.g.  http://localhost:${PORT}/screen?phase=reveal`)
})
