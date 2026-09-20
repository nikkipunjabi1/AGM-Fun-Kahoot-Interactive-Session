// GET /api/admin   Authorization: Bearer <HOST_TOKEN>
//
// Live operational telemetry for the tech operator: is the room joining, are
// answers landing, is any question misbehaving. Deliberately separate from
// /api/state so that nothing privileged can ever end up in the CDN-cached
// document every delegate downloads.

import { db, getSession } from './_lib/supabase.js'
import { QUESTIONS, TOTAL_QUESTIONS, publicQuestion, correctAnswerFor } from './_lib/questions.js'
import { rankedPlayers } from './_lib/game.js'
import { displayName } from './_lib/scoring.js'
import { isHost } from './_lib/auth.js'
import { noStoreJson, error } from './_lib/http.js'

export default async (request) => {
  if (request.method !== 'GET') return error('Method not allowed', 405)
  if (!isHost(request)) return error('Not authorised', 401)

  try {
    const session = await getSession()
    if (!session) return noStoreJson({ ok: true, exists: false })

    const [{ count: playerCount }, { count: answerCount }, statsResult, ranked] = await Promise.all([
      db().from('players').select('id', { count: 'exact', head: true }).eq('session_id', session.id),
      db().from('answers').select('id', { count: 'exact', head: true }).eq('session_id', session.id),
      db().from('question_stats').select('*').eq('session_id', session.id).order('question_index'),
      rankedPlayers(session.id),
    ])

    const statsByIndex = new Map((statsResult.data ?? []).map((r) => [r.question_index, r]))

    const questions = Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
      const s = statsByIndex.get(i)
      const meta = publicQuestion(i)
      const responses = s?.responses ?? 0
      return {
        index: i,
        number: i + 1,
        round: meta.round,
        text: meta.text,
        correctAnswer: correctAnswerFor(i),
        responses,
        correct: s?.correct ?? 0,
        correctPct: responses ? Math.round(((s.correct ?? 0) / responses) * 100) : null,
        counts: { A: s?.choice_a ?? 0, B: s?.choice_b ?? 0, C: s?.choice_c ?? 0, D: s?.choice_d ?? 0 },
        avgElapsedMs: s?.avg_elapsed_ms ?? null,
        // Participation against the number of people who ever joined — the
        // number that actually tells you whether the venue network is holding.
        participationPct: playerCount ? Math.round((responses / playerCount) * 100) : null,
      }
    })

    const answered = ranked.filter((p) => p.answered_count > 0)
    const totalScore = answered.reduce((s, p) => s + p.score, 0)
    const asked = session.question_index >= 0 ? session.question_index + 1 : 0

    return noStoreJson({
      ok: true,
      exists: true,
      session: {
        code: session.code, status: session.status, phase: session.phase,
        questionIndex: session.question_index, createdAt: session.created_at,
        settings: session.settings,
      },
      totals: {
        players: playerCount ?? 0,
        activePlayers: answered.length,
        answers: answerCount ?? 0,
        questionsAsked: asked,
        // The headline health metric: of every answer that could have been
        // given so far, how many actually arrived.
        expectedAnswers: (playerCount ?? 0) * asked,
        captureRate:
          playerCount && asked
            ? Math.round(((answerCount ?? 0) / (playerCount * asked)) * 100)
            : null,
        averageScore: answered.length ? Math.round(totalScore / answered.length) : 0,
        totalQuestions: TOTAL_QUESTIONS,
      },
      questions,
      // Deeper than the on-screen top 10, for the organiser's own view.
      leaderboard: ranked.slice(0, 25).map((p, i) => ({
        rank: i + 1, name: displayName(p), score: p.score,
        correct: p.correct_count, answered: p.answered_count, totalMs: p.total_ms,
      })),
      draw: session.settings?.draw ?? null,
      roundSummary: [1, 2, 3].map((round) => {
        const idx = QUESTIONS.map((q, i) => (q.round === round ? i : -1)).filter((i) => i >= 0)
        const rows = idx.map((i) => statsByIndex.get(i)).filter(Boolean)
        const responses = rows.reduce((s, r) => s + r.responses, 0)
        const correct = rows.reduce((s, r) => s + r.correct, 0)
        return {
          round, questions: idx.length, responses,
          correctPct: responses ? Math.round((correct / responses) * 100) : null,
        }
      }),
    })
  } catch (err) {
    console.error('[admin]', err)
    return error('Could not load stats', 500)
  }
}

export const config = { path: '/api/admin' }
