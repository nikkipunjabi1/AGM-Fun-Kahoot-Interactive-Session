// POST /api/answer   { playerId, questionIndex, choice }
//
// The write path — the only genuinely uncacheable load in the system, and the
// one that has to be exactly right. ~1,000 of these arrive inside each
// 15-second window.
//
// Integrity rules, all enforced server-side:
//   · elapsed time comes from OUR receipt clock, never from the client
//   · correctness is decided here; the client only says which letter it chose
//   · the question index must match the one actually live
//   · answers are refused once the answer has been revealed
//   · UNIQUE(session, player, question) makes double-tap and replay identical
//     to the database, and rejects both

import { db, getSession, DURATION_MS, GRACE_MS } from './_lib/supabase.js'
import { correctAnswerFor, TOTAL_QUESTIONS } from './_lib/questions.js'
import { pointsFor } from './_lib/scoring.js'
import { noStoreJson, error, readJson } from './_lib/http.js'

const VALID_CHOICES = new Set(['A', 'B', 'C', 'D'])
// Phases during which a submission can still legitimately be in flight.
const ACCEPTING = new Set(['question', 'locked'])

export default async (request) => {
  if (request.method !== 'POST') return error('Method not allowed', 405)

  // Stamp arrival immediately — before any awaited work — so database latency
  // is never charged to the delegate's reaction time.
  const receivedAt = Date.now()

  const body = await readJson(request)
  if (!body) return error('Invalid request body')

  const { playerId, questionIndex, choice } = body

  if (typeof playerId !== 'string' || playerId.length < 10) return error('Unknown player', 401)
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= TOTAL_QUESTIONS) {
    return error('Invalid question', 422)
  }
  if (!VALID_CHOICES.has(choice)) return error('Invalid choice', 422)

  try {
    const session = await getSession()
    if (!session) return error('No active session', 409)

    // Must be answering the question that is actually live.
    if (session.question_index !== questionIndex) {
      return noStoreJson({ ok: false, error: 'That question has moved on', code: 'STALE_QUESTION' }, 409)
    }
    if (!ACCEPTING.has(session.phase)) {
      return noStoreJson({ ok: false, error: 'Answers are closed', code: 'CLOSED' }, 409)
    }
    if (!session.question_started_at) {
      return noStoreJson({ ok: false, error: 'Question has not started', code: 'NOT_STARTED' }, 409)
    }

    const durationMs = session.settings?.durationMs ?? DURATION_MS()
    const startedAt = new Date(session.question_started_at).getTime()
    const rawElapsed = receivedAt - startedAt

    // Grace covers a submission sent in time that crawled over a congested
    // venue network. Beyond that it is genuinely late.
    if (rawElapsed > durationMs + GRACE_MS()) {
      return noStoreJson({ ok: false, error: 'Too late', code: 'TOO_LATE' }, 409)
    }

    // Clamp into the scoring window: a within-grace answer scores as if it
    // landed exactly on the buzzer, never better.
    const elapsedMs = Math.min(Math.max(rawElapsed, 0), durationMs)

    const correct = correctAnswerFor(questionIndex)
    const isCorrect = choice === correct
    const points = pointsFor({ isCorrect, elapsedMs, durationMs })

    const { error: insertError } = await db().from('answers').insert({
      session_id: session.id,
      player_id: playerId,
      question_index: questionIndex,
      choice,
      is_correct: isCorrect,
      elapsed_ms: elapsedMs,
      points,
    })

    if (insertError) {
      // 23505 = unique_violation. Already answered — the first one stands.
      if (insertError.code === '23505') {
        return noStoreJson({ ok: false, error: 'Already answered', code: 'DUPLICATE' }, 409)
      }
      // 23503 = foreign_key_violation. The player row is gone (session reset).
      if (insertError.code === '23503') {
        return noStoreJson({ ok: false, error: 'Please re-join', code: 'REJOIN' }, 401)
      }
      throw insertError
    }

    // Running total from this player's own rows — one indexed lookup, and it
    // lets the phone show a score without a leaderboard query.
    const { data: totals } = await db()
      .from('answers')
      .select('points, is_correct')
      .eq('session_id', session.id)
      .eq('player_id', playerId)

    const totalScore = (totals ?? []).reduce((sum, r) => sum + r.points, 0)
    const correctCount = (totals ?? []).filter((r) => r.is_correct).length

    return noStoreJson({
      ok: true,
      accepted: true,
      // Correctness is returned only now — after the delegate has committed.
      isCorrect,
      points,
      elapsedMs,
      totalScore,
      correctCount,
      answered: (totals ?? []).length,
    })
  } catch (err) {
    console.error('[answer]', err)
    return error('Could not record your answer. Please try again.', 500)
  }
}

export const config = { path: '/api/answer' }
