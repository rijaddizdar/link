import { createClient } from './supabase/server';
import { coupleLocalDate, tasksScheduledOn } from './schedule';
import type {
  Couple,
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
  /** Today in the couple's time zone, YYYY-MM-DD. */
  today: string;
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

  return {
    couple,
    me: session.profile,
    partner,
    today: coupleLocalDate(couple.time_zone),
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
