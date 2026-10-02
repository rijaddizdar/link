'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from './supabase/server';
import { normalizeInviteCode } from './invite-code';
import { TASK_COLORS, type IsoWeekday, type TaskColor, type TaskDraft } from './types';

/** Every form action returns this shape; `error` is shown next to the form. */
export type ActionResult = { error: string | null };

const ok: ActionResult = { error: null };

function fail(error: unknown, fallback: string): ActionResult {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : fallback;
  return { error: message || fallback };
}

function refreshAll() {
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signUp(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '').trim();

  if (!email || !password) return { error: 'Email and password are both needed.' };
  if (password.length < 6) return { error: 'Use at least 6 characters for the password.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split('@')[0] } },
  });
  if (error) return fail(error, 'Could not create that account.');

  refreshAll();
  redirect('/');
}

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'That email and password do not match an account.' };

  refreshAll();
  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  refreshAll();
  redirect('/login');
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

export async function generateInviteCodeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const timeZone = String(formData.get('time_zone') ?? '').trim() || 'UTC';
  const dayEndTime = String(formData.get('day_end_time') ?? '').trim() || '21:00';

  const supabase = await createClient();
  const { error } = await supabase.rpc('generate_invite_code', {
    p_time_zone: timeZone,
    p_day_end_time: dayEndTime,
  });
  if (error) return fail(error, 'Could not create a code.');

  refreshAll();
  return ok;
}

/**
 * Moving the shared end-of-day time needs both partners, so this goes through
 * the same approval flow as a task change rather than writing to the couple.
 */
export async function proposeDayEndTimeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const dayEndTime = String(formData.get('day_end_time') ?? '').trim();
  if (!/^\d{2}:\d{2}/.test(dayEndTime)) return { error: 'Pick a time for the day to end.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('propose_day_end_time', {
    p_day_end_time: dayEndTime,
    p_note: String(formData.get('note') ?? '').slice(0, 500),
  });
  if (error) return fail(error, 'Could not send that change.');

  refreshAll();
  redirect('/proposals?sent=1');
}

export async function redeemInviteCodeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const code = normalizeInviteCode(String(formData.get('code') ?? ''));
  if (!code) return { error: 'Enter the code your partner shared with you.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('redeem_invite_code', { p_code: code });
  if (error) return fail(error, 'Could not use that code.');

  refreshAll();
  redirect('/');
}

export async function setTimeZoneAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const timeZone = String(formData.get('time_zone') ?? '').trim();
  const coupleId = String(formData.get('couple_id') ?? '');
  if (!timeZone || !coupleId) return { error: 'Pick a time zone.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('couples')
    .update({ time_zone: timeZone })
    .eq('id', coupleId);
  if (error) return fail(error, 'Could not change the time zone.');

  refreshAll();
  return ok;
}

export async function unlinkAction(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('request_unlink');
  if (error) return fail(error, 'Could not unlink.');

  refreshAll();
  redirect('/link');
}

export async function restoreLinkAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const coupleId = String(formData.get('couple_id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_link', { p_couple_id: coupleId });
  if (error) return fail(error, 'Could not restore the link.');

  refreshAll();
  redirect('/');
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function isTaskColor(value: string): value is TaskColor {
  return (TASK_COLORS as readonly string[]).includes(value);
}

/** Turns the task form into a payload the database will accept. */
function readTaskDraft(formData: FormData): TaskDraft | { error: string } {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { error: 'Give the task a title.' };
  if (title.length > 120) return { error: 'Keep the title under 120 characters.' };

  const scheduleKind = String(formData.get('schedule_kind') ?? 'daily');
  if (!['daily', 'weekdays', 'once'].includes(scheduleKind)) {
    return { error: 'Pick how often this repeats.' };
  }

  const weekdays = formData
    .getAll('weekdays')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7) as IsoWeekday[];

  if (scheduleKind === 'weekdays' && weekdays.length === 0) {
    return { error: 'Pick at least one weekday.' };
  }

  const dueDate = String(formData.get('due_date') ?? '').trim() || null;
  if (scheduleKind === 'once' && !dueDate) return { error: 'Pick a date for a one-time task.' };

  const rawTarget = String(formData.get('target_count') ?? '').trim();
  let targetCount: number | null = null;
  if (rawTarget) {
    const parsed = Number(rawTarget);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      return { error: 'A target has to be a whole number between 1 and 10000.' };
    }
    targetCount = parsed;
  }

  const color = String(formData.get('color') ?? 'blush');

  return {
    title,
    description: String(formData.get('description') ?? '').slice(0, 2000),
    emoji: String(formData.get('emoji') ?? '').trim() || '💞',
    color: isTaskColor(color) ? color : 'blush',
    schedule_kind: scheduleKind as TaskDraft['schedule_kind'],
    weekdays: scheduleKind === 'weekdays' ? weekdays : [],
    due_date: scheduleKind === 'once' ? dueDate : null,
    target_count: targetCount,
  };
}

export async function proposeTaskAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const draft = readTaskDraft(formData);
  if ('error' in draft) return { error: draft.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc('propose_task', {
    p_payload: draft,
    p_note: String(formData.get('note') ?? '').slice(0, 500),
  });
  if (error) return fail(error, 'Could not send that to your partner.');

  refreshAll();
  redirect('/proposals?sent=1');
}

export async function proposeTaskEditAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const taskId = String(formData.get('task_id') ?? '');
  const draft = readTaskDraft(formData);
  if ('error' in draft) return { error: draft.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc('propose_task_edit', {
    p_task_id: taskId,
    p_payload: draft,
    p_note: String(formData.get('note') ?? '').slice(0, 500),
  });
  if (error) return fail(error, 'Could not send that change.');

  refreshAll();
  redirect('/proposals?sent=1');
}

export async function proposeTaskDeleteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const taskId = String(formData.get('task_id') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.rpc('propose_task_delete', {
    p_task_id: taskId,
    p_note: String(formData.get('note') ?? '').slice(0, 500),
  });
  if (error) return fail(error, 'Could not send that removal.');

  refreshAll();
  redirect('/proposals?sent=1');
}

// ---------------------------------------------------------------------------
// Proposal decisions
// ---------------------------------------------------------------------------

async function resolveProposal(
  rpc: 'approve_proposal' | 'reject_proposal' | 'cancel_proposal',
  formData: FormData,
  fallback: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_id: String(formData.get('proposal_id') ?? '') });
  if (error) return fail(error, fallback);
  refreshAll();
  return ok;
}

export async function approveProposalAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return resolveProposal('approve_proposal', formData, 'Could not approve that.');
}

export async function rejectProposalAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return resolveProposal('reject_proposal', formData, 'Could not decline that.');
}

export async function cancelProposalAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return resolveProposal('cancel_proposal', formData, 'Could not withdraw that.');
}

// ---------------------------------------------------------------------------
// Completion logging
// ---------------------------------------------------------------------------

export async function setCompletionAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const taskId = String(formData.get('task_id') ?? '');
  const count = Number(formData.get('count') ?? 0);
  const localDate = String(formData.get('local_date') ?? '').trim() || null;

  if (!Number.isInteger(count) || count < 0) return { error: 'That count is not valid.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_completion', {
    p_task_id: taskId,
    p_count: count,
    p_local_date: localDate,
  });
  if (error) return fail(error, 'Could not save that.');

  refreshAll();
  return ok;
}


// ---------------------------------------------------------------------------
// Challenges
//
// Logs are trusted, so asking about one never removes it. Only the partner who
// logged it can clear it, by conceding.
// ---------------------------------------------------------------------------

export async function raiseChallengeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('raise_challenge', {
    p_task_id: String(formData.get('task_id') ?? ''),
    p_local_date: String(formData.get('local_date') ?? ''),
    p_reason: String(formData.get('reason') ?? '').slice(0, 500),
  });
  if (error) return fail(error, 'Could not ask about that.');
  refreshAll();
  return ok;
}

async function resolveChallenge(
  rpc: 'concede_challenge' | 'stand_by_log' | 'withdraw_challenge',
  formData: FormData,
  fallback: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, {
    p_id: String(formData.get('challenge_id') ?? ''),
  });
  if (error) return fail(error, fallback);
  refreshAll();
  return ok;
}

export async function concedeChallengeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return resolveChallenge('concede_challenge', formData, 'Could not clear that log.');
}

export async function standByLogAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return resolveChallenge('stand_by_log', formData, 'Could not keep that log.');
}

export async function withdrawChallengeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return resolveChallenge('withdraw_challenge', formData, 'Could not take that back.');
}
