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
- Completions are keyed by the **couple's** local date, never the device's. Use
  `couple_local_date()` in SQL or `coupleLocalDate()` in TypeScript.

## Testing

Three suites, all in `README.md`. `npm run test:db` and `npm run test:e2e` need
`supabase start` running first. `tests/db/rules.test.sql` is the one that actually
proves RLS isolation and partner approval; prefer adding a check there over trusting a
UI test for a rule.

In `tests/db/rules.test.sql`, keep a side effect and the assertion that reads it in
**separate statements** — Postgres does not guarantee evaluation order within one
expression.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
