# Link — v1 product spec

Link is a web app for couples. Two people link their accounts with a code, keep one
shared list of tasks, and each log their own day against it.

This document records the agreed v1 spec and marks what the first PR
(`fm/link-foundation`) implements and what is deliberately left for later.

Legend: **[v1]** shipped in this PR · **[later]** designed for, not built yet.

---

## 1. Accounts and linking

- **[v1]** Each person has their own account (email and password, via Supabase Auth).
  There is no shared login.
- **[v1]** One partner asks the site for a code and shares it however they like. The
  other enters it and the two accounts are linked. A code is 8 characters from an
  alphabet that leaves out `0 O 1 I L`, so it survives being read aloud, and it can be
  typed in any casing with or without separators.
- **[v1]** A code works for 7 days, can be used once, and cannot be redeemed by the
  person who created it. Making a new code revokes the previous unused one.
- **[v1]** The couple's **time zone is set at linking**, by whoever generates the code.
  It decides when a day starts and ends for both partners, wherever either of them is.
  Either partner can change it afterwards in Settings.
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

## 5. Daily competition — **[later]**

Not built in this PR. The data model is already shaped for it.

- The couple sets the time of day a day ends.
- At that moment the partner who completed more of **that day's scheduled** tasks wins
  the day. Equal counts are a tie, shown as a shared heart.
- Logs are trusted. Either partner can **challenge** one of the other's logs before the
  day ends.
- A **shared streak** counts consecutive days on which both partners finished
  everything scheduled.

What already exists for it: `tasks.schedule_kind` / `weekdays` / `due_date` say what was
scheduled on a given day, and `task_completions` is keyed by
`(task_id, user_id, local_date)` with `local_date` in the couple's own time zone — so a
day's score is a group-by over one index, with no backfill needed.

What it still needs: a `day_end_time` on `couples`, a challenge table, and a stored
per-day result (or a view) for streaks.

## 6. Calendar tab — **[later]**

Not built in this PR.

- A month calendar showing each day's winner, or a tie.
- The monthly winner is whoever took the most daily wins that month.

## 7. Look and feel

- **[v1]** Fun but romantic: warm pinks, corals and plums.
- **[v1]** Every colour, font, radius and shadow lives in `src/app/tokens.css` as a
  design token. No component hard-codes a colour. The final visual direction is being
  chosen separately, so that one file can be swapped wholesale without touching a
  component.
- **[later]** Full visual polish, motion, and illustration.

## 8. Out of scope for v1

- Reminders and notifications (push or email).
- Photo proof of a completed task.

## 9. Stack and hosting

- **[v1]** Next.js (App Router, TypeScript) and Supabase (Postgres, Auth, Row Level
  Security), both on free tiers.
- **[v1]** Runs locally against the Supabase CLI stack. See the README.
- **[later]** Going live is a separate decision and is not part of this PR.

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

Rules that live in the database rather than the app:

- `current_couple_id()` — the caller's active couple; every couple-scoped RLS policy
  hangs off it.
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
