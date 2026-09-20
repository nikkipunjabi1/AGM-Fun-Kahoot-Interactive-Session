// POST /api/host-action   { action, ...args }     Authorization: Bearer <HOST_TOKEN>
//
// Every state transition in the game funnels through here. Nothing advances on
// a timer the presenter cannot override: if the room needs another twenty
// seconds, the host simply does not press the button.
//
// Because state lives in Postgres rather than a browser, a host whose laptop
// dies mid-session can be replaced by the tech operator opening /host on
// theirs — the game resumes exactly where it was.

import { db, getSession, GAME_CODE, DURATION_MS, WINNER_COUNT } from './_lib/supabase.js'
import { TOTAL_QUESTIONS } from './_lib/questions.js'
import { rankedPlayers } from './_lib/game.js'
import { selectWinners, displayName } from './_lib/scoring.js'
import { isHost } from './_lib/auth.js'
import { noStoreJson, error, readJson } from './_lib/http.js'

export default async (request) => {
  if (request.method !== 'POST') return error('Method not allowed', 405)
  if (!isHost(request)) return error('Not authorised', 401)

  const body = await readJson(request)
  if (!body?.action) return error('Missing action')

  try {
    return await handle(body.action, body)
  } catch (err) {
    console.error('[host-action]', body.action, err)
    return error(err.message || 'Action failed', 500)
  }
}

async function handle(action, body) {
  const code = GAME_CODE()

  // ---- create ------------------------------------------------------------
  // Idempotent. Running it twice does not wipe a session in progress.
  if (action === 'create') {
    const existing = await getSession(code)
    if (existing) return noStoreJson({ ok: true, session: existing, created: false })

    const { data, error: dbError } = await db()
      .from('sessions')
      .insert({
        code,
        status: 'open',
        phase: 'lobby',
        question_index: -1,
        settings: { durationMs: DURATION_MS(), winnerCount: WINNER_COUNT() },
      })
      .select('*')
      .single()
    if (dbError) throw dbError
    return noStoreJson({ ok: true, session: data, created: true })
  }

  const session = await getSession(code)
  if (!session) return error('No session. Create one first.', 409)

  const patch = (fields) => update(session.id, fields)

  switch (action) {
    // ---- move to a question ---------------------------------------------
    // `start`, `next` and `goto` all land here. Setting question_started_at to
    // now() is what starts every delegate's countdown simultaneously.
    case 'start':
    case 'next':
    case 'goto': {
      const target =
        action === 'goto' ? Number(body.questionIndex)
        : action === 'start' ? 0
        // Parked on a round intro? 'next' starts THAT question rather than
        // skipping the first question of the round entirely.
        : session.phase === 'round' ? session.question_index
        : session.question_index + 1

      if (!Number.isInteger(target) || target < 0) return error('Invalid question index', 422)
      if (target >= TOTAL_QUESTIONS) {
        // Past the last question — go straight to the final leaderboard.
        return noStoreJson({ ok: true, session: await patch({ phase: 'final' }) })
      }

      return noStoreJson({
        ok: true,
        session: await patch({
          phase: 'question',
          question_index: target,
          question_started_at: new Date().toISOString(),
        }),
      })
    }

    // ---- round intro card -------------------------------------------------
    // Parks on the first question of a round WITHOUT starting its timer, so
    // the host can introduce the round without eating answering time.
    case 'roundIntro': {
      const target = Number.isInteger(body.questionIndex)
        ? body.questionIndex
        : session.question_index + 1
      if (target < 0 || target >= TOTAL_QUESTIONS) return error('Invalid question index', 422)
      return noStoreJson({
        ok: true,
        session: await patch({ phase: 'round', question_index: target, question_started_at: null }),
      })
    }

    // ---- pens down --------------------------------------------------------
    case 'lock':
      return noStoreJson({ ok: true, session: await patch({ phase: 'locked' }) })

    // ---- show the correct answer -----------------------------------------
    case 'reveal':
      return noStoreJson({ ok: true, session: await patch({ phase: 'reveal' }) })

    case 'leaderboard':
      return noStoreJson({ ok: true, session: await patch({ phase: 'leaderboard' }) })

    case 'final':
      return noStoreJson({ ok: true, session: await patch({ phase: 'final' }) })

    // ---- the goodie draw --------------------------------------------------
    // Winners are computed once, here, and written into settings. The screen
    // then replays that stored result, so re-running the animation or
    // reloading the page can never produce a different set of winners.
    case 'draw': {
      const winnerCount = Math.min(10, Math.max(3, Number(body.winnerCount) || session.settings?.winnerCount || WINNER_COUNT()))
      const ranked = await rankedPlayers(session.id)

      if (ranked.length === 0) return error('No players have answered yet', 409)

      const seed = Number.isInteger(body.seed) ? body.seed : Date.now()
      const result = selectWinners(ranked, winnerCount, seed)

      const draw = {
        winnerCount,
        drawUsed: result.drawUsed,
        seed: result.seed,
        drawnAt: new Date().toISOString(),
        // Stored for audit: if anyone questions the result, the seed plus the
        // tied group reproduces it exactly.
        tiedGroup: (result.tiedGroup || []).map((p) => ({
          name: displayName(p), score: p.score, totalMs: p.total_ms,
        })),
        slotsDrawn: result.slotsDrawn ?? 0,
        winners: result.winners.map((p, i) => ({
          position: i + 1,
          playerId: p.player_id,
          name: displayName(p),
          fullName: `${p.first_name} ${p.last_name}`.trim(),
          email: p.email,
          score: p.score,
          correct: p.correct_count,
          totalMs: p.total_ms,
        })),
      }

      return noStoreJson({
        ok: true,
        draw,
        session: await patch({ phase: 'draw', settings: { ...session.settings, draw } }),
      })
    }

    // ---- back to the lobby, keeping players ------------------------------
    case 'lobby':
      return noStoreJson({
        ok: true,
        session: await patch({ phase: 'lobby', question_index: -1, question_started_at: null }),
      })

    // ---- full reset: wipes players and answers ---------------------------
    // Used after rehearsal so test players never appear on the live board.
    case 'reset': {
      if (body.confirm !== 'RESET') return error('Reset requires confirm: "RESET"', 422)
      await db().from('answers').delete().eq('session_id', session.id)
      await db().from('players').delete().eq('session_id', session.id)
      return noStoreJson({
        ok: true,
        reset: true,
        session: await patch({
          phase: 'lobby',
          question_index: -1,
          question_started_at: null,
          settings: { durationMs: DURATION_MS(), winnerCount: WINNER_COUNT() },
        }),
      })
    }

    case 'close':
      return noStoreJson({ ok: true, session: await patch({ status: 'closed' }) })

    case 'open':
      return noStoreJson({ ok: true, session: await patch({ status: 'open' }) })

    default:
      return error(`Unknown action: ${action}`, 422)
  }
}

async function update(id, fields) {
  const { data, error: dbError } = await db()
    .from('sessions').update(fields).eq('id', id).select('*').single()
  if (dbError) throw dbError
  return data
}

export const config = { path: '/api/host-action' }
