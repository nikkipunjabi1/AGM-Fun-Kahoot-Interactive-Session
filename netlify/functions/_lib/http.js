// Shared HTTP helpers. Every function returns through here so that caching and
// error shapes stay consistent across the API.

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

export function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers },
  })
}

/**
 * The response shape that makes 1,000 concurrent players affordable.
 *
 * `Netlify-CDN-Cache-Control` governs the edge; `Cache-Control` governs the
 * browser. We let the edge hold the payload for a second and serve stale for
 * four more while it revalidates, but tell the browser never to reuse it — so
 * each poll still reaches the edge and picks up phase changes promptly.
 */
export function cachedJson(body, seconds = 1) {
  return json(body, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': `public, max-age=${seconds}, stale-while-revalidate=4, durable`,
    },
  })
}

export function noStoreJson(body, status = 200) {
  return json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function error(message, status = 400, extra = {}) {
  return noStoreJson({ ok: false, error: message, ...extra }, status)
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** Trim, collapse whitespace and cap length. Applied to every free-text field. */
export function clean(value, maxLength = 80) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
