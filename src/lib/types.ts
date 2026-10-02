/** Shapes shared between the database, the server actions and the UI. */

export const TASK_COLORS = [
  'blush',
  'coral',
  'plum',
  'rose',
  'berry',
  'peach',
  'lilac',
  'mint',
] as const;

export type TaskColor = (typeof TASK_COLORS)[number];

export type ScheduleKind = 'daily' | 'weekdays' | 'once';

/** 'day_end' is the couple's shared end-of-day time, not a task. */
export type ProposalKind = 'create' | 'edit' | 'delete' | 'day_end';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

/** ISO weekday: 1 = Monday … 7 = Sunday, matching Postgres `isodow`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

/** The task fields a partner can customise. Carried verbatim in a proposal payload. */
export type TaskDraft = {
  title: string;
  description: string;
  emoji: string;
  color: TaskColor;
  schedule_kind: ScheduleKind;
  /** Only meaningful when schedule_kind is 'weekdays'. */
  weekdays: IsoWeekday[];
  /** Couple-local ISO date (YYYY-MM-DD); only when schedule_kind is 'once'. */
  due_date: string | null;
  /** Optional numeric goal, e.g. 8 glasses of water. null = simple done/not-done. */
  target_count: number | null;
};

export type Task = TaskDraft & {
  id: string;
  couple_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type TaskProposal = {
  id: string;
  couple_id: string;
  task_id: string | null;
  kind: ProposalKind;
  /** Task fields for create/edit; `{ day_end_time }` for a 'day_end' proposal. */
  payload: Partial<TaskDraft> & { day_end_time?: string };
  note: string;
  proposed_by: string;
  created_at: string;
  expires_at: string;
  status: ProposalStatus;
  resolved_by: string | null;
  resolved_at: string | null;
};

export type TaskCompletion = {
  id: string;
  task_id: string;
  user_id: string;
  local_date: string;
  count: number;
  completed_at: string;
};

/**
 * One settled day. Written once the day's end time has passed and never
 * recomputed, so a later edit to the task list cannot rewrite history.
 */
export type DayResult = {
  couple_id: string;
  local_date: string;
  /** How many tasks were scheduled that day. */
  scheduled_count: number;
  /** user id → how many of them that partner finished. */
  scores: Record<string, number>;
  /** null means a tie — the shared heart. */
  winner_user_id: string | null;
  /** Both partners finished everything scheduled. What a streak day is. */
  both_complete: boolean;
  settled_at: string;
};

export type ChallengeStatus = 'open' | 'withdrawn' | 'conceded' | 'stood_by';

/**
 * One partner questioning the other's log for a day. Logs are trusted, so a
 * challenge never removes one by itself — only the person who logged it can.
 */
export type CompletionChallenge = {
  id: string;
  couple_id: string;
  task_id: string;
  /** Whose log is being questioned. */
  challenged_user_id: string;
  local_date: string;
  raised_by: string;
  reason: string;
  status: ChallengeStatus;
  created_at: string;
  resolved_at: string | null;
};

export type Profile = {
  id: string;
  display_name: string;
};

export type Couple = {
  id: string;
  time_zone: string;
  /** "HH:MM:SS" — the one time both partners agreed a day closes. */
  day_end_time: string;
  unlinked_at: string | null;
  unlinked_by: string | null;
  purge_after: string | null;
};

/** One task as the side-by-side view needs it: the same task, two columns. */
export type TaskWithProgress = {
  task: Task;
  mine: TaskCompletion | null;
  theirs: TaskCompletion | null;
};
