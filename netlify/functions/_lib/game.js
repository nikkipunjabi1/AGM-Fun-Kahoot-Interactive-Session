// ===========================================================================
// Builds the single state document every surface reads.
//
// This payload is IDENTICAL for all ~1,000 delegates, which is precisely what
// makes it cacheable at the CDN edge. Nothing player-specific goes in here —
// each phone derives its own rank locally from the `scores` array.
// ===========================================================================

import { db, DURATION_MS } from './supabase.js'
import { publicQuestion, correctAnswerFor, TOTAL_QUESTIONS, ROUNDS, isRoundOpener } from './questions.js'
import { rankPlayers, displayName } from './scoring.js'

const LEADERBOARD_SIZE = 10

/** Phases in which delegates may still be looking at the question itself. */
const QUESTION_PHASES = new Set(['question', 'locked', 'reveal'])
/** Phases that need the full ranking loaded. */
const SCORE_PHASES = new Set(['leaderboard', 'final', 'draw'])

export async function buildState(session) {
  const now = Date.now()

  if (!session) {
    return {
      ok: true,
      exists: false,
      phase: 'lobby',
      serverNow: now,
      totalQuestions: TOTAL_QUESTIONS,
      rounds: ROUNDS,
      playerCount: 0,
    }
  }

  const durationMs = session.settings?.durationMs ?? DURATION_MS()
  const startedAt = session.question_started_at ? new Date(session.question_started_at).getTime() : null

  const state = {
    ok: true,
    exists: true,
    code: session.code,
    phase: session.phase,
    questionIndex: session.question_index,
    totalQuestions: TOTAL_QUESTIONS,
    rounds: ROUNDS,
    serverNow: now,
    questionStartedAt: startedAt,
    durationMs,
    // Remaining time is sent as a convenience, but each client recomputes it
    // from serverNow + questionStartedAt so a slow response cannot skew it.
    remainingMs: startedAt ? Math.max(0, startedAt + durationMs - now) : 0,
    isRoundOpener: session.question_index >= 0 ? isRoundOpener(session.question_index) : false,
  }

  // --- player count (cheap: a HEAD count, no rows transferred) -------------
  const { count } = await db()
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
  state.playerCount = count ?? 0

  // --- round intro ---------------------------------------------------------
  // Deliberately carries the round title only, never the question text — the
  // intro card goes up before the question is revealed.
  if (session.phase === 'round' && session.question_index >= 0) {
    const meta = publicQuestion(session.question_index)
    state.roundIntro = meta
      ? { round: meta.round, title: meta.roundTitle, subtitle: meta.roundSubtitle, questions: meta.roundTotal }
      : null
  }

  // --- the question itself -------------------------------------------------
  if (QUESTION_PHASES.has(session.phase) && session.question_index >= 0) {
    state.question = publicQuestion(session.question_index)
  }

  // --- reveal: correct answer + how the room voted --------------------------
  if (session.phase === 'reveal' && session.question_index >= 0) {
    state.correctAnswer = correctAnswerFor(session.question_index)
    state.distribution = await answerDistribution(session.id, session.question_index)
  }

  // --- leaderboard / final / draw ------------------------------------------
  if (SCORE_PHASES.has(session.phase)) {
    const ranked = await rankedPlayers(session.id)

    state.leaderboard = ranked.slice(0, LEADERBOARD_SIZE).map((p, i) => ({
      rank: i + 1,
      name: displayName(p),
      score: p.score,
      correct: p.correct_count,
    }))

    // Sorted descending. ~1,000 integers ≈ 2 KB gzipped — and it lets every
    // phone binary-search its own rank without a personalised request.
    state.scores = ranked.map((p) => p.score)
    state.rankedCount = ranked.length
  }

  // --- draw results (written by host-action, replayed here) -----------------
  if (session.phase === 'draw' && session.settings?.draw) {
    state.draw = session.settings.draw
  }

  return state
}

async function answerDistribution(sessionId, questionIndex) {
  const { data, error } = await db()
    .from('question_stats')
    .select('responses, correct, choice_a, choice_b, choice_c, choice_d, avg_elapsed_ms')
    .eq('session_id', sessionId)
    .eq('question_index', questionIndex)
    .maybeSingle()

  if (error || !data) {
    return { responses: 0, correct: 0, counts: { A: 0, B: 0, C: 0, D: 0 }, avgElapsedMs: 0 }
  }

  return {
    responses: data.responses,
    correct: data.correct,
    counts: { A: data.choice_a, B: data.choice_b, C: data.choice_c, D: data.choice_d },
    avgElapsedMs: data.avg_elapsed_ms,
  }
}

/** Full ranking for a session. Used by the leaderboard and the prize draw. */
export async function rankedPlayers(sessionId) {
  const { data, error } = await db()
    .from('player_scores')
    .select('player_id, first_name, last_name, email, score, total_ms, correct_count, answered_count, joined_at')
    .eq('session_id', sessionId)
    .order('score', { ascending: false })
    .order('total_ms', { ascending: true })
    .order('joined_at', { ascending: true })
    .limit(5000)

  if (error) throw error
  return rankPlayers(data ?? [])
}
