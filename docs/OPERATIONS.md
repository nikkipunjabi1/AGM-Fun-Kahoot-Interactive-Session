# Event-day operations runbook

## Roles on the day

| Role | Device | Responsibility |
|---|---|---|
| **Host / MC** | Laptop or tablet on `/host` | Drives every transition. Sole controller. |
| **Tech operator** | Second laptop on `/admin` | Watches join count, error rate, submission health |
| **AV** | Projector on `/screen` | Never touches it once it is up |

Keep host and tech on **separate devices**. If the host's browser dies mid-session, the tech
operator can open `/host` on theirs and carry on — state lives in the database, not the browser.

---

## Venue network

**This is the single biggest risk to the session, and it is not a software risk.**

1,000 phones associating with a venue access point will saturate it regardless of how well the
app is written. Mitigations, in order of importance:

1. **Brief the venue AV team a week ahead.** Ask explicitly: how many concurrent client
   associations does the guest Wi-Fi support? If the answer is under 1,000, you need more APs.
2. **The app is built for this.** Payloads are a few KB, there is no webfont, no video, no
   socket. A phone on a weak connection simply polls again.
3. **Tell delegates to use mobile data if Wi-Fi struggles.** Put it on the lobby slide. UAE
   4G/5G coverage in Dubai conference venues is generally excellent and takes load off the
   Wi-Fi immediately.
4. **The QR code encodes a plain HTTPS URL**, so it works identically on Wi-Fi or cellular.

### If the network degrades mid-session

- Players who drop out **rejoin automatically** — their session token is in `localStorage`,
  and scores already banked are in Postgres. They resume at the current question.
- A missed question scores zero for that player. It does not corrupt the game.
- The host screen keeps working; it only needs its own connection.

---

## Failure modes and responses

| Symptom | Cause | Response |
|---|---|---|
| Join counter stalls in lobby | Venue Wi-Fi saturated | Announce "switch to mobile data" |
| Host console won't advance | Host lost connectivity | Tech operator opens `/host`, continues |
| Screen frozen | Browser tab crashed | Reload `/screen` — it re-reads state, no data lost |
| Some players see the old question | Edge cache | Resolves itself within 1–2 seconds. Do not intervene |
| Answers rejected as "too late" | Genuine timeout | Expected. `LATE_ANSWER_GRACE_MS` already allows 2.5s |
| Nobody can join | Site or DB down | Go to contingency below |

---

## Contingency plans

**Tier 1 — App works, network struggles.**
Continue. Announce mobile data. Accept lower participation; scores remain valid.

**Tier 2 — App unreachable.**
Have **Kahoot 360 pre-loaded with the same 30 questions** in a second browser tab. It is the
reason to keep that licence live through 11 October. Switch-over cost is about 90 seconds of
stage time.

**Tier 3 — All digital fails.**
Print the 30 questions as slides. Run it show-of-hands, A/B/C/D on paper cards. Pick winners by
a physical draw. Have the printed deck in the room.

> Decide the Tier 2 trigger **before** you go on stage. Suggested rule: if fewer than 100
> players have joined 3 minutes into the lobby, switch.

---

## Repository visibility

This repository is **public**. The answer key is server-side only and never reaches a browser,
but it is plainly readable in this repo's source by anyone who finds it.

**Action: switch to Private before 11 October 2026.**

`Settings → General → Danger Zone → Change repository visibility → Make private`

Netlify keeps deploying a private repo without any reconfiguration.

---

## Pre-flight checklist (T−2 hours)

```
[ ] Netlify production deploy is green, on the correct commit
[ ] Environment variables set: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    HOST_TOKEN, GAME_CODE, WINNER_COUNT
[ ] Open /host with token — session created, code AGM2026
[ ] Open /screen — logo, QR and colours render correctly on the actual projector
[ ] QR scanned successfully from the BACK ROW of the hall
[ ] Two test phones joined, answered, appeared on the leaderboard
[ ] Test draw executed on the test session, then RESET
[ ] Session reset to lobby, test players purged
[ ] CSV export downloads and opens correctly
[ ] Host laptop: screen sleep disabled, charger connected
[ ] Kahoot 360 fallback tab open with the same questions
[ ] Printed question deck in the room
```

**The reset step matters.** Run `/admin → Reset session` after rehearsal, or test players will
appear on the live leaderboard.

---

## After the session

1. `/admin → Export CSV` — full submission record, one row per answer.
2. `/admin → Export players` — contact list for the winners and follow-up.
3. Note the draw seed shown on the draw screen; it is stored in `sessions.settings` and makes
   the result auditable if anyone questions it.
4. Data retention and deletion obligations: [DATA-PRIVACY.md](DATA-PRIVACY.md).
