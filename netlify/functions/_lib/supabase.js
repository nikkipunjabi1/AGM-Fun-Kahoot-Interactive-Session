import { createClient } from '@supabase/supabase-js'

// A single client per function instance. supabase-js talks to PostgREST over
// HTTP rather than holding a Postgres connection, so however many function
// instances Netlify spins up under load, there is no connection pool to
// exhaust. That property is what makes the ~130 writes/sec answer burst safe.
let client

export function db() {
  if (client) return client

  const url = process.env.SUPABASE_URL

  // Supabase replaced the legacy `service_role` JWT with opaque "Secret keys"
  // (sb_secret_...). Both work identically here — supabase-js passes either
  // through as the apikey and bearer token, and both map to the service_role
  // database role, which is what bypasses RLS. Accept either variable name so
  // the project works whichever key the dashboard offered.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY ' +
      '(the "Secret key" from Settings → API Keys, starting sb_secret_) in ' +
      'Netlify → Site configuration → Environment variables.'
    )
  }

  // Guard against the most damaging misconfiguration: pasting the publishable
  // key, which cannot bypass RLS. Every table denies anon outright, so the app
  // would fail confusingly at request time instead of clearly at startup.
  if (key.startsWith('sb_publishable_')) {
    throw new Error(
      'A PUBLISHABLE Supabase key was supplied. That key cannot bypass row level ' +
      'security, so every query will be denied. Use the SECRET key (sb_secret_...) ' +
      'from Settings → API Keys.'
    )
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'pmi-uae-agm-2026' } },
  })
  return client
}

export const GAME_CODE = () => process.env.GAME_CODE || 'AGM2026'

export const DURATION_MS = () =>
  Math.max(5, Number(process.env.QUESTION_DURATION_SECONDS) || 15) * 1000

export const WINNER_COUNT = () => {
  const n = Number(process.env.WINNER_COUNT) || 5
  return Math.min(10, Math.max(3, n))   // Chapter agreed a 3–10 range
}

export const GRACE_MS = () => Number(process.env.LATE_ANSWER_GRACE_MS) || 2500

/** Fetch the active session, or null. */
export async function getSession(code = GAME_CODE()) {
  const { data, error } = await db()
    .from('sessions').select('*').eq('code', code).maybeSingle()
  if (error) throw error
  return data
}
