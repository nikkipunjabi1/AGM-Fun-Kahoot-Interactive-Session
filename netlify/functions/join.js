// POST /api/join   { firstName, lastName, email, phone?, consent }
//
// Registers a delegate. Re-joining with the same email returns the SAME player
// row, so a refresh, a dropped connection or a switch from Wi-Fi to mobile
// data resumes the existing game instead of splitting one person's score
// across two identities.

import { db, getSession } from './_lib/supabase.js'
import { noStoreJson, error, readJson, clean } from './_lib/http.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// UAE numbers, with or without the +. Kept permissive — this field is optional
// and rejecting a delegate's valid number at the join screen costs more than
// it saves.
const PHONE_RE = /^\+?971[0-9]{8,9}$|^0?5[0-9]{8}$/

export default async (request) => {
  if (request.method !== 'POST') return error('Method not allowed', 405)

  const body = await readJson(request)
  if (!body) return error('Invalid request body')

  const firstName = clean(body.firstName, 40)
  const lastName = clean(body.lastName, 40)
  const email = clean(body.email, 120).toLowerCase()
  const rawPhone = clean(body.phone, 20).replace(/[\s()-]/g, '')
  const consent = body.consent === true

  if (!firstName) return error('Please enter your first name', 422, { field: 'firstName' })
  if (!lastName) return error('Please enter your last name', 422, { field: 'lastName' })
  if (!EMAIL_RE.test(email)) return error('Please enter a valid email address', 422, { field: 'email' })
  if (rawPhone && !PHONE_RE.test(rawPhone)) {
    return error('Enter a UAE number, e.g. +971 50 123 4567', 422, { field: 'phone' })
  }
  if (!consent) return error('Please tick the consent box to join', 422, { field: 'consent' })

  try {
    const session = await getSession()
    if (!session) return error('The quiz has not been opened yet. Please wait for the host.', 409)
    if (session.status === 'closed') return error('This quiz session has closed.', 409)

    const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : `+971${rawPhone.replace(/^0?/, '').replace(/^971/, '')}`) : null

    // Upsert on (session_id, email): idempotent re-join.
    const { data, error: dbError } = await db()
      .from('players')
      .upsert(
        {
          session_id: session.id,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          consent,
          user_agent: clean(request.headers.get('user-agent') || '', 300),
        },
        { onConflict: 'session_id,email', ignoreDuplicates: false }
      )
      .select('id, first_name, last_name')
      .single()

    if (dbError) throw dbError

    return noStoreJson({
      ok: true,
      playerId: data.id,
      firstName: data.first_name,
      sessionCode: session.code,
    })
  } catch (err) {
    console.error('[join]', err)
    return error('Could not join right now. Please try again.', 500)
  }
}

export const config = { path: '/api/join' }
