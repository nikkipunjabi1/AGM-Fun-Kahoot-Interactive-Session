// ===========================================================================
// Scoring and winner selection.
//
// Every number here is computed on the server. The client reports which option
// it chose and nothing else — not how fast it answered, not whether it was
// right. Elapsed time comes from the server's own receipt timestamp, so a
// modified client cannot claim a faster answer than it gave.
// ===========================================================================

export const MAX_POINTS = 1000
export const BASE_POINTS = 500     // guaranteed for a correct answer
export const SPEED_POINTS = 500    // the part that decays with time

/**
 * Kahoot-style speed weighting:
 *   instant correct answer  → 1000
 *   correct on the buzzer   →  500
 *   wrong or unanswered     →    0
 *
 * The floor of 500 matters: without it, a delegate who deliberates for 14
 * seconds and gets it right scores almost nothing, and the game stops
 * rewarding knowledge at all.
 */
export function pointsFor({ isCorrect, elapsedMs, durationMs }) {
  if (!isCorrect) return 0
  const clamped = Math.min(Math.max(elapsedMs, 0), durationMs)
  const remaining = 1 - clamped / durationMs
  return Math.round(BASE_POINTS + SPEED_POINTS * remaining)
}

/**
 * Rank players for the leaderboard and the prize draw.
 *
 * Order: score desc → cumulative answer time asc → join time asc.
 * The view already sorts this way; re-sorting here keeps the function correct
 * regardless of what the caller passes in.
 */
export function rankPlayers(rows) {
  return [...rows].sort((a, b) =>
    b.score - a.score ||
    a.total_ms - b.total_ms ||
    new Date(a.joined_at) - new Date(b.joined_at)
  )
}

/** Public display name — first name plus last initial. Never a full name on a 1,000-seat screen. */
export function displayName(player) {
  const last = (player.last_name || '').trim()
  return `${(player.first_name || '').trim()}${last ? ` ${last[0].toUpperCase()}.` : ''}`.trim()
}

// --- Deterministic RNG -----------------------------------------------------
// A seeded generator so a draw can be replayed and audited afterwards. The
// seed is stored alongside the result in sessions.settings.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items, rand) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Select the goodie winners.
 *
 * The Chapter's rule: top N by score, tie-broken by cumulative answer time.
 * A random draw is used ONLY where players are genuinely tied — identical
 * score AND identical total time — and that tied group straddles the cut-off.
 *
 * Worked example with winnerCount = 5:
 *   ranks 1–3 are clear                       → seated outright
 *   ranks 4–9 all share one score and time    → 6 people for 2 remaining slots
 *                                             → those 6 go into the spinner
 *
 * Returns the winners plus `tiedGroup`, which is what the screen animates. An
 * empty `tiedGroup` means no draw was needed and the screen reveals directly.
 */
export function selectWinners(rows, winnerCount, seed = Date.now()) {
  const ranked = rankPlayers(rows).filter((p) => p.answered_count > 0)

  if (ranked.length <= winnerCount) {
    return { winners: ranked, tiedGroup: [], drawUsed: false, seed, cutoffRank: ranked.length }
  }

  const key = (p) => `${p.score}::${p.total_ms}`
  const boundaryKey = key(ranked[winnerCount - 1])

  // Everyone sharing the boundary's exact score and time. They are contiguous
  // in the ranking, because the sort key is exactly what defines the group.
  const tied = ranked.filter((p) => key(p) === boundaryKey)
  // Those inside the top N who are strictly ahead of the tied group.
  const outright = ranked.slice(0, winnerCount).filter((p) => key(p) !== boundaryKey)

  // No genuine tie at the cut-off — the top N stand on merit alone.
  if (tied.length === 1) {
    return {
      winners: ranked.slice(0, winnerCount),
      tiedGroup: [], drawUsed: false, seed, cutoffRank: winnerCount,
    }
  }

  const slotsLeft = winnerCount - outright.length
  const drawn = shuffle(tied, mulberry32(seed)).slice(0, slotsLeft)

  return {
    winners: [...outright, ...drawn],
    tiedGroup: tied,          // animated on the big screen
    drawnFromTie: drawn,
    slotsDrawn: slotsLeft,
    drawUsed: true,
    seed,
    cutoffRank: winnerCount,
  }
}
