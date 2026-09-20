# Deployment

Roughly 25 minutes end to end. Two free accounts needed: Supabase and Netlify.

---

## 1. Supabase (10 min)

1. Create a project at [supabase.com](https://supabase.com) → **New project**.
   - Name: `pmi-uae-agm-2026`
   - Region: **Central EU (Frankfurt)** — lowest latency to Dubai of the available regions
   - Save the database password somewhere safe
2. Open **SQL Editor** → **New query**.
3. Paste the entire contents of [`db/schema.sql`](../db/schema.sql) and **Run**.
   You should see `Success. No rows returned.`
4. Go to **Project Settings → API** and copy two values:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` secret** → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ `service_role` bypasses Row Level Security. It belongs only in Netlify environment
> variables. Never put it in client code, never commit it. The `anon` key is not used by this
> app at all — every database call goes through a server-side function.

---

## 2. Generate a host token (1 min)

```bash
openssl rand -hex 24
```

Keep it. Without it nobody can open `/host` or `/admin`, or advance the game.

---

## 3. Netlify (10 min)

### Connect the repository

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Choose GitHub → `nikkipunjabi1/AGM-Fun-Kahoot-Interactive-Session`
3. **Production branch: `main`** *(after you have reviewed and merged `develop`)*
4. Build settings are read automatically from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

### Environment variables

**Site configuration → Environment variables → Add a variable**

| Key | Value | Scope |
|---|---|---|
| `SUPABASE_URL` | from step 1 | All |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 | All |
| `HOST_TOKEN` | from step 2 | All |
| `GAME_CODE` | `AGM2026` | All |
| `QUESTION_DURATION_SECONDS` | `15` | All |
| `WINNER_COUNT` | `5` | All |
| `LATE_ANSWER_GRACE_MS` | `2500` | All |

Then **Deploys → Trigger deploy → Clear cache and deploy site** so the functions pick them up.

---

## 4. Verify (5 min)

| Check | URL | Expect |
|---|---|---|
| Player page | `https://<site>.netlify.app/` | Join form, PMI full-colour logo |
| Big screen | `/screen?token=<HOST_TOKEN>` | Purple gradient, white logo, QR code |
| Host console | `/host?token=<HOST_TOKEN>` | Control panel, "Create session" |
| Admin | `/admin?token=<HOST_TOKEN>` | Stats dashboard |
| Health check | `/api/state` | JSON with `phase` and `serverNow` |

Then run one end-to-end rehearsal: create the session, join from your phone, answer a question,
reveal it, check the leaderboard, run a draw, export the CSV, and **reset**.

---

## 5. Custom domain (optional, 5 min)

A short URL is far kinder on a QR code and easier to read out from stage.

**Domain management → Add a domain** → e.g. `quiz.pmi-uae.org`

Add the CNAME your DNS provider needs; Netlify issues the TLS certificate automatically.

---

## Local development

```bash
npm install
cp .env.example .env    # fill in the same values
npm run dev             # http://localhost:8888
```

`npm run dev` uses Netlify Dev, so functions run locally exactly as they do in production.
Point it at a **separate Supabase project** for development — never develop against the
database the live event will use.

---

## Rollback

Netlify keeps every deploy. **Deploys → select a previous deploy → Publish deploy.**
Takes a few seconds and is instant for users — worth knowing on the day.
