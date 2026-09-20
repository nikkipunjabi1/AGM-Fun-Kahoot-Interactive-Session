# Branching & review strategy

Set up so that **nothing reaches `main` without your sign-off**, because `main` is what Netlify
will deploy to the live event.

## Branches

```
main                     Production. Netlify deploys from here. Protected by review.
 │
 └── develop             Integration branch. Everything lands here first.
      │
      ├── feature/quiz-engine        Data layer, functions, scoring
      ├── feature/player-experience  Join + play UI
      ├── feature/host-and-screen    Host console + projector screen
      └── feature/stats-and-draw     Analytics, export, prize draw
```

## The flow

1. Feature branches are cut from `develop`.
2. Each merges into `develop` with `--no-ff`, so the history shows what arrived together.
3. `develop` is deployed as a **Netlify preview** — a real URL, real database, not `main`.
4. **You verify on that preview URL.** Play a full round on your phone. Open the host console.
   Run a draw. Export the CSV.
5. Only once you are satisfied does `develop → main` merge via Pull Request.
6. Netlify's production deploy then picks up `main`.

## What is on `main` right now

Only the initial commit — documentation, licence, brand assets, project scaffold. You said the
first commit could go straight to `main`, so it did. **No application code is on `main`.**
All functionality is on `develop` and its feature branches, waiting for your review.

## Recommended GitHub protection for `main`

Settings → Branches → Add rule for `main`:

- ☑ Require a pull request before merging
- ☑ Dismiss stale approvals when new commits are pushed
- ☐ Allow force pushes *(leave off)*
- ☐ Allow deletions *(leave off)*

Because you are the sole maintainer, leave "Require approvals" at 0 — otherwise GitHub will
block you from merging your own PR.

## Commit convention

Conventional Commits, so history stays scannable:

```
feat(host): add answer-lock control
fix(scoring): clamp elapsed time to question duration
docs(ops): add venue network contingency
chore(deps): pin supabase-js
```
