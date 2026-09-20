# Backlog

Items deliberately deferred until the core game is built and verified. Nothing here blocks
the first working version.

---

## BL-01 — "Fun tactics": raising the energy in the room  🔴 open for discussion

**Raised by:** Nikki Punjabi, 20 Sep 2026
**Status:** To be discussed *after* core functionality is working — not yet designed or built.
**Constraint relaxed:** the session may run a few minutes past 30 if the payoff is worth it.

The 30-question quiz is the backbone. This item covers the moments *between* and *around* the
questions that turn a quiz into an experience for 1,000 people.

Candidate directions to talk through (no decision made, no code written):

| Idea | What it adds | Cost to build | Time it adds |
|---|---|---|---|
| **Double-points round** | Host arms a 2× multiplier on R3 — scoreboard can flip late, nobody checks out early | Low | 0 min |
| **Streak bonuses & on-screen fire** | Consecutive-correct streaks earn bonus points with visible celebration | Low | 0 min |
| **Live audience pulse** | Non-scoring opinion polls between rounds ("Which track are you attending?") — instant bar chart on the big screen | Low | ~2 min |
| **Team / table mode** | Delegates pick a table number; a parallel table leaderboard runs alongside individuals | Medium | ~1 min |
| **Emirate leaderboard** | Join screen asks which emirate you work in; rounds show Dubai vs Abu Dhabi vs Sharjah standings | Low–Medium | ~1 min |
| **Sudden-death tie-break** | If the top is tied, a live extra question decides it on stage | Medium | ~2 min |
| **Word cloud finale** | "One word for the year ahead" → live word cloud as the closing visual | Medium | ~2 min |
| **Speed demon / comeback awards** | Non-score prizes: fastest single answer, biggest climb — spreads recognition beyond the top 5 | Low | ~1 min |
| **Sponsor moment** | A sponsor-branded question or the draw presented by a sponsor | Low | ~1 min |

**Open questions for that discussion:**
- How far past 30 minutes is genuinely acceptable on the day?
- Are there sponsor commitments this should serve?
- Should extra recognition (speed, comeback) come with physical goodies, or is it applause only?

---

## BL-02 — Repository visibility

This repository is public and contains the answer key in server-side source. Switch to Private
before 11 October 2026. See [OPERATIONS.md](OPERATIONS.md#repository-visibility).

---

## BL-03 — Re-skin against the official AGM slide deck

Brand tokens are currently derived from the official PMI UAE logo SVGs (purple `#4F17A8`,
orange `#FF610F`, cyan `#05BFE0`). Sample slides were mentioned but not yet supplied. All
colours are centralised in `src/styles/tokens.css`, so aligning to the final deck is a
single-file change.

---

## BL-04 — Confirm final goodie count

Currently 5, configurable 3–10 via `WINNER_COUNT`. No code change needed to adjust.
