// ===========================================================================
// Big screen — the projector surface.
//
// Read-only: it drives nothing, it only reflects the polled state. That means
// it can be reloaded at any point, including mid-question, without affecting
// the game or losing anything. If the AV laptop crashes, reopening the URL
// puts the room straight back where it was.
// ===========================================================================

import { pollState } from './lib/api.js'
import { sync, remaining, remainingSeconds } from './lib/clock.js'
import { renderQr } from './lib/qr.js'
import { burst } from './lib/confetti.js'

const $ = (id) => document.getElementById(id)
const scenes = ['lobby', 'round', 'question', 'board', 'draw']
const LETTERS = ['A', 'B', 'C', 'D']
const RING_CIRCUMFERENCE = 326.7

let currentScene = ''
let lastPhaseKey = ''
// Which question index the tiles currently show. Tracked separately from the
// phase so that reloading the screen mid-reveal still paints the question —
// the runbook tells AV to reload the screen to recover, so it must work.
let paintedQuestion = -1
let timerHandle = null
let stopConfetti = null
let spinHandle = null

// --- join URL + QR ----------------------------------------------------------
// Built from the current origin, so the same deploy works on a Netlify
// subdomain, a custom domain or localhost with no configuration.
const joinUrl = `${location.origin}/`
$('join-url').textContent = joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
try {
  renderQr($('qr'), joinUrl, { cellSize: 9, margin: 2 })
} catch (err) {
  console.error('[qr]', err)
  $('qr').innerHTML = '<p style="color:#14093A;padding:1rem;font-weight:700">QR unavailable — read the URL aloud</p>'
}

function show(name) {
  if (currentScene === name) return
  currentScene = name
  for (const s of scenes) {
    const el = $(`scene-${s}`)
    if (el) el.dataset.active = String(s === name)
  }
}

// ===========================================================================
// Timer
// ===========================================================================
function startTimer(startedAt, durationMs) {
  stopTimer()
  const fill = $('ring-fill')
  const num = $('ring-num')
  const ring = $('ring')

  const tick = () => {
    const left = remaining(startedAt, durationMs)
    num.textContent = String(Math.max(0, remainingSeconds(startedAt, durationMs)))
    fill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - left / durationMs))
    ring.dataset.urgent = String(left <= 5000 && left > 0)
    if (left <= 0) stopTimer()
  }
  tick()
  timerHandle = setInterval(tick, 100)
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null }
}

// ===========================================================================
// Rendering
// ===========================================================================
function renderQuestion(state) {
  const q = state.question
  if (!q) return

  $('s-round').textContent = `Round ${q.round} — ${q.roundTitle}`
  $('s-count').textContent = `${q.number} / ${q.total}`
  $('s-text').textContent = q.text
  $('progress').textContent = `Question ${q.number} of ${q.total}`

  q.options.forEach((opt, i) => { $(`s-opt-${LETTERS[i]}`).textContent = opt })
  paintedQuestion = q.index

  // Clear any reveal styling left over from the previous question.
  const tiles = $('s-tiles')
  tiles.dataset.reveal = 'false'
  for (const tile of tiles.querySelectorAll('.s-tile')) {
    delete tile.dataset.correct
    tile.querySelector('.s-tile-bar i').style.width = '0'
    tile.querySelector('.s-tile-count')?.remove()
  }
}

function renderReveal(state) {
  const tiles = $('s-tiles')
  tiles.dataset.reveal = 'true'

  const counts = state.distribution?.counts ?? { A: 0, B: 0, C: 0, D: 0 }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1

  for (const tile of tiles.querySelectorAll('.s-tile')) {
    const choice = tile.dataset.choice
    tile.dataset.correct = String(choice === state.correctAnswer)

    const pct = Math.round((counts[choice] / total) * 100)
    tile.querySelector('.s-tile-bar i').style.width = `${pct}%`

    // Show how the room actually voted — the moment that reliably gets a
    // reaction when a popular answer turns out to be wrong.
    let label = tile.querySelector('.s-tile-count')
    if (!label) {
      label = document.createElement('span')
      label.className = 's-tile-count'
      tile.append(label)
    }
    label.textContent = `${pct}%`
  }

  const d = state.distribution
  const correctPct = d?.responses ? Math.round((d.correct / d.responses) * 100) : 0
  $('answered-line').innerHTML =
    `<strong>${(d?.responses ?? 0).toLocaleString()}</strong> answered · <strong>${correctPct}%</strong> correct`
}

function renderBoard(state) {
  const isFinal = state.phase === 'final'
  $('board-title').textContent = isFinal ? 'Final leaderboard' : 'Leaderboard'
  $('progress').textContent = isFinal ? 'Final standings' : 'Standings'

  const board = $('board')
  board.innerHTML = ''
  for (const [i, row] of (state.leaderboard ?? []).entries()) {
    const li = document.createElement('li')
    li.style.animationDelay = `${i * 70}ms`

    const pos = document.createElement('span')
    pos.className = 'pos'
    pos.textContent = String(row.rank)

    const name = document.createElement('span')
    name.textContent = row.name

    const score = document.createElement('span')
    score.className = 'score'
    score.textContent = row.score.toLocaleString()

    li.append(pos, name, score)
    board.append(li)
  }

  $('board-foot').textContent = state.rankedCount
    ? `${state.rankedCount.toLocaleString()} players scoring`
    : ''

  if (isFinal) {
    stopConfetti?.()
    stopConfetti = burst($('confetti'), { count: 200, duration: 6000 })
  }
}

function renderRoundIntro(state) {
  const r = state.roundIntro
  if (!r) return
  $('round-kicker').textContent = `Round ${r.round} of ${state.rounds?.length ?? 3}`
  $('round-title').textContent = r.title
  $('round-sub').textContent = `${r.subtitle} · ${r.questions} questions`
  $('progress').textContent = `Round ${r.round}`
}

// --- the draw ---------------------------------------------------------------
// If places were genuinely tied, the tied names cycle on screen before the
// result lands. The winners were already decided server-side and stored, so
// the animation is theatre over a settled, auditable result — it can never
// produce a different outcome, and a reload replays the same winners.
function renderDraw(state) {
  const draw = state.draw
  const winnersEl = $('winners')

  if (!draw?.winners?.length) {
    winnersEl.innerHTML = ''
    $('draw-foot').textContent = 'Preparing the draw…'
    return
  }

  const reveal = () => {
    $('spinner').hidden = true
    winnersEl.innerHTML = ''
    draw.winners.forEach((w, i) => {
      const li = document.createElement('li')
      li.style.animationDelay = `${i * 420}ms`
      const pos = document.createElement('span')
      pos.className = 'pos'
      pos.textContent = String(w.position)
      const name = document.createElement('span')
      name.textContent = w.name
      const score = document.createElement('span')
      score.className = 'score'
      score.style.opacity = '.75'
      score.style.fontSize = '.6em'
      score.textContent = w.score.toLocaleString()
      li.append(pos, name, score)
      winnersEl.append(li)
    })

    $('draw-foot').textContent = draw.drawUsed
      ? `Places ${draw.winners.length - draw.slotsDrawn + 1}–${draw.winners.length} were tied on score and time, and drawn at random. Seed ${draw.seed}.`
      : 'Decided on score, then on cumulative answer speed.'

    stopConfetti?.()
    stopConfetti = burst($('confetti'), { count: 240, duration: 7000 })
  }

  if (draw.drawUsed && draw.tiedGroup?.length > 1) {
    const names = draw.tiedGroup.map((p) => p.name)
    $('spinner').hidden = false
    $('spinner').querySelector('.spinner-label').textContent =
      `Drawing ${draw.slotsDrawn} tied place${draw.slotsDrawn === 1 ? '' : 's'} from ${names.length}`

    let i = 0
    let delay = 70
    const cycle = () => {
      $('spinner-name').textContent = names[i++ % names.length]
      delay *= 1.12                       // decelerate, like a real wheel
      if (delay < 420) spinHandle = setTimeout(cycle, delay)
      else reveal()
    }
    clearTimeout(spinHandle)
    cycle()
  } else {
    reveal()
  }
}

// ===========================================================================
// State machine
// ===========================================================================
function onState(state) {
  sync(state.serverNow)
  $('screen-error').hidden = true

  const phaseKey = `${state.phase}:${state.questionIndex}`
  const phaseChanged = phaseKey !== lastPhaseKey
  lastPhaseKey = phaseKey

  if (state.phase !== 'draw') { clearTimeout(spinHandle); $('spinner').hidden = true }
  if (state.phase !== 'final' && state.phase !== 'draw') { stopConfetti?.(); stopConfetti = null }

  switch (state.phase) {
    case 'lobby':
      stopTimer()
      $('joined-count').textContent = (state.playerCount ?? 0).toLocaleString()
      $('progress').textContent = 'Waiting to start'
      show('lobby')
      break

    case 'round':
      stopTimer()
      if (phaseChanged) renderRoundIntro(state)
      show('round')
      break

    case 'question':
      if (paintedQuestion !== state.questionIndex) renderQuestion(state)
      $('answered-line').innerHTML = `<strong>${(state.playerCount ?? 0).toLocaleString()}</strong> in the room`
      show('question')
      startTimer(state.questionStartedAt, state.durationMs)
      break

    case 'locked':
      stopTimer()
      if (paintedQuestion !== state.questionIndex) renderQuestion(state)
      $('ring-num').textContent = '0'
      $('ring-fill').style.strokeDashoffset = String(RING_CIRCUMFERENCE)
      show('question')
      break

    case 'reveal':
      stopTimer()
      // Paint the question first if we arrived here cold (a reload), then the
      // reveal styling on top of it.
      if (paintedQuestion !== state.questionIndex) renderQuestion(state)
      if (phaseChanged || $('s-tiles').dataset.reveal !== 'true') renderReveal(state)
      show('question')
      break

    case 'leaderboard':
    case 'final':
      stopTimer()
      if (phaseChanged) renderBoard(state)
      show('board')
      break

    case 'draw':
      stopTimer()
      if (phaseChanged) renderDraw(state)
      show('draw')
      break

    default:
      show('lobby')
  }
}

pollState(onState, {
  interval: 1000,
  onError: (_err, failures) => {
    if (failures >= 3) {
      const el = $('screen-error')
      el.hidden = false
      el.textContent = 'Reconnecting to the quiz service…'
    }
  },
})
