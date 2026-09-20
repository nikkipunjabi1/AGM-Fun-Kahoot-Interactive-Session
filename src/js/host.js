// ===========================================================================
// Host console — the presenter's control surface.
//
// Every transition is manual. Nothing in the game advances on a timer the
// host cannot override, because a live room needs the presenter to be able to
// wait for laughter, repeat a question, or recover from an AV problem.
//
// The console holds no authoritative state. If this laptop dies, the tech
// operator opens the same URL on theirs and carries on from exactly where the
// room is.
// ===========================================================================

import { postJson, pollState } from './lib/api.js'
import { sync, remaining, remainingSeconds } from './lib/clock.js'

const $ = (id) => document.getElementById(id)
const STORAGE_KEY = 'pmi-agm-2026-host-token'
const TOTAL = 30

let token = ''
let latest = null
let timerHandle = null

// ===========================================================================
// Token gate
// ===========================================================================
$('gate-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const value = $('token').value.trim()
  if (!value) return

  // Validate against a privileged endpoint rather than trusting the input, so
  // a wrong token fails here and not silently on the first real action.
  const res = await fetch('/api/admin', { headers: { Authorization: `Bearer ${value}` } })
  if (res.status === 401) {
    $('gate-error').textContent = 'That token was not accepted.'
    return
  }

  token = value
  try { sessionStorage.setItem(STORAGE_KEY, token) } catch { /* private mode */ }
  unlock()
})

function unlock() {
  $('gate').hidden = true
  $('console').hidden = false
  $('link-screen').href = `/screen`
  buildJumpGrid()
  startPolling()
}

// Restore within the same tab, so an accidental refresh mid-session does not
// make the host retype the token in front of 1,000 people.
try {
  const saved = sessionStorage.getItem(STORAGE_KEY)
  if (saved) { token = saved; unlock() }
} catch { /* ignore */ }

// ===========================================================================
// Actions
// ===========================================================================
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action
  const payload = { action }

  if (action === 'draw') {
    payload.winnerCount = Number($('winner-count').value) || 5
  }

  await send(payload, btn)
})

$('btn-reset').addEventListener('click', async () => {
  const count = latest?.playerCount ?? 0
  const ok = confirm(
    `Delete all ${count} players and every answer in this session?\n\n` +
    `This cannot be undone. Use it after rehearsal, never during the live session.`
  )
  if (!ok) return
  await send({ action: 'reset', confirm: 'RESET' }, $('btn-reset'))
})

async function send(payload, btn) {
  if (btn) btn.disabled = true
  const { ok, body } = await postJson('/api/host-action', payload, { token })
  if (btn) btn.disabled = false

  if (!ok) {
    toast(body?.error || 'Action failed', 'error')
    return null
  }

  if (payload.action === 'draw' && body.draw) renderDrawResult(body.draw)
  if (payload.action === 'reset') toast('Session reset — all players cleared', 'ok')
  if (payload.action === 'create') toast(body.created ? 'Session created' : 'Session already exists', 'ok')

  // Refresh immediately rather than waiting for the next poll, so the console
  // feels instant to the person pressing the button.
  refresh()
  return body
}

function toast(message, kind = '') {
  const el = $('toast')
  el.textContent = message
  el.dataset.kind = kind
  el.hidden = false
  clearTimeout(toast._t)
  toast._t = setTimeout(() => { el.hidden = true }, 3200)
}

// ===========================================================================
// Jump grid
// ===========================================================================
function buildJumpGrid() {
  const grid = $('jump')
  grid.innerHTML = ''
  for (let i = 0; i < TOTAL; i++) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = String(i + 1)
    b.dataset.index = String(i)
    // 0, 10, 20 open rounds 1, 2 and 3.
    if (i % 10 === 0) b.dataset.roundStart = 'true'
    b.addEventListener('click', () => send({ action: 'goto', questionIndex: i }, b))
    grid.append(b)
  }
}

function paintJumpGrid(state) {
  const buttons = $('jump').children
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].dataset.current = String(i === state.questionIndex)
    buttons[i].dataset.done = String(i < state.questionIndex)
  }
}

// ===========================================================================
// Rendering
// ===========================================================================
const PHASE_LABEL = {
  lobby: 'Lobby', round: 'Round intro', question: 'Question live',
  locked: 'Locked', reveal: 'Revealing', leaderboard: 'Leaderboard',
  final: 'Final', draw: 'Draw',
}

function render(state) {
  latest = state

  $('tag-phase').textContent = PHASE_LABEL[state.phase] ?? state.phase
  $('tag-phase').className = `tag ${state.phase === 'question' ? 'tag-live' : ''}`
  $('tag-code').textContent = state.code ?? 'no session'
  $('tag-players').textContent = `${(state.playerCount ?? 0).toLocaleString()} players`

  $('stat-players').textContent = (state.playerCount ?? 0).toLocaleString()
  $('stat-question').textContent =
    state.questionIndex >= 0 ? `${state.questionIndex + 1} / ${state.totalQuestions ?? TOTAL}` : '—'

  paintJumpGrid(state)

  // Answer count is only meaningful once the room has voted.
  $('stat-answered').textContent = state.distribution
    ? state.distribution.responses.toLocaleString()
    : '—'

  // --- headline ----------------------------------------------------------
  if (!state.exists) {
    $('now-title').textContent = 'No session'
    $('now-sub').textContent = 'Press "Create session" to begin.'
  } else if (state.phase === 'lobby') {
    $('now-title').textContent = 'Lobby — delegates joining'
    $('now-sub').textContent = 'The big screen is showing the QR code. Press "Start quiz" when the room is in.'
  } else if (state.phase === 'round') {
    $('now-title').textContent = `Round ${state.roundIntro?.round}: ${state.roundIntro?.title ?? ''}`
    $('now-sub').textContent = 'Round intro card is up. Press "Next question" to start the round.'
  } else if (state.question) {
    $('now-title').textContent = state.question.text
    $('now-sub').textContent =
      `Round ${state.question.round} · Question ${state.question.number} of ${state.question.total}`
  } else if (state.phase === 'leaderboard' || state.phase === 'final') {
    $('now-title').textContent = state.phase === 'final' ? 'Final leaderboard' : 'Leaderboard'
    $('now-sub').textContent = state.leaderboard?.length
      ? `Leading: ${state.leaderboard[0].name} on ${state.leaderboard[0].score.toLocaleString()}`
      : 'No scores yet.'
  } else if (state.phase === 'draw') {
    $('now-title').textContent = 'Goodie draw'
    $('now-sub').textContent = 'Winners are on the big screen.'
  }

  // --- timer -------------------------------------------------------------
  if (state.phase === 'question' && state.questionStartedAt) {
    $('now-timer').hidden = false
    startTimer(state.questionStartedAt, state.durationMs)
  } else {
    $('now-timer').hidden = true
    stopTimer()
  }

  // --- the answer, for the host's eyes only ------------------------------
  if (state.phase === 'reveal' && state.correctAnswer) {
    $('now-answer').hidden = false
    const idx = 'ABCD'.indexOf(state.correctAnswer)
    const optionText = state.question?.options?.[idx] ?? ''
    $('now-answer-value').textContent = `${state.correctAnswer} — ${optionText}`
  } else {
    $('now-answer').hidden = true
  }

  if (state.phase === 'draw' && state.draw) renderDrawResult(state.draw)

  // --- contextual button labelling ---------------------------------------
  const next = $('btn-next')
  if (state.phase === 'round') next.textContent = 'Start this round →'
  else if (state.questionIndex >= (state.totalQuestions ?? TOTAL) - 1) next.textContent = 'Finish → final leaderboard'
  else next.textContent = 'Next question →'
}

function renderDrawResult(draw) {
  const el = $('draw-result')
  el.hidden = false
  el.innerHTML = ''

  for (const w of draw.winners) {
    const row = document.createElement('div')
    row.className = 'w'
    const pos = document.createElement('b')
    pos.textContent = `${w.position}.`
    const name = document.createElement('span')
    // The console is the host's private device — full name and email here is
    // what lets them actually find the winner in the room.
    name.textContent = `${w.fullName} — ${w.score.toLocaleString()} pts`
    const em = document.createElement('span')
    em.className = 'em'
    em.textContent = w.email
    row.append(pos, name, em)
    el.append(row)
  }

  const note = document.createElement('p')
  note.className = 'seed'
  note.textContent = draw.drawUsed
    ? `${draw.slotsDrawn} tied place(s) drawn at random from ${draw.tiedGroup.length} tied players. Seed ${draw.seed} — recorded for audit.`
    : 'No tie at the cut-off. Decided on score, then cumulative speed.'
  el.append(note)
}

// ===========================================================================
// Timer
// ===========================================================================
function startTimer(startedAt, durationMs) {
  stopTimer()
  const fill = $('now-timer-fill')
  const num = $('now-timer-num')
  const tick = () => {
    const left = remaining(startedAt, durationMs)
    num.textContent = String(Math.max(0, remainingSeconds(startedAt, durationMs)))
    fill.style.width = `${(left / durationMs) * 100}%`
    if (left <= 0) stopTimer()
  }
  tick()
  timerHandle = setInterval(tick, 200)
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null }
}

// ===========================================================================
// Polling
// ===========================================================================
let stopPolling = null

function startPolling() {
  stopPolling?.()
  stopPolling = pollState(
    (state) => { sync(state.serverNow); render(state) },
    { interval: 1000, onError: () => toast('Lost connection — retrying', 'error') }
  )
}

// Fetch immediately after an action, so the console never lags the host.
async function refresh() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' })
    const state = await res.json()
    sync(state.serverNow)
    render(state)
  } catch { /* the poll will catch up */ }
}

// Keyboard shortcuts — the host is looking at the room, not the screen.
document.addEventListener('keydown', (event) => {
  if ($('console').hidden) return
  if (event.target.matches('input, textarea')) return

  const map = {
    ' ': 'next', ArrowRight: 'next',
    l: 'lock', r: 'reveal', b: 'leaderboard',
  }
  const action = map[event.key]
  if (!action) return
  event.preventDefault()
  send({ action })
})
