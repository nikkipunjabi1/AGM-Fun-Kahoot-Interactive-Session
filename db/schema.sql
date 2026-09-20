-- ===========================================================================
-- PMI UAE Chapter — Annual Gathering 2026 Interactive Quiz
-- Supabase / PostgreSQL schema
--
-- Paste this whole file into: Supabase → SQL Editor → New query → Run
-- Safe to re-run: every object is created IF NOT EXISTS or replaced.
-- ===========================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------------
-- sessions — one row per run of the quiz (plus any rehearsal/load-test runs)
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  status              text not null default 'open'
                        check (status in ('open', 'closed')),
  phase               text not null default 'lobby'
                        check (phase in ('lobby','question','locked','reveal',
                                         'leaderboard','final','draw')),
  question_index      int  not null default -1,   -- -1 = not started
  question_started_at timestamptz,
  settings            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.sessions.question_index is
  'Zero-based index into the server-side question bank. -1 means not started.';
comment on column public.sessions.settings is
  'Holds durationMs, winnerCount, and after a draw: winners[] and the draw seed for audit.';

-- ---------------------------------------------------------------------------
-- players — one row per delegate who joins
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  first_name  text   not null,
  last_name   text   not null,
  email       citext not null,
  phone       text,                              -- optional, +971 format
  consent     boolean not null default false,
  joined_at   timestamptz not null default now(),
  user_agent  text,
  -- One registration per email per session. A delegate who refreshes or
  -- switches phone resumes the same player rather than creating a second one.
  unique (session_id, email)
);

-- ---------------------------------------------------------------------------
-- answers — one row per submission. The durable record of the session.
-- ---------------------------------------------------------------------------
create table if not exists public.answers (
  id             bigserial primary key,
  session_id     uuid not null references public.sessions(id) on delete cascade,
  player_id      uuid not null references public.players(id)  on delete cascade,
  question_index int  not null,
  choice         char(1) not null check (choice in ('A','B','C','D')),
  is_correct     boolean not null,
  elapsed_ms     int  not null check (elapsed_ms >= 0),
  points         int  not null check (points >= 0),
  created_at     timestamptz not null default now(),
  -- The integrity guarantee. Makes a double-tap and a replay attack
  -- indistinguishable to the database, and rejects both. First answer stands.
  unique (session_id, player_id, question_index)
);

-- ---------------------------------------------------------------------------
-- Indexes — sized for the leaderboard query running every ~2s during the game
-- ---------------------------------------------------------------------------
create index if not exists answers_session_player_idx
  on public.answers (session_id, player_id);
create index if not exists answers_session_question_idx
  on public.answers (session_id, question_index);
create index if not exists players_session_idx
  on public.players (session_id);

-- ---------------------------------------------------------------------------
-- player_scores — the leaderboard.
--
-- Ordering encodes the agreed winner rule exactly:
--   1. highest total score
--   2. then lowest cumulative answer time  (the tie-break)
--   3. then earliest join                  (final deterministic fallback)
-- Players genuinely tied on both score AND time come back adjacent, which is
-- what lets the draw logic detect a real tie at the cut-off.
-- ---------------------------------------------------------------------------
create or replace view public.player_scores as
select
  p.id            as player_id,
  p.session_id,
  p.first_name,
  p.last_name,
  p.email,
  p.joined_at,
  coalesce(sum(a.points), 0)::int                          as score,
  coalesce(sum(a.elapsed_ms), 0)::int                      as total_ms,
  count(a.id) filter (where a.is_correct)::int             as correct_count,
  count(a.id)::int                                         as answered_count
from public.players p
left join public.answers a
       on a.player_id = p.id
      and a.session_id = p.session_id
group by p.id, p.session_id, p.first_name, p.last_name, p.email, p.joined_at;

-- ---------------------------------------------------------------------------
-- question_stats — per-question analytics for /admin and the reveal screen
-- ---------------------------------------------------------------------------
create or replace view public.question_stats as
select
  a.session_id,
  a.question_index,
  count(*)::int                                     as responses,
  count(*) filter (where a.is_correct)::int         as correct,
  count(*) filter (where a.choice = 'A')::int       as choice_a,
  count(*) filter (where a.choice = 'B')::int       as choice_b,
  count(*) filter (where a.choice = 'C')::int       as choice_c,
  count(*) filter (where a.choice = 'D')::int       as choice_d,
  round(avg(a.elapsed_ms))::int                     as avg_elapsed_ms
from public.answers a
group by a.session_id, a.question_index;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Row Level Security
--
-- Every table is RLS-enabled with NO policies. That is deliberate: it denies
-- all access to the anon and authenticated roles outright. The application
-- reaches Postgres only through Netlify Functions using the service_role key,
-- which bypasses RLS. No browser can read or write these tables directly,
-- so no delegate can read the answer key, inflate a score, or download the
-- contact list.
-- ===========================================================================
alter table public.sessions enable row level security;
alter table public.players  enable row level security;
alter table public.answers  enable row level security;

revoke all on public.sessions from anon, authenticated;
revoke all on public.players  from anon, authenticated;
revoke all on public.answers  from anon, authenticated;
revoke all on public.player_scores   from anon, authenticated;
revoke all on public.question_stats  from anon, authenticated;

-- ===========================================================================
-- Post-event housekeeping (run manually — see docs/DATA-PRIVACY.md)
-- ===========================================================================

-- Remove rehearsal and load-test data before the live session:
--   delete from public.sessions where code like 'LOADTEST%' or code like 'TEST%';

-- Anonymise delegate contact details once prizes are fulfilled:
--   update public.players
--      set first_name = 'Deleted', last_name = 'Delegate',
--          email = concat('deleted-', id, '@example.invalid'), phone = null
--    where session_id = (select id from public.sessions where code = 'AGM2026');
