#!/usr/bin/env node
// ===========================================================================
// Question bank integrity check.   npm run check
//
// Catches the class of mistake that is invisible until it is on a screen in
// front of 1,000 people: a question with three options, a duplicated stem, an
// answer key pointing at a letter that does not exist.
// ===========================================================================

import { QUESTIONS, ROUNDS, TOTAL_QUESTIONS, publicQuestion, correctAnswerFor }
  from '../netlify/functions/_lib/questions.js'

const problems = []
const warnings = []

// --- structural ------------------------------------------------------------
QUESTIONS.forEach((q, i) => {
  const at = `Q${i + 1}`
  if (!q.q?.trim()) problems.push(`${at}: empty question text`)
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    problems.push(`${at}: expected 4 options, found ${q.options?.length ?? 0}`)
  }
  if (q.options?.some((o) => !String(o).trim())) problems.push(`${at}: has a blank option`)
  if (!['A', 'B', 'C', 'D'].includes(q.answer)) problems.push(`${at}: invalid answer "${q.answer}"`)
  if (!ROUNDS.some((r) => r.id === q.round)) problems.push(`${at}: unknown round ${q.round}`)

  const unique = new Set(q.options?.map((o) => String(o).trim().toLowerCase()))
  if (unique.size !== q.options?.length) problems.push(`${at}: duplicate options`)

  // Long options wrap badly on a phone tile.
  q.options?.forEach((o, j) => {
    if (String(o).length > 75) {
      warnings.push(`${at} option ${'ABCD'[j]}: ${String(o).length} chars — may wrap awkwardly on a phone`)
    }
  })
  if (q.q.length > 150) warnings.push(`${at}: question is ${q.q.length} chars — check it fits the big screen`)
})

// --- duplicates ------------------------------------------------------------
const seen = new Map()
QUESTIONS.forEach((q, i) => {
  const key = q.q.trim().toLowerCase()
  if (seen.has(key)) problems.push(`Q${i + 1}: duplicates Q${seen.get(key) + 1}`)
  else seen.set(key, i)
})

// --- the client must never receive an answer ------------------------------
for (let i = 0; i < TOTAL_QUESTIONS; i++) {
  const serialised = JSON.stringify(publicQuestion(i))
  if (serialised.includes('"answer"')) {
    problems.push(`Q${i + 1}: publicQuestion() leaks the answer key to the client`)
  }
}

// --- balance ---------------------------------------------------------------
const dist = { A: 0, B: 0, C: 0, D: 0 }
QUESTIONS.forEach((q) => dist[q.answer]++)
const lowest = Math.min(...Object.values(dist))
const highest = Math.max(...Object.values(dist))

// --- report ----------------------------------------------------------------
console.log(`\nPMI UAE AGM 2026 — question bank check\n${'─'.repeat(46)}`)
console.log(`Questions        ${TOTAL_QUESTIONS}`)
for (const r of ROUNDS) {
  console.log(`  Round ${r.id}        ${QUESTIONS.filter((q) => q.round === r.id).length}  ${r.title}`)
}
console.log(`Answer spread    A:${dist.A}  B:${dist.B}  C:${dist.C}  D:${dist.D}`)

if (highest - lowest > 6) {
  warnings.push(
    `Answer key is skewed (${lowest}–${highest} per letter). A delegate who guesses "B" every ` +
    `time would do unusually well.`
  )
}

if (warnings.length) {
  console.log(`\n⚠  ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`)
  warnings.forEach((w) => console.log(`   · ${w}`))
}

if (problems.length) {
  console.log(`\n✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`)
  problems.forEach((p) => console.log(`   · ${p}`))
  console.log()
  process.exit(1)
}

console.log(`\n✓  No problems found.\n`)
