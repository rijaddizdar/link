# Link — v1 product spec

Link is a web app for couples. Two people link their accounts with a code, keep one
shared list of tasks, and each log their own day against it.

This document records the agreed v1 spec and marks what the first PR
(`fm/link-foundation`) implements and what is deliberately left for later.

Legend: **[v1]** shipped in this PR · **[later]** designed for, not built yet.

All of v1 is now built. What remains is listed in section 10.

---

## 0. Privacy: a shared site password

- **[v1]** Added at the captain's request: one shared password in front of the whole site.
  Until it is entered, every path redirects to a password page that says nothing about what
  is behind it — not even the sign-in page is reachable.
- **[v1]** Once entered, the device remembers it for as long as browsers allow (400 days).
- **[v1]** The password lives only in the `SITE_PASSWORD` environment variable, never in the
  repository, which is public. The browser keeps a token derived from it, not the password.
- **[v1]** If no password is configured, the site stays locked: it fails closed.
- **[v1]** This is a privacy curtain, not the main lock. Each person still signs in to their
  own account, and Row Level Security still decides what each account can see.

## 1. Accounts and linking

- **[v1]** Each person has their own account (email and password, via Supabase Auth).
  There is no shared login.
- **[v1]** One partner asks the site for a code and shares it however they like. The
  other enters it and the two accounts are linked. A code is 8 characters from an
  alphabet that leaves out `0 O 1 I L`, so it survives being read aloud, and it can be
  typed in any casing with or without separators.
- **[v1]** A code works for 7 days, can be used once, and cannot be redeemed by the
  person who created it. Making a new code revokes the previous unused one.
- **[v1]** The couple's **time zone** and **end-of-day time** are both set at linking, by
  whoever generates the code. Together they decide which day a completion lands on,
  wherever either partner is.
  - The time zone stays directly editable in Settings.
  - The end-of-day time changes **only when both partners agree**, through the same
    approval flow as a task change.
- **[v1]** **The day rolls over at the agreed end-of-day time, not at midnight.** At 9:01 PM
  with a 9 PM end time, both partners are already logging into tomorrow. Every date in the
  app is this *active date*.
- **[v1]** A couple is exactly two people. A third account cannot join.
- **[v1]** A user who is not in a couple sees nothing shared — enforced in the database,
  not only in the UI.

### Unlinking

- **[v1]** Either partner can unlink, on their own, without the other agreeing.
- **[v1]** Unlinking takes effect immediately: the shared list disappears for both and
  both are free to link with someone else.
- **[v1]** **Grace period: 30 days.** The shared history (tasks, proposals, completion
  logs) is kept for 30 days after an unlink and then deleted for good.
  - Chosen as a sensible default: long enough to cover a fight and a reconciliation,
    short enough that stale couple data is not kept indefinitely.
  - Inside the window either ex-partner can undo the unlink and get the shared list
    back, as long as neither of them has linked with someone else in the meantime.
  - Deletion is done by `public.purge_expired_couples()`. It is safe to call at any
    time and is meant to be run on a schedule; nothing in the app depends on it having
    run.

## 2. Tasks

- **[v1]** One shared list per couple. Both partners see the same tasks.
- **[v1]** **No cap** on how many tasks a couple keeps.
- **[v1]** A task is fully customisable:
  - title (1–120 characters)
  - description / notes (optional)
  - emoji
  - colour, from the shared palette
  - schedule: **every day**, **chosen weekdays**, or **one time on a date**
  - optional **numeric target** (for example 8 glasses of water) — the task counts as
    done once the target is reached. Without a target it is a plain done / not-done.
- **[v1]** Each partner logs their **own** completion. One task, two independent logs.
- **[v1]** A completion belongs to a **couple-local date**, so both partners' logs land
  on the same calendar day however far apart they are.

## 3. Partner approval

- **[v1]** A task proposed by one partner is **not** on the shared list until the other
  approves it. The same goes for an **edit** and for a **deletion**.
- **[v1]** The partner who proposed something can never approve it themselves. They can
  only withdraw it.
- **[v1]** An unanswered proposal **expires after 7 days** and stops being actionable.
- **[v1]** A task can have at most one change waiting at a time.
- **[v1]** All of this is enforced in the database. The task table has no direct write
  policies at all: creates, edits and deletes only happen inside the approval functions,
  so going around the UI and talking to the API directly does not help.
- **[v1]** An approved deletion archives the task rather than erasing it, so the
  completion history stays intact for the scoring work below.

## 4. Side-by-side view

- **[v1]** Every task on the day view shows **my completion next to my partner's**, in
  two fixed columns, so there is nothing to switch between to compare. The columns stack
  on a phone, still labelled.
- **[v1]** Only my own column has controls. My partner's column is read-only.

## 5. Daily competition

- **[v1]** The couple sets the time of day a day ends (section 1).
- **[v1]** At that moment the day closes and the partner who completed more of **that
  day's scheduled** tasks wins it. A counter only counts once it reaches its target.
- **[v1]** Equal counts are a **tie**, shown as a shared heart. A tie is never framed as a
  loss: "nobody wins, so you both do".
- **[v1]** A day **neither** of them touched is not a tie. The database records no winner
  for both cases, but the screens tell them apart — showing an untouched day as a shared
  heart would be a lie. It reads "nobody finished".
- **[v1]** A day is **settled once and never recomputed.** Editing or deleting a task later
  cannot rewrite who won last Tuesday.
- **[v1]** Settling happens whenever a screen that shows results is opened, so the app is
  correct with no scheduled job running at all. The job in `.github/workflows/maintenance.yml`
  is a backstop.
- **[v1]** **Logs are trusted.** Either partner can **challenge** one of the other's logs
  before the day closes — but a challenge is a question, not a veto. It never removes
  anything. The only person who can clear a log is the one who made it, by conceding.
  A challenge still open when the day closes simply stands.
- **[v1]** A **shared streak** counts consecutive days on which both partners finished
  everything scheduled. A day with nothing scheduled neither adds to the streak nor breaks
  it — there was nothing to finish, so it should not punish them.

## 6. Calendar tab

- **[v1]** A month grid, Monday first, with one marker per day: rose if you won, violet if
  your partner did, lime heart for a tie, black where nobody finished, dashed for days
  still to come.
- **[v1]** Every settled day links to its own end-of-day screen.
- **[v1]** The **monthly winner** is whoever took the most daily wins that month. Days
  neither of them touched are left out of the tally as well as off the grid.
- **[v1]** The month also shows the current shared streak and how the previous month went.

## 7. Look and feel

- **[v1]** Direction **D · Bold Modern**, chosen by the captain on the design board.
  Electric rose and violet on warm paper, 2px black outlines, hard offset shadows that
  never blur, flat fills, uppercase micro-labels and very large numbers.
- **[v1]** **Rose is always you, violet is always your partner.** On every screen, without
  exception, and neither colour is used for anything else.
- **[v1]** Every colour, font, radius and shadow lives in `src/app/tokens.css` as a design
  token. No component hard-codes one.
- **[v1]** Phone and desktop share one component set: a bottom tab bar becomes a left
  sidebar, and the day list is the same list with room around it.
- **[later]** Motion and illustration.

## 8. Out of scope for v1

- Reminders and notifications (push or email).
- Photo proof of a completed task.

## 9. Stack and hosting

- **[v1]** Next.js (App Router, TypeScript) and Supabase (Postgres, Auth, Row Level
  Security), both on free tiers.
- **[v1]** Runs locally against the Supabase CLI stack. See the README.
- **[v1]** A daily GitHub Actions job settles days, expires proposals and purges couples
  past their grace period. It also keeps a free-tier Supabase project from pausing after a
  week of inactivity, which is a side effect rather than its purpose.
- **[later]** Going live is a separate decision. The free Supabase tier is far more than
  two people need: the largest table grows by roughly 2 MB a year against a 500 MB limit.

## 10. Still open

- **The 'Us' tab.** It is in the navigation on every design mockup but its contents were
  never decided, so it ships as a disabled placeholder. This is a captain decision, not an
  oversight.

---

## Data model at a glance

| Table | Holds |
| --- | --- |
| `profiles` | One row per account; display name. Created automatically on sign-up. |
| `couples` | The pair, their shared time zone, and unlink / purge state. |
| `couple_members` | Who is in which couple. A unique index allows one active couple per user. |
| `invite_codes` | Codes handed out for linking, with expiry and redemption. |
| `tasks` | **Approved** tasks only. Soft-archived, never hard-deleted by the app. |
| `task_proposals` | Creates, edits and deletions waiting for the partner. |
| `task_completions` | One row per task, per partner, per couple-local date. |
| `day_results` | One settled day: the scores, the winner (NULL for no winner), and whether both cleared it. Written once. |
| `completion_challenges` | One partner questioning the other's log, before the day closes. |

Rules that live in the database rather than the app:

- `current_couple_id()` — the caller's active couple; every couple-scoped RLS policy
  hangs off it.
- `couple_active_date()` / `couple_day_closes_at()` — where a day starts and stops, given
  the agreed end-of-day time. Everything that touches a date goes through these.
- `settle_day()` / `settle_due_days()` / `settle_all_due_days()` — closing out a day, once.
- `raise_challenge()` / `concede_challenge()` / `stand_by_log()` / `withdraw_challenge()`.
- `generate_invite_code()` / `peek_invite_code()` / `redeem_invite_code()` — linking.
- `propose_task()` / `propose_task_edit()` / `propose_task_delete()` — proposals.
- `approve_proposal()` / `reject_proposal()` / `cancel_proposal()` — decisions, with the
  "you cannot approve your own" rule.
- `expire_stale_proposals()` — the 7-day window. Called on every proposal read, so the
  rule holds even with no scheduled job.
- `set_completion()` — logging, as the caller, limited to their own rows by RLS.
- `request_unlink()` / `restore_link()` / `purge_expired_couples()` — unlink lifecycle.

`src/lib/proposals.ts`, `src/lib/invite-code.ts` and `src/lib/schedule.ts` mirror the
same rules in TypeScript so the UI can show the right buttons and wording without a
round trip. **The database is the authority**; those modules exist for the interface.
Both sides are tested — the TypeScript with Vitest, the SQL with
`tests/db/rules.test.sql`.
