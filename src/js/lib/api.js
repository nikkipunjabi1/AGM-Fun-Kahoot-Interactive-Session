// Thin fetch wrapper shared by all four surfaces.

export async function getJson(path, { token } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, { headers, credentials: 'omit' })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

export async function postJson(path, payload, { token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'omit',
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, body }
}

/**
 * How long to wait before the next state poll, given what we just learned.
 *
 * This is the main defence against 1,000 phones generating 1,000 requests a
 * second. Measured on the live deploy, CDN edge collapse was only ~1.6x — far
 * below what a "1 second TTL" naively implies — so the client must not lean on
 * caching alone to keep origin load sane.
 *
 * The key insight: during a live question the phone already knows everything
 * it needs. It has the question text and the exact end time, and it counts
 * down locally against the server-corrected clock. It does not need to poll
 * through the countdown at all — only to be awake near the transition.
 */
export function nextDelay(state, { serverNow = Date.now() } = {}) {
  if (!state?.phase) return 2000

  if (state.phase === 'question' && state.questionStartedAt && state.durationMs) {
    const remaining = state.questionStartedAt + state.durationMs - serverNow
    // Plenty of time left: sleep until ~3s before the timer expires, so we are
    // awake and polling fast when the host locks. Capped so a client that
    // joins mid-question is never asleep for long.
    if (remaining > 4000) return Math.min(remaining - 3000, 8000)
    // Transition imminent — poll briskly so "time's up" lands promptly.
    return 1200
  }

  // The host controls these transitions, so we cannot predict them; poll often
  // enough to feel responsive without being wasteful.
  if (state.phase === 'locked') return 1200
  if (state.phase === 'draw') return 2000
  return 2500
}

/**
 * Poll /api/state, with three deliberate behaviours:
 *
 *  · Adaptive interval (see nextDelay) — the single biggest reduction in
 *    origin load, and the reason this design survives 1,000 concurrent phones.
 *
 *  · Jitter. Without it, 1,000 phones that loaded the page together would poll
 *    in lockstep forever, turning steady load into spikes. ±12% of noise
 *    spreads them out.
 *
 *  · Backoff on failure. If the network wobbles, clients slow down instead of
 *    hammering a struggling origin — then snap back on recovery.
 *
 * `interval` forces a fixed cadence instead, for the big screen and host
 * console: those are two operator devices, so their load is irrelevant and
 * responsiveness matters more.
 */
export function pollState(onState, { interval = null, onError } = {}) {
  let stopped = false
  let failures = 0
  let timer

  async function tick() {
    if (stopped) return
    let state = null
    try {
      const res = await fetch('/api/state', { credentials: 'omit' })
      if (!res.ok) throw new Error(`state ${res.status}`)
      state = await res.json()
      failures = 0
      onState(state)
    } catch (err) {
      failures++
      onError?.(err, failures)
    }
    if (stopped) return

    const base = interval ?? nextDelay(state, { serverNow: state?.serverNow ?? Date.now() })
    const backoff = Math.min(failures, 4) * 1500
    const jitter = base * (Math.random() - 0.5) * 0.24
    timer = setTimeout(tick, Math.max(600, base + backoff + jitter))
  }

  tick()

  // A backgrounded tab is throttled by the browser; when the delegate looks
  // back at their phone we want the current question immediately, not on the
  // next scheduled tick.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !stopped) {
      clearTimeout(timer)
      tick()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
