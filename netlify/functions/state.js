// GET /api/state
//
// The hot path. Polled roughly once a second by every delegate, the big screen
// and the host console. Everything about it is tuned for the CDN to answer
// instead of us: identical payload for every caller, no auth, no cookies,
// 1-second edge cache.
//
// At 1,000 players this function itself runs ~1×/second, not ~1,000×/second.

import { getSession } from './_lib/supabase.js'
import { buildState } from './_lib/game.js'
import { cachedJson, error } from './_lib/http.js'

export default async (request) => {
  if (request.method !== 'GET') return error('Method not allowed', 405)

  try {
    const session = await getSession()
    const state = await buildState(session)
    return cachedJson(state, 1)
  } catch (err) {
    console.error('[state]', err)
    // Degrade to a shape the clients can still render rather than a hard 500,
    // so a transient database blip does not blank 1,000 phones mid-session.
    return cachedJson(
      { ok: false, exists: false, phase: 'lobby', serverNow: Date.now(), degraded: true },
      1
    )
  }
}

export const config = { path: '/api/state' }
