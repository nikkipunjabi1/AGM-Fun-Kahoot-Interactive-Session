// ===========================================================================
// Player surface.
//
// The whole client is a state machine driven by the polled /api/state
// document. It holds no authoritative state of its own: score, correctness
// and rank all originate on the server, so a delegate who reloads, switches
// from Wi-Fi to mobile data, or locks their phone for ten minutes rejoins
// exactly where the room is.
// ===========================================================================

import { postJson, pollState } from './lib/api.js'
import { sync, remaining, remainingSeconds } from './lib/clock.js'
import { rankFor, ordinal } from './lib/rank.js'

const STORAGE_KEY = 'pmi-agm-2026-player'

const $ = (id) => document.getElementById(id)
const views = ['join', 'waiting', 'question', 'locked', 'result', 'standing', 'draw']

// --- local player record ----------------------------------------------------
// Persisted so a refresh does not cost a delegate their identity mid-game.
let me = loadPlayer()
let currentView = 'join'
let answeredIndex = -1      // question index this phone has already answered
let lastChoice = null
let lastResult = null       // { isCorrect, points, totalScore, correctCount }
let myScore = 0
let myCorrect = 0
let timerHandle = null
let lastPhaseKey = ''

function loadPlayer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function savePlayer(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* private mode */ }
}

// --- view switching ---------------------------------------------------------
function show(name) {
  if (currentView === name) return
  currentView = name
  for (const v of views) {
    const el = $(`view-${v}`)
    if (el) el.dataset.active = String(v === name)
  }
}

function setConnection(state, label) {
  const el = $('connection')
  el.dataset.state = state
  el.querySelector('.label').textContent = label
}

// ===========================================================================
// Join
// ===========================================================================
const form = $('join-form')

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  clearErrors()

  const payload = {
    firstName: $('firstName').value.trim(),
    lastName: $('lastName').value.trim(),
    email: $('email').value.trim(),
    phone: $('phone').value.trim(),
    consent: $('consent').checked,
  }

  // Validate before the network round trip, so a delegate on weak Wi-Fi is not
  // punished with a five-second wait to be told they missed a field.
  if (!payload.firstName) return fieldError('firstName', 'Please enter your first name')
  if (!payload.lastName) return fieldError('lastName', 'Please enter your last name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
    return fieldError('email', 'Please enter a valid email address')
  }
  if (!payload.consent) {
    $('consent-wrap').dataset.invalid = 'true'
    return fieldError('consent', 'Please tick the box to join')
  }

  const btn = $('join-btn')
  btn.disabled = true
  btn.textContent = 'Joining…'

  const { ok, body } = await postJson('/api/join', payload)

  btn.disabled = false
  btn.textContent = 'Join the quiz'

  if (!ok) {
    if (body?.field) fieldError(body.field, body.error)
    else $('join-error').textContent = body?.error || 'Could not join. Please try again.'
    return
  }

  me = { playerId: body.playerId, firstName: body.firstName }
  savePlayer(me)
  $('waiting-name').textContent = `You're in, ${body.firstName}!`
  show('waiting')
})

function fieldError(field, message) {
  const el = $(`err-${field}`)
  if (el) el.textContent = message
  const input = $(field)
  if (input) { input.setAttribute('aria-invalid', 'true'); input.focus() }
}

function clearErrors() {
  for (const f of ['firstName', 'lastName', 'email', 'phone', 'consent']) {
    const e = $(`err-${f}`); if (e) e.textContent = ''
    const i = $(f); if (i) i.removeAttribute('aria-invalid')
  }
  $('consent-wrap').dataset.invalid = 'false'
  $('join-error').textContent = ''
}

// ===========================================================================
// Answering
// ===========================================================================
$('tiles').addEventListener('click', async (event) => {
  const tile = event.target.closest('.tile')
  if (!tile || !me) return

  const state = latestState
  if (!state || state.phase !== 'question') return
  if (answeredIndex === state.questionIndex) return

  const choice = tile.dataset.choice

  // Optimistic: lock the UI on tap. A delegate should never be able to answer
  // twice because the network was slow, and the tile must respond instantly.
  answeredIndex = state.questionIndex
  lastChoice = choice
  markSelected(choice)

  const { ok, body } = await postJson('/api/answer', {
    playerId: me.playerId,
    questionIndex: state.questionIndex,
    choice,
  })

  if (ok && body.accepted) {
    lastResult = body
    myScore = body.totalScore
    myCorrect = body.correctCount
    updateFooterScore()
    return
  }

  // Server said no. Distinguish the cases that need the delegate to act.
  if (body?.code === 'REJOIN') {
    localStorage.removeItem(STORAGE_KEY)
    me = null
    show('join')
    $('join-error').textContent = 'Please join again.'
    return
  }
  if (body?.code === 'DUPLICATE') return          // already counted; nothing to do
  if (body?.code === 'TOO_LATE' || body?.code === 'CLOSED') {
    lastResult = { isCorrect: false, points: 0, totalScore: myScore, correctCount: myCorrect, tooLate: true }
    return
  }
  // Genuine failure — let them try again.
  answeredIndex = -1
  lastChoice = null
  clearSelected()
})

function markSelected(choice) {
  const tiles = $('tiles')
  $('locked-choice').textContent = choice
  tiles.dataset.answered = 'true'
  for (const t of tiles.querySelectorAll('.tile')) {
    t.dataset.selected = String(t.dataset.choice === choice)
    t.disabled = true
  }
}

function clearSelected() {
  const tiles = $('tiles')
  tiles.dataset.answered = 'false'
  for (const t of tiles.querySelectorAll('.tile')) {
    delete t.dataset.selected
    t.disabled = false
  }
}

function updateFooterScore() {
  const el = $('footer-score')
  el.hidden = false
  el.querySelector('strong').textContent = myScore.toLocaleString()
}

// ===========================================================================
// Timer — driven locally against the server-corrected clock, so it stays
// smooth between the ~1s state polls instead of ticking in jumps.
// ===========================================================================
function startTimer(startedAt, durationMs) {
  stopTimer()
  const fill = $('timer-fill')
  const num = $('timer-num')
  const wrap = $('timer')
  const CIRCUMFERENCE = 119.4

  const tick = () => {
    const left = remaining(startedAt, durationMs)
    const secs = remainingSeconds(startedAt, durationMs)
    num.textContent = String(Math.max(0, secs))
    fill.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - left / durationMs))
    wrap.dataset.urgent = String(left <= 5000 && left > 0)
    if (left <= 0) stopTimer()
  }

  tick()
  timerHandle = setInterval(tick, 100)
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null }
}

// ===========================================================================
// State machine
// ===========================================================================
let latestState = null

function onState(state) {
  latestState = state
  sync(state.serverNow)
  setConnection('ok', 'Connected')

  if (state.degraded) setConnection('warn', 'Reconnecting')

  // Not joined yet → stay on the form regardless of what the room is doing.
  if (!me) { show('join'); return }

  $('waiting-count').textContent = (state.playerCount ?? 0).toLocaleString()

  // A key that changes whenever the room moves on, so per-phase setup runs once.
  const phaseKey = `${state.phase}:${state.questionIndex}`
  const phaseChanged = phaseKey !== lastPhaseKey
  lastPhaseKey = phaseKey

  switch (state.phase) {
    case 'lobby':
      stopTimer()
      show('waiting')
      $('waiting-copy').textContent = 'Keep this page open. The first question will appear here.'
      break

    case 'round':
      stopTimer()
      show('waiting')
      $('waiting-copy').textContent = state.roundIntro
        ? `Round ${state.roundIntro.round}: ${state.roundIntro.title}. Get ready…`
        : 'Next round starting…'
      break

    case 'question': {
      // New question → reset this phone's answer state.
      if (phaseChanged) {
        if (answeredIndex !== state.questionIndex) { clearSelected(); lastResult = null }
        renderQuestion(state)
      }
      if (answeredIndex === state.questionIndex) { show('locked'); stopTimer() }
      else { show('question'); startTimer(state.questionStartedAt, state.durationMs) }
      break
    }

    case 'locked':
      stopTimer()
      show('locked')
      if (answeredIndex === state.questionIndex) {
        $('locked-copy').textContent = 'Eyes on the main screen.'
        $('locked-choice').textContent = lastChoice ?? '—'
      } else {
        $('locked-copy').textContent = 'Time ran out on that one.'
        $('locked-choice').textContent = '—'
      }
      break

    case 'reveal':
      stopTimer()
      renderResult(state)
      show('result')
      break

    case 'leaderboard':
    case 'final':
      stopTimer()
      renderStanding(state)
      show('standing')
      break

    case 'draw':
      stopTimer()
      renderDraw(state)
      show('draw')
      break

    default:
      show('waiting')
  }
}

function renderQuestion(state) {
  const q = state.question
  if (!q) return
  $('q-round').textContent = `Round ${q.round} — ${q.roundTitle}`
  $('q-count').textContent = `Question ${q.number} of ${q.total}`
  $('q-text').textContent = q.text
  const letters = ['A', 'B', 'C', 'D']
  q.options.forEach((opt, i) => { $(`opt-${letters[i]}`).textContent = opt })
}

function renderResult(state) {
  const card = $('result-card')
  const answered = answeredIndex === state.questionIndex

  if (!answered) {
    card.dataset.correct = 'false'
    $('result-icon').textContent = '—'
    $('result-title').textContent = 'No answer'
    $('result-points').textContent = '+0'
    $('result-sub').textContent = `The answer was ${state.correctAnswer}.`
  } else {
    const isCorrect = lastResult ? lastResult.isCorrect : lastChoice === state.correctAnswer
    card.dataset.correct = String(isCorrect)
    $('result-icon').textContent = isCorrect ? '✓' : '✕'
    $('result-title').textContent = isCorrect ? 'Correct!' : 'Not this time'
    $('result-points').textContent = `+${(lastResult?.points ?? 0).toLocaleString()}`
    $('result-sub').textContent = isCorrect
      ? speedNote(lastResult?.points ?? 0)
      : `The answer was ${state.correctAnswer}.`
  }

  $('result-score').textContent = myScore.toLocaleString()
  $('result-correct').textContent = String(myCorrect)
}

function speedNote(points) {
  if (points >= 950) return 'Lightning fast.'
  if (points >= 800) return 'Quick thinking.'
  if (points >= 650) return 'Nicely done.'
  return 'Got there in the end.'
}

function renderStanding(state) {
  const isFinal = state.phase === 'final'
  $('standing-eyebrow').textContent = isFinal ? 'Final result' : 'Leaderboard'

  // Rank computed here on the phone, from the shared cached score array.
  const rank = rankFor(state.scores, myScore)
  $('standing-rank').textContent = rank ? ordinal(rank) : '—'
  $('standing-total').textContent = (state.rankedCount ?? state.playerCount ?? 0).toLocaleString()
  $('standing-score').textContent = myScore.toLocaleString()
  $('standing-correct').textContent = String(myCorrect)

  if (isFinal) {
    $('standing-note').textContent = rank && rank <= 5
      ? 'Stay where you are — you are in the running for a goodie!'
      : 'Thanks for playing. Watch the screen for the winners.'
  } else {
    $('standing-note').textContent = 'Look up — the top 10 are on the big screen.'
  }
}

function renderDraw(state) {
  const draw = state.draw
  const list = $('draw-list')
  if (!draw?.winners?.length) {
    list.innerHTML = ''
    $('draw-note').textContent = 'Drawing now — watch the main screen.'
    return
  }

  $('draw-title').textContent = `${draw.winners.length} goodie winners`
  list.innerHTML = ''
  draw.winners.forEach((w, i) => {
    const li = document.createElement('li')
    li.style.animationDelay = `${i * 90}ms`
    if (me && w.playerId === me.playerId) li.dataset.me = 'true'
    const pos = document.createElement('span')
    pos.className = 'pos'
    pos.textContent = String(w.position)
    const name = document.createElement('span')
    name.textContent = (me && w.playerId === me.playerId) ? `${w.name} — that's you!` : w.name
    li.append(pos, name)
    list.append(li)
  })

  $('draw-note').textContent = draw.drawUsed
    ? 'Tied places were drawn at random, live.'
    : 'Decided on score, then on speed.'
}

// ===========================================================================
// Boot
// ===========================================================================
if (me) {
  $('waiting-name').textContent = `You're in, ${me.firstName}!`
  show('waiting')
}

pollState(onState, {
  interval: 1000,
  onError: (_err, failures) => {
    if (failures >= 3) setConnection('down', 'Offline — retrying')
    else setConnection('warn', 'Reconnecting')
  },
})
