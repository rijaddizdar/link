# Link

A web app for couples. Two people link their accounts with a code, keep one shared list
of tasks, and each log their own day — your column next to your partner's.

The full agreed product spec, including what this repo does **not** do yet, is in
[`docs/SPEC.md`](docs/SPEC.md).

![Today, side by side](docs/screenshots/04-today-side-by-side-desktop.png)

## What works today

- Accounts, sign-up and sign-in.
- Linking with a one-time code, with the couple's shared time zone set at linking.
- Unlinking, with a 30-day grace period you can undo inside.
- One shared task list with no cap: title, notes, emoji, colour, schedule (every day /
  chosen weekdays / one time) and an optional numeric target.
- Partner approval: a new task, an edit or a deletion only takes effect once the other
  partner approves it. Unanswered proposals expire after 7 days.
- Per-partner completion logging, shown side by side on the day view.

Daily scoring, winners, challenges, streaks and the calendar tab are deliberately not
built yet — see `docs/SPEC.md`.

## Running it locally

You need **Node 20+**, **Docker** (or another container runtime such as
[Colima](https://github.com/abiosoft/colima)) and the
[**Supabase CLI**](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm install

# Starts Postgres, Auth and the REST API in containers and applies
# supabase/migrations. The first run pulls a few images.
supabase start

# Copy the printed anon key into your own env file.
cp .env.example .env.local
$EDITOR .env.local

npm run dev            # http://localhost:3000
```

`supabase status` reprints the URL and keys at any time. `supabase stop` shuts the stack
down; `npm run db:reset` rebuilds the database from the migrations.

### Environment

Only two values are needed, both public:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` for the local stack |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key `supabase start` prints |

**Never commit real keys.** `.env.example` is the only env file in git; every
`.env*.local` is gitignored. This repository is public.

### Trying the two-person flow

Open a second browser profile or a private window, sign up as the other partner there,
then use the code from the first window. One account per browser session.

## Tests

```bash
npm test          # Vitest — approval and expiry rules, code linking, scheduling
npm run test:db   # SQL — RLS isolation and the approval rules, against the local stack
npm run test:e2e  # Playwright — the two-partner happy path, against the local stack
npm run test:all  # all three
```

`npm run test:db` and `npm run test:e2e` need `supabase start` to be running.
Playwright starts its own Next.js dev server on port 3100.

To refresh the screenshots in `docs/screenshots/`:

```bash
SCREENSHOTS=1 npx playwright test tests/e2e/screenshots.spec.ts
```

## How it is put together

```
src/app/            routes (App Router) and the design tokens
src/components/     shared UI, including the side-by-side board
src/lib/            pure rules (proposals, invite codes, scheduling), data access,
                    server actions, Supabase clients
supabase/migrations schema, Row Level Security policies, and the rule functions
tests/unit          Vitest
tests/db            SQL rule checks
tests/e2e           Playwright
```

Two things worth knowing before changing anything:

1. **The database enforces the product rules, not the app.** `tasks` and
   `task_proposals` have no direct write policies. Creating, editing, deleting and
   approving all go through `SECURITY DEFINER` functions, so partner approval cannot be
   skipped by calling the API directly. Add a rule there first, then mirror it in
   `src/lib/` for the UI.
2. **Colours live in `src/app/tokens.css` only.** No component hard-codes one. The
   visual direction is being chosen separately, so that file is meant to be replaceable.
