/**
 * Work out this player's rank from the sorted score array in the cached state
 * payload — locally, on the phone.
 *
 * This is what lets 1,000 delegates each see a personal rank while everybody
 * downloads the exact same cacheable document. A server-side "what rank am I"
 * endpoint would be 1,000 uncacheable queries fired at the same instant.
 *
 * `scores` is sorted descending, so the rank is the count of strictly higher
 * scores plus one. Binary search: ~10 comparisons at 1,000 players.
 */
export function rankFor(scores, myScore) {
  if (!Array.isArray(scores) || scores.length === 0) return null

  let lo = 0
  let hi = scores.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (scores[mid] > myScore) lo = mid + 1
    else hi = mid
  }
  return lo + 1
}

/** "3rd", "21st" — used in the player's result card. */
export function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}
