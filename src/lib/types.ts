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

export type ProposalKind = 'create' | 'edit' | 'delete';

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
  payload: Partial<TaskDraft>;
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

export type Profile = {
  id: string;
  display_name: string;
};

export type Couple = {
  id: string;
  time_zone: string;
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
