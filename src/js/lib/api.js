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
 * Poll /api/state on an interval, with two deliberate behaviours:
 *
 *  · Jitter. Without it, 1,000 phones that loaded the page together would
 *    poll in lockstep forever, turning a smooth ~1,000 req/s into spikes.
 *    ±250 ms of noise spreads them out.
 *
 *  · Backoff on failure. If the network wobbles, clients slow down instead of
 *    hammering a struggling origin — then snap back to normal on recovery.
 */
export function pollState(onState, { interval = 1000, onError } = {}) {
  let stopped = false
  let failures = 0
  let timer

  async function tick() {
    if (stopped) return
    try {
      const res = await fetch('/api/state', { credentials: 'omit' })
      if (!res.ok) throw new Error(`state ${res.status}`)
      const state = await res.json()
      failures = 0
      onState(state)
    } catch (err) {
      failures++
      onError?.(err, failures)
    }
    if (stopped) return
    const backoff = Math.min(failures, 4) * 1000
    const jitter = (Math.random() - 0.5) * 500
    timer = setTimeout(tick, interval + backoff + jitter)
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
