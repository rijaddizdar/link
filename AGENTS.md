# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

Start with `README.md` (setup, commands, layout) and `docs/SPEC.md` (the agreed product
spec, and which parts are deliberately not built yet). The notes below are only the
things those two do not already make obvious.

## Sharp edges

- **The database enforces the product rules, not the app.** `tasks` and `task_proposals`
  have no direct INSERT/UPDATE/DELETE policies at all. Every create, edit, delete and
  approval goes through a `SECURITY DEFINER` function in
  `supabase/migrations/20260101000000_init_link.sql`. Adding a write path in TypeScript
  alone will fail with `permission denied` — and that is the point: partner approval
  cannot be skipped by calling the API directly. Change the rule in SQL first, then
  mirror it in `src/lib/` for the UI.
- `src/lib/proposals.ts`, `src/lib/invite-code.ts` and `src/lib/schedule.ts` are
  deliberate duplicates of SQL rules, so the UI can decide what to render without a
  round trip. If you change one side, change the other and both test suites.
- **All colours live in `src/app/tokens.css`.** No component hard-codes one. The visual
  direction is being chosen separately and that file is meant to be swapped wholesale.
- Components that read browser-only values (time zone, the zone list) must fill them in
  after mount, not during render — these pages are server-rendered and a mismatch
  silently leaves the hydrated control showing the wrong value. See
  `src/components/TimeZoneSelect.tsx`.
- **A day rolls over at the couple's agreed end-of-day time, not at midnight.** At 9:01 PM
  with a 9 PM end time, both partners are already logging into tomorrow. Use
  `couple_active_date()` in SQL or `activeLocalDate()` in TypeScript; the plain calendar
  date is almost never what you want.
- **A settled day is written once and never recomputed.** `settle_day()` returns the
  existing row rather than redoing the sums, so editing the task list cannot rewrite who
  won last Tuesday. Tests that seed history must seed it *before* any page load, because
  the first load settles the day.
- `settle_day` returns a composite, so `IS NOT NULL` on its result is false whenever any
  column is null — which a tie always is. Check for the row instead.
- Supabase **auto-grants the API roles access to newly created public tables.** Every new
  migration has to `revoke all ... from anon, authenticated` before granting what it means
  to allow, or the table is writable by any signed-in user.

## Testing

Three suites, all in `README.md`. `npm run test:db` and `npm run test:e2e` need
`supabase start` running first. `tests/db/rules.test.sql` is the one that actually
proves RLS isolation and partner approval; prefer adding a check there over trusting a
UI test for a rule.

In the SQL suites, keep a side effect and the assertion that reads it in **separate
statements** — Postgres does not guarantee evaluation order within one expression. Temp
tables created while acting as the owner also need an explicit `grant select ... to
authenticated` before the tests can read them back as a user.

Playwright tests that need history use the service_role key, read from the running stack by
`serviceRoleKey()` in `tests/e2e/helpers.ts` rather than committed. Use `agreeTask()` rather
than clicking Approve and reading the database straight after — the row does not exist until
the server action finishes.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
