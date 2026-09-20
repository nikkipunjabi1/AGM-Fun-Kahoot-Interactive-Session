// ===========================================================================
// Admin dashboard — the tech operator's view.
//
// Its job during the session is one number: the capture rate. If submissions
// are not landing, that is where it shows up first, minutes before anyone on
// stage would notice.
//
// Polls more slowly than the player surface: this is one operator, not 1,000
// delegates, and the queries behind it are heavier.
// ===========================================================================

import { getJson } from './lib/api.js'

const $ = (id) => document.getElementById(id)
const STORAGE_KEY = 'pmi-agm-2026-host-token'

let token = ''
let pollHandle = null

// ===========================================================================
// Gate
// ===========================================================================
$('gate-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const value = $('token').value.trim()
  if (!value) return

  const { status } = await getJson('/api/admin', { token: value })
  if (status === 401) {
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
  load()
  pollHandle = setInterval(load, 4000)
}

try {
  const saved = sessionStorage.getItem(STORAGE_KEY)
  if (saved) { token = saved; unlock() }
} catch { /* ignore */ }

// ===========================================================================
// Exports
// ===========================================================================
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-export]')
  if (!btn) return

  const type = btn.dataset.export
  btn.disabled = true
  const original = btn.textContent
  btn.textContent = 'Preparing…'

  try {
    // Fetched rather than linked so the token travels in a header, never in a
    // URL that could end up in browser history or a server log.
    const res = await fetch(`/api/export?type=${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`export failed (${res.status})`)

    const blob = await res.blob()
    const name = res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1]
      ?? `pmi-agm-2026-${type}.csv`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast(`Downloaded ${name}`, 'ok')
  } catch (err) {
    console.error(err)
    toast('Export failed — check the connection and try again', 'error')
  } finally {
    btn.disabled = false
    btn.textContent = original
  }
})

// ===========================================================================
// Data
// ===========================================================================
async function load() {
  const { ok, body } = await getJson('/api/admin', { token })
  if (!ok || !body.ok) return
  if (!body.exists) {
    $('tag-phase').textContent = 'No session'
    return
  }
  render(body)
}

function render(d) {
  $('tag-phase').textContent = d.session.phase
  $('tag-code').textContent = d.session.code

  const t = d.totals
  $('k-players').textContent = t.players.toLocaleString()
  $('k-active').textContent = t.activePlayers.toLocaleString()
  $('k-answers').textContent = t.answers.toLocaleString()
  $('k-asked').textContent = `${t.questionsAsked} / ${t.totalQuestions}`
  $('k-avg').textContent = t.averageScore.toLocaleString()

  // Capture rate is the health signal that matters: of every answer that
  // could have been given, how many actually reached the database.
  const capture = t.captureRate
  $('k-capture').textContent = capture === null ? '—' : `${capture}%`
  const kpi = $('kpi-capture')
  kpi.dataset.health = capture === null ? '' : capture >= 70 ? 'good' : capture >= 45 ? 'warn' : 'bad'

  $('capture-note').textContent = capture === null
    ? 'Capture rate appears once the first question has been asked.'
    : `${t.answers.toLocaleString()} of a possible ${t.expectedAnswers.toLocaleString()} submissions recorded. ` +
      (capture >= 70
        ? 'Healthy — the room is engaged and the network is coping.'
        : capture >= 45
          ? 'Lower than ideal. Some delegates may not have joined, or the venue network is struggling.'
          : 'Low. Check the venue network and consider telling delegates to switch to mobile data.')

  // --- rounds ------------------------------------------------------------
  $('rounds').innerHTML = ''
  for (const r of d.roundSummary) {
    const tr = document.createElement('tr')
    tr.append(
      cell(`Round ${r.round}`),
      cell(r.questions, 'num'),
      cell(r.responses.toLocaleString(), 'num'),
      cell(r.correctPct === null ? '—' : `${r.correctPct}%`, 'num'),
    )
    $('rounds').append(tr)
  }

  // --- questions ---------------------------------------------------------
  $('questions').innerHTML = ''
  for (const q of d.questions) {
    const tr = document.createElement('tr')
    if (q.correctPct !== null && q.correctPct < 40) tr.dataset.hard = 'true'
    tr.append(
      cell(q.number, 'num'),
      cell(q.round),
      cell(q.text, 'q'),
      cell(q.correctAnswer),
      cell(q.responses.toLocaleString(), 'num'),
      cell(q.correct.toLocaleString(), 'num'),
      barCell(q.correctPct),
      cell(q.avgElapsedMs === null ? '—' : `${(q.avgElapsedMs / 1000).toFixed(1)}s`, 'num'),
      cell(q.participationPct === null ? '—' : `${q.participationPct}%`, 'num'),
    )
    $('questions').append(tr)
  }

  // --- leaderboard -------------------------------------------------------
  $('leaderboard').innerHTML = ''
  for (const p of d.leaderboard) {
    const tr = document.createElement('tr')
    tr.append(
      cell(p.rank, 'num'),
      cell(p.name),
      cell(p.score.toLocaleString(), 'num'),
      cell(p.correct, 'num'),
      cell(p.answered, 'num'),
      cell(`${(p.totalMs / 1000).toFixed(1)}s`, 'num'),
    )
    $('leaderboard').append(tr)
  }

  // --- winners -----------------------------------------------------------
  if (d.draw?.winners?.length) {
    $('panel-draw').hidden = false
    const el = $('draw-result')
    el.innerHTML = ''
    for (const w of d.draw.winners) {
      const row = document.createElement('div')
      row.className = 'w'
      const pos = document.createElement('b')
      pos.textContent = `${w.position}.`
      const name = document.createElement('span')
      name.textContent = `${w.fullName} — ${w.score.toLocaleString()} pts`
      const em = document.createElement('span')
      em.className = 'em'
      em.textContent = w.email
      row.append(pos, name, em)
      el.append(row)
    }
    const note = document.createElement('p')
    note.className = 'seed'
    note.textContent = d.draw.drawUsed
      ? `${d.draw.slotsDrawn} tied place(s) drawn from ${d.draw.tiedGroup.length}. Seed ${d.draw.seed}.`
      : 'No tie at the cut-off.'
    el.append(note)
  }
}

function cell(value, className = '') {
  const td = document.createElement('td')
  if (className) td.className = className
  td.textContent = String(value)
  return td
}

function barCell(pct) {
  const td = document.createElement('td')
  if (pct === null) { td.textContent = '—'; return td }
  const track = document.createElement('span')
  track.className = 'bar-track'
  const bar = document.createElement('span')
  bar.className = 'bar'
  bar.style.width = `${pct}%`
  track.append(bar)
  const label = document.createElement('span')
  label.textContent = `${pct}%`
  td.append(track, label)
  return td
}

function toast(message, kind = '') {
  const el = $('toast')
  el.textContent = message
  el.dataset.kind = kind
  el.hidden = false
  clearTimeout(toast._t)
  toast._t = setTimeout(() => { el.hidden = true }, 3200)
}

window.addEventListener('beforeunload', () => clearInterval(pollHandle))
