/**
 * The daily competition.
 *
 * At the couple's agreed end-of-day time the day closes and whoever finished
 * more of that day's *scheduled* tasks wins it. Equal counts are a tie, which
 * the design shows as a shared heart rather than a loss for either of them.
 *
 * A shared streak counts days on which they both finished everything.
 *
 * The database settles each day once, in `settle_day()`, and never recomputes
 * it — editing the task list later must not rewrite who won last Tuesday. These
 * functions are the same rules in TypeScript, for the screens that have to
 * explain a result.
 */

import { isDone, tasksScheduledOn } from './schedule';
import type { DayResult, Task, TaskCompletion } from './types';

export type DayScore = {
  scheduledCount: number;
  scores: Record<string, number>;
  /** null means a tie, including a tie at nothing done. */
  winnerUserId: string | null;
  bothComplete: boolean;
};

/** Scores one day from the raw tasks and logs. Mirrors `settle_day()`. */
export function scoreDay(
  tasks: Task[],
  completions: TaskCompletion[],
  userIds: string[],
  localDate: string,
): DayScore {
  const scheduled = tasksScheduledOn(tasks, localDate);

  const scores: Record<string, number> = {};
  for (const userId of userIds) {
    scores[userId] = scheduled.filter((task) =>
      isDone(
        task,
        completions.find(
          (c) => c.task_id === task.id && c.user_id === userId && c.local_date === localDate,
        ) ?? null,
      ),
    ).length;
  }

  const best = Math.max(...userIds.map((id) => scores[id] ?? 0), 0);
  const leaders = userIds.filter((id) => (scores[id] ?? 0) === best);

  return {
    scheduledCount: scheduled.length,
    scores,
    // One clear leader wins; anything else — including both on nothing — is a tie.
    winnerUserId: leaders.length === 1 && best > 0 ? leaders[0] : null,
    bothComplete:
      scheduled.length > 0 && userIds.every((id) => (scores[id] ?? 0) === scheduled.length),
  };
}

export function isTie(result: Pick<DayResult, 'winner_user_id'>): boolean {
  return result.winner_user_id === null;
}

/**
 * How a settled day reads.
 *
 * The database records "no winner" for both a genuine tie and a day neither of
 * them touched, because at the data level they are the same thing. They are not
 * the same thing to look at: a tie is a shared heart, a day nobody finished is
 * just a day nobody finished, and showing that as a celebration would be a lie.
 */
export type DayOutcome = 'won' | 'lost' | 'tie' | 'nobody';

export function dayOutcome(
  result: Pick<DayResult, 'winner_user_id' | 'scores'>,
  viewerUserId: string,
): DayOutcome {
  if (result.winner_user_id === viewerUserId) return 'won';
  if (result.winner_user_id !== null) return 'lost';
  const best = Math.max(0, ...Object.values(result.scores));
  return best > 0 ? 'tie' : 'nobody';
}

/** By how many tasks the day was won. 0 on a tie. */
export function winMargin(result: Pick<DayResult, 'scores' | 'winner_user_id'>): number {
  if (result.winner_user_id === null) return 0;
  const values = Object.values(result.scores);
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[0] - sorted[1];
}

/**
 * The shared streak: consecutive days, counting back from the most recently
 * settled one, where both partners finished everything.
 *
 * A day with nothing scheduled neither adds to the streak nor breaks it — there
 * was nothing to finish, so it should not punish them.
 */
export function sharedStreak(results: DayResult[]): number {
  const byDateDesc = [...results].sort((a, b) => b.local_date.localeCompare(a.local_date));

  let streak = 0;
  for (const result of byDateDesc) {
    if (result.scheduled_count === 0) continue;
    if (!result.both_complete) break;
    streak += 1;
  }
  return streak;
}

export type MonthTally = {
  /** user id → days won that month. */
  wins: Record<string, number>;
  ties: number;
  /** Most daily wins takes the month; null while it is level. */
  leaderUserId: string | null;
  settledDays: number;
};

/** Who is ahead this month. The month goes to whoever won the most days in it. */
export function tallyMonth(
  results: DayResult[],
  userIds: string[],
  month: string,
): MonthTally {
  const wins: Record<string, number> = Object.fromEntries(userIds.map((id) => [id, 0]));
  let ties = 0;
  let settledDays = 0;

  for (const result of results) {
    if (!result.local_date.startsWith(month)) continue;
    settledDays += 1;
    if (result.winner_user_id === null) ties += 1;
    else wins[result.winner_user_id] = (wins[result.winner_user_id] ?? 0) + 1;
  }

  const best = Math.max(...userIds.map((id) => wins[id] ?? 0), 0);
  const leaders = userIds.filter((id) => (wins[id] ?? 0) === best);

  return {
    wins,
    ties,
    leaderUserId: leaders.length === 1 && best > 0 ? leaders[0] : null,
    settledDays,
  };
}

/** "YYYY-MM" of a YYYY-MM-DD date. */
export function monthOf(localDate: string): string {
  return localDate.slice(0, 7);
}

/** Every date in a month, as YYYY-MM-DD, for drawing the calendar grid. */
export function datesInMonth(month: string): string[] {
  const [year, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  );
}

/**
 * How many blank cells the month grid needs before its first day, so the
 * calendar starts on a Monday.
 */
export function leadingBlanks(month: string): number {
  const first = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  return (first === 0 ? 7 : first) - 1;
}
