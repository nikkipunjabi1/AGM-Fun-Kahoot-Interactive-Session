# Run of show — 30 minutes, 30 questions

> Pacing is **tight by design** — you chose the full 30-question pack. Every minute below is
> accounted for. The host controls every transition manually, so you can always slow down; but
> if you fall behind, the fastest recovery is to shorten the leaderboard beats, not the
> questions.

## Before the session

| When | Action | Owner |
|---|---|---|
| T−7 days | Full rehearsal with 5+ real phones on the venue network | Tech |
| T−3 days | Load test at 1,000 virtual players (`docs/LOAD-TESTING.md`) | Tech |
| T−1 day | Switch GitHub repo to **Private** | Nikki |
| T−1 day | Confirm final goodie count, set `WINNER_COUNT` | Nikki |
| T−2 hrs | Open `/host`, create session, confirm code `AGM2026` | Host |
| T−2 hrs | Project `/screen`, check QR scans from the **back row** | Tech / AV |
| T−30 min | QR slide live on screen during the preceding break | AV |

## The 30 minutes

| Clock | Duration | Phase | On the big screen | Host does |
|---|---|---|---|---|
| 0:00 | 2:00 | **Lobby** | Giant QR + live join counter | Welcome, explain rules, watch counter climb |
| 2:00 | 0:30 | Round 1 intro | "UAE Mega Projects" | Hype the round |
| 2:30 | 6:00 | **R1 — Q1–10** | Question, timer, then reveal | Advance → lock → reveal, per question |
| 8:30 | 0:30 | Leaderboard | Top 10 | Call out the leaders by name |
| 9:00 | 0:30 | Round 2 intro | "Sustainability Challenge" | Link to Chapter's sustainability track |
| 9:30 | 6:00 | **R2 — Q1–10** | Question, timer, then reveal | Advance → lock → reveal |
| 15:30 | 0:30 | Leaderboard | Top 10 | Note any big climbers |
| 16:00 | 0:30 | Round 3 intro | "PMI UAE Chapter" | "How well do you know your Chapter?" |
| 16:30 | 6:00 | **R3 — Q1–10** | Question, timer, then reveal | Advance → lock → reveal |
| 22:30 | 2:00 | **Final** | Final top 10, confetti | Build the tension |
| 24:30 | 3:30 | **Goodie draw** | Winner reveal, one at a time | Bring winners to stage |
| 28:00 | 2:00 | Close | Thank-you + Chapter QR | Hand back to the MC |

**Per question, the host loop is 36 seconds:**

```
  advance (question appears)     →  15s answering
  lock (timer hits zero)         →   2s "pens down"
  reveal (answer + distribution) →   9s host explains
  next                           →  10s buffer / banter
```

## Host script cues

**Lobby**
> "Phones out — everyone. Scan the code on screen, no app to download, no login. Enter your
> name and email so we can find you if you win. We have goodies for five people."

**Before Q1**
> "Fifteen seconds a question. Faster correct answers score more — so don't sit on it."

**Between rounds**
> "Round one done. Look at that board — and remember, it can still completely change."

**Before the draw**
> "Five winners. Top five on the board, decided on score, and if anyone's dead level we spin
> for it live. No arguments."

## If you are running behind

In priority order:
1. Skip the round-intro beats (saves 1:30)
2. Cut the mid-round leaderboard to 15 seconds (saves 0:30)
3. Reveal without commentary (saves up to 2:00)
4. **Last resort:** drop Q8–10 of Round 3 — the host console lets you jump straight to Final.

Never cut the draw. It is the payoff the room is waiting for.

## If you are running ahead

- Let the leaderboard breathe; interview the leader for 30 seconds.
- Read out the answer distribution — "62% of this room got that wrong" always gets a reaction.
