import { createClient } from './supabase/server';
import { tasksScheduledOn } from './schedule';
import { activeLocalDate, addDays, msUntilDayCloses } from './day';
import type {
  CompletionChallenge,
  Couple,
  DayResult,
  Profile,
  Task,
  TaskCompletion,
  TaskProposal,
  TaskWithProgress,
} from './types';

export type Session = {
  userId: string;
  email: string;
  profile: Profile;
};

/** The signed-in user, or null. */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? '',
    profile: profile ?? { id: user.id, display_name: user.email?.split('@')[0] ?? 'You' },
  };
}

export type CoupleContext = {
  couple: Couple;
  me: Profile;
  partner: Profile | null;
  /**
   * The day the couple is logging into right now. The agreed end-of-day time,
   * not midnight, is the rollover — so this can already be tomorrow's date.
   */
  activeDate: string;
  /** How long is left before the current day closes. */
  msLeft: number;
};

/**
 * The couple the user is in, or null when they are not linked yet. Also returns
 * an unlinked couple still inside its grace window, so the "undo" screen works.
 */
export async function getCoupleContext(session: Session): Promise<CoupleContext | null> {
  const supabase = await createClient();

  const { data: couples } = await supabase
    .from('couples')
    .select('id, time_zone, day_end_time, unlinked_at, unlinked_by, purge_after')
    .order('created_at', { ascending: false });

  const couple = couples?.[0];
  if (!couple) return null;

  const { data: members } = await supabase
    .from('couple_members')
    .select('user_id, left_at')
    .eq('couple_id', couple.id);

  const partnerId =
    members?.find((member) => member.user_id !== session.userId)?.user_id ?? null;

  let partner: Profile | null = null;
  if (partnerId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', partnerId)
      .maybeSingle();
    partner = data ?? null;
  }

  const activeDate = activeLocalDate(couple.time_zone, couple.day_end_time);

  return {
    couple,
    me: session.profile,
    partner,
    activeDate,
    msLeft: msUntilDayCloses(couple.time_zone, couple.day_end_time, activeDate),
  };
}

/** True once both partners are in and the link is live. */
export function isLinked(context: CoupleContext | null): boolean {
  return context !== null && context.couple.unlinked_at === null && context.partner !== null;
}

export async function getTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  return (data ?? []) as Task[];
}

export async function getCompletions(localDate: string): Promise<TaskCompletion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('task_completions')
    .select('id, task_id, user_id, local_date, count, completed_at')
    .eq('local_date', localDate);
  return (data ?? []) as TaskCompletion[];
}

/**
 * The side-by-side view: every task scheduled for `localDate`, each carrying my
 * log and my partner's log for that day.
 */
export async function getDayBoard(
  context: CoupleContext,
  localDate: string,
): Promise<TaskWithProgress[]> {
  const [tasks, completions] = await Promise.all([getTasks(), getCompletions(localDate)]);
  const scheduled = tasksScheduledOn(tasks, localDate);
  const partnerId = context.partner?.id ?? null;

  return scheduled.map((task) => ({
    task,
    mine: completions.find((c) => c.task_id === task.id && c.user_id === context.me.id) ?? null,
    theirs:
      (partnerId
        ? completions.find((c) => c.task_id === task.id && c.user_id === partnerId)
        : null) ?? null,
  }));
}

/**
 * All proposals, newest first. Asks the database to expire stale ones first so
 * the 7-day window is applied even if no scheduled job is running.
 */
export async function getProposals(): Promise<TaskProposal[]> {
  const supabase = await createClient();
  await supabase.rpc('expire_stale_proposals');
  const { data } = await supabase
    .from('task_proposals')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as TaskProposal[];
}


/**
 * Settles every day that has closed since anyone last looked. Called before any
 * screen that shows results, so the app is correct with no scheduled job at all;
 * the job in .github/workflows is only a backstop.
 */
export async function settleDueDays(coupleId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('settle_due_days', { p_couple_id: coupleId, p_max_days: 60 });
}

export async function getDayResults(from: string, to: string): Promise<DayResult[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('day_results')
    .select('*')
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: false });
  return (data ?? []) as DayResult[];
}

export async function getDayResult(localDate: string): Promise<DayResult | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('day_results')
    .select('*')
    .eq('local_date', localDate)
    .maybeSingle();
  return (data as DayResult | null) ?? null;
}

/** The most recent settled day, for the "yesterday finished" card on Today. */
export async function getLatestDayResult(): Promise<DayResult | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('day_results')
    .select('*')
    .order('local_date', { ascending: false })
    .limit(1);
  return (data?.[0] as DayResult | undefined) ?? null;
}

/** Enough history for the streak to be counted without loading everything. */
export async function getRecentDayResults(activeDate: string): Promise<DayResult[]> {
  return getDayResults(addDays(activeDate, -400), activeDate);
}

export async function getChallenges(localDate: string): Promise<CompletionChallenge[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('completion_challenges')
    .select('*')
    .eq('local_date', localDate)
    .order('created_at', { ascending: false });
  return (data ?? []) as CompletionChallenge[];
}
