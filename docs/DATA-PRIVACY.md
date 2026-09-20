# Data protection

The session collects personal data from roughly 1,000 delegates. This documents what, why, and
for how long — both as good practice and because UAE Federal Decree-Law No. 45 of 2021 (PDPL)
applies to PMI UAE Chapter as a controller.

## What is collected

| Field | Required | Why | Shown publicly |
|---|---|---|---|
| First name | Yes | Identify winners on stage | **Yes** — first name + last initial |
| Last name | Yes | Distinguish duplicate first names; match delegate list | No — initial only |
| Email | Yes | Contact winners; match to Chapter membership | **No** |
| Phone (+971) | **No** | Faster winner contact on the day | **No** |
| Answers, timing, score | Yes | Run the game | Score only, via leaderboard |
| User agent | Yes | Diagnose device issues | No |

The leaderboard and big screen show **"Ahmed K."**, never a full name, never an email, never a
phone number. Nothing identifying is ever projected to a 1,000-person room.

## Consent

The join screen carries an explicit, unticked checkbox. A delegate cannot join without it:

> ☐ I agree that PMI UAE Chapter may contact me about this quiz and my prize.

Consent is stored per player with a timestamp (`players.consent`, `players.joined_at`).

## Lawful handling

- **Purpose limitation** — collected for this session and prize fulfilment. Do not merge into
  the general marketing list without separate consent.
- **Minimisation** — phone is optional and clearly marked as such.
- **Security** — data lives in Supabase (encrypted at rest, TLS in transit). The
  `service_role` key exists only in Netlify environment variables, never in the repository,
  never in client JavaScript. Row Level Security denies all direct client access; every read
  and write goes through a server-side function.
- **Access** — `/admin` exports are gated behind `HOST_TOKEN`.

## Retention

| Data | Keep until | Then |
|---|---|---|
| Answers and scores | 30 days after the event | Anonymise: drop `player_id`, keep aggregates |
| Contact details | Prizes fulfilled + 30 days | Delete, unless the delegate separately opted into Chapter comms |
| Aggregate statistics | Indefinite | Retain — contains no personal data |

Suggested deletion date: **10 November 2026.**

```sql
-- Anonymise after prizes are fulfilled
UPDATE players
SET first_name = 'Deleted', last_name = 'Delegate',
    email = concat('deleted-', id, '@example.invalid'),
    phone = NULL
WHERE session_id = (SELECT id FROM sessions WHERE code = 'AGM2026');
```

## If a delegate asks to be removed

They have that right. Delete their row; `ON DELETE CASCADE` removes their answers:

```sql
DELETE FROM players WHERE email = 'delegate@example.com';
```

Aggregate counts shift slightly. That is the correct outcome.

## Not collected

No cookies beyond a single `localStorage` entry holding the player's own session token. No
analytics, no tracking pixels, no third-party scripts. Nothing to disclose in a cookie banner.
