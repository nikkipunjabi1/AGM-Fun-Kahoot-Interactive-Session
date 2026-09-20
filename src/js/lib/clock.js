// Server clock synchronisation.
//
// A delegate whose phone clock is four minutes fast must still see the same
// countdown as everyone else. Every state response carries `serverNow`; we
// track the offset from our own clock and read time through it.
//
// The offset is smoothed rather than replaced outright, so one slow response
// cannot make the timer jump.

let offset = 0
let sampled = false

export function sync(serverNow) {
  if (typeof serverNow !== 'number') return
  const sample = serverNow - Date.now()
  offset = sampled ? offset * 0.7 + sample * 0.3 : sample
  sampled = true
}

/** Current time in the server's frame of reference. */
export function serverTime() {
  return Date.now() + offset
}

/** Milliseconds left on the live question, floored at zero. */
export function remaining(startedAt, durationMs) {
  if (!startedAt) return 0
  return Math.max(0, startedAt + durationMs - serverTime())
}

/** Whole seconds remaining, for display. */
export function remainingSeconds(startedAt, durationMs) {
  return Math.ceil(remaining(startedAt, durationMs) / 1000)
}
