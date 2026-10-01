/**
 * Which tasks count for a given day, and when a day's log counts as done.
 *
 * Everything here works in the *couple's* local date: both partners see the same
 * day boundary wherever they are. Daily scoring and the calendar (a later PR)
 * group completions by exactly this date.
 */

import type { IsoWeekday, Task, TaskCompletion, TaskDraft } from './types';

/**
 * Today's date in the couple's time zone, as YYYY-MM-DD.
 * Mirrors `public.couple_local_date()`.
 */
export function coupleLocalDate(timeZone: string, at: Date = new Date()): string {
  // en-CA gives ISO-ordered parts, so this is a YYYY-MM-DD string already.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekdayOf(localDate: string): IsoWeekday {
  // Parsed as UTC so the result never shifts with the server's own zone.
  const day = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

export function isScheduledOn(
  task: Pick<TaskDraft, 'schedule_kind' | 'weekdays' | 'due_date'>,
  localDate: string,
): boolean {
  switch (task.schedule_kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return task.weekdays.includes(isoWeekdayOf(localDate));
    case 'once':
      return task.due_date === localDate;
  }
}

/** Tasks scheduled for `localDate`, archived ones excluded. */
export function tasksScheduledOn(tasks: Task[], localDate: string): Task[] {
  return tasks.filter((task) => task.archived_at === null && isScheduledOn(task, localDate));
}

/** How much counts as finished: the target, or just 1 for a simple task. */
export function requiredCount(task: Pick<TaskDraft, 'target_count'>): number {
  return task.target_count ?? 1;
}

export function loggedCount(completion: Pick<TaskCompletion, 'count'> | null): number {
  return completion?.count ?? 0;
}

export function isDone(
  task: Pick<TaskDraft, 'target_count'>,
  completion: Pick<TaskCompletion, 'count'> | null,
): boolean {
  return loggedCount(completion) >= requiredCount(task);
}

/** 0–1, for the progress bar on a task with a numeric target. */
export function progressFraction(
  task: Pick<TaskDraft, 'target_count'>,
  completion: Pick<TaskCompletion, 'count'> | null,
): number {
  const required = requiredCount(task);
  if (required <= 0) return 1;
  return Math.min(1, loggedCount(completion) / required);
}

export function scheduleLabel(
  task: Pick<TaskDraft, 'schedule_kind' | 'weekdays' | 'due_date'>,
  weekdayLabels: Record<IsoWeekday, string>,
): string {
  switch (task.schedule_kind) {
    case 'daily':
      return 'Every day';
    case 'weekdays': {
      const sorted = [...task.weekdays].sort((a, b) => a - b);
      if (sorted.length === 7) return 'Every day';
      return sorted.map((day) => weekdayLabels[day]).join(', ');
    }
    case 'once':
      return task.due_date ? `Once, on ${task.due_date}` : 'Once';
  }
}
