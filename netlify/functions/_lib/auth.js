// Host and admin authentication.
//
// One shared secret gates every privileged surface. For a single 30-minute
// event with two operators, a full auth system would add failure modes without
// adding safety — but the comparison below is still constant-time so the token
// cannot be recovered by timing the endpoint.

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Accepts the token from an Authorization header, an X-Host-Token header or ?token=. */
export function extractToken(request) {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()

  const header = request.headers.get('x-host-token')
  if (header) return header.trim()

  try {
    return new URL(request.url).searchParams.get('token')?.trim() || ''
  } catch {
    return ''
  }
}

export function isHost(request) {
  const expected = process.env.HOST_TOKEN
  // Fail closed: an unset HOST_TOKEN locks the host console rather than
  // opening it to everyone.
  if (!expected) return false
  return constantTimeEqual(extractToken(request), expected)
}
