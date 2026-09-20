// GET /api/export?type=answers|players|summary   Authorization: Bearer <HOST_TOKEN>
//
// The durable record of the session, as CSV. `answers` is the one that matters
// for "record all submissions accurately" — one row per submission, with the
// server-measured timing and the points awarded.
//
// These exports contain delegate personal data. Handle per docs/DATA-PRIVACY.md.

import { db, getSession } from './_lib/supabase.js'
import { publicQuestion, correctAnswerFor, TOTAL_QUESTIONS } from './_lib/questions.js'
import { rankedPlayers } from './_lib/game.js'
import { isHost } from './_lib/auth.js'
import { error } from './_lib/http.js'

/** RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet would
 *  treat as a formula — a name beginning "=" should never execute on open. */
function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers, rows) {
  // BOM so Excel opens UTF-8 names (Arabic, accents) correctly.
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

function csvResponse(filename, body) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export default async (request) => {
  if (request.method !== 'GET') return error('Method not allowed', 405)
  if (!isHost(request)) return error('Not authorised', 401)

  const type = new URL(request.url).searchParams.get('type') || 'answers'
  const stamp = new Date().toISOString().slice(0, 10)

  try {
    const session = await getSession()
    if (!session) return error('No session found', 404)

    // ---- every individual submission ------------------------------------
    if (type === 'answers') {
      const rows = []
      const PAGE = 1000
      // Paginated: PostgREST caps a single response, and ~31,000 rows is well
      // past that.
      for (let from = 0; ; from += PAGE) {
        const { data, error: dbError } = await db()
          .from('answers')
          .select('question_index, choice, is_correct, elapsed_ms, points, created_at, players(first_name, last_name, email, phone)')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1)
        if (dbError) throw dbError
        if (!data?.length) break
        rows.push(...data)
        if (data.length < PAGE) break
      }

      const csv = toCsv(
        ['Question #', 'Round', 'Question', 'First Name', 'Last Name', 'Email', 'Phone',
         'Answer', 'Correct Answer', 'Is Correct', 'Elapsed (ms)', 'Points', 'Submitted At (UTC)'],
        rows.map((r) => {
          const q = publicQuestion(r.question_index)
          return [
            r.question_index + 1, q?.round ?? '', q?.text ?? '',
            r.players?.first_name ?? '', r.players?.last_name ?? '',
            r.players?.email ?? '', r.players?.phone ?? '',
            r.choice, correctAnswerFor(r.question_index), r.is_correct ? 'YES' : 'NO',
            r.elapsed_ms, r.points, r.created_at,
          ]
        })
      )
      return csvResponse(`pmi-agm-2026-answers-${stamp}.csv`, csv)
    }

    // ---- final standings with contact details ---------------------------
    if (type === 'players') {
      const ranked = await rankedPlayers(session.id)
      const { data: contacts } = await db()
        .from('players')
        .select('id, first_name, last_name, email, phone, consent, joined_at')
        .eq('session_id', session.id)
      const byId = new Map((contacts ?? []).map((c) => [c.id, c]))

      const csv = toCsv(
        ['Rank', 'First Name', 'Last Name', 'Email', 'Phone', 'Consent', 'Score',
         'Correct', 'Answered', 'Total Time (ms)', 'Joined At (UTC)'],
        ranked.map((p, i) => {
          const c = byId.get(p.player_id) ?? {}
          return [
            i + 1, p.first_name, p.last_name, p.email, c.phone ?? '',
            c.consent ? 'YES' : 'NO', p.score, p.correct_count, p.answered_count,
            p.total_ms, p.joined_at,
          ]
        })
      )
      return csvResponse(`pmi-agm-2026-players-${stamp}.csv`, csv)
    }

    // ---- per-question summary, no personal data -------------------------
    if (type === 'summary') {
      const { data: stats } = await db()
        .from('question_stats').select('*').eq('session_id', session.id).order('question_index')
      const byIndex = new Map((stats ?? []).map((s) => [s.question_index, s]))

      const csv = toCsv(
        ['Question #', 'Round', 'Question', 'Correct Answer', 'Responses', 'Correct',
         'Correct %', 'Chose A', 'Chose B', 'Chose C', 'Chose D', 'Avg Time (ms)'],
        Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
          const s = byIndex.get(i)
          const q = publicQuestion(i)
          const responses = s?.responses ?? 0
          return [
            i + 1, q.round, q.text, correctAnswerFor(i), responses, s?.correct ?? 0,
            responses ? Math.round(((s.correct ?? 0) / responses) * 100) : '',
            s?.choice_a ?? 0, s?.choice_b ?? 0, s?.choice_c ?? 0, s?.choice_d ?? 0,
            s?.avg_elapsed_ms ?? '',
          ]
        })
      )
      return csvResponse(`pmi-agm-2026-summary-${stamp}.csv`, csv)
    }

    return error('Unknown export type. Use answers, players or summary.', 422)
  } catch (err) {
    console.error('[export]', err)
    return error('Export failed', 500)
  }
}

export const config = { path: '/api/export' }
