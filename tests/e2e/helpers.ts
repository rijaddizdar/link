import { expect, type Page } from '@playwright/test';

/** A fresh email per run, so repeated runs do not collide in the local auth table. */
export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.test`;
}

export const PASSWORD = 'link-test-password';

export async function createAccount(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  // A brand new account has no partner, so it lands on the linking screen.
  await expect(page.getByRole('heading', { name: 'Link up' })).toBeVisible();
}

/**
 * Proposes a task and has the partner approve it, returning only once the task
 * is actually on the shared list. Clicking Approve is not enough on its own —
 * the row does not exist until the server action has finished.
 */
export async function agreeTask(
  proposer: Page,
  approver: Page,
  title: string,
  partnerName: string,
): Promise<void> {
  await proposer.goto('/tasks/new');
  await proposer.getByLabel('Name').fill(title);
  await proposer.getByRole('button', { name: `Send to ${partnerName}` }).click();

  await approver.goto('/proposals');
  await approver
    .locator('[data-testid="proposal-card"]', { hasText: title })
    .getByRole('button', { name: 'Approve' })
    .click();

  await approver.goto('/tasks');
  await expect(approver.getByText(title)).toBeVisible();
}

export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).last().click();
}

// ---------------------------------------------------------------------------
// Seeding history
//
// The competition only shows anything once a day has closed, so these tests have
// to put a closed day behind the couple. That is done through Supabase's
// service_role key, which bypasses Row Level Security — the same way the
// maintenance job reaches the database.
//
// The key is read from the running local stack rather than committed anywhere.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let cachedKey: string | null = null;

function supabaseBinary(): string {
  const local = join(homedir(), '.local', 'bin', 'supabase');
  return existsSync(local) ? local : 'supabase';
}

export function serviceRoleKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (cachedKey) return cachedKey;

  const output = execFileSync(supabaseBinary(), ['status'], { encoding: 'utf8' });
  const line = output
    .trim()
    .split('\n')
    .reverse()
    .find((candidate) => candidate.trim().startsWith('{'));
  if (!line) throw new Error('Could not read `supabase status` — is the local stack running?');

  cachedKey = JSON.parse(line).SERVICE_ROLE_KEY as string;
  return cachedKey;
}

const REST = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

async function admin(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const key = serviceRoleKey();
  const response = await fetch(`${REST}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

export type SeedTarget = {
  coupleId: string;
  userIds: string[];
  taskIds: string[];
};

/** Reads back the couple the given task list belongs to. */
export async function readCouple(): Promise<SeedTarget> {
  const couples = (await admin('couples?select=id&order=created_at.desc&limit=1')) as {
    id: string;
  }[];
  const coupleId = couples[0].id;

  const members = (await admin(
    `couple_members?select=user_id&couple_id=eq.${coupleId}&left_at=is.null`,
  )) as { user_id: string }[];

  const tasks = (await admin(
    `tasks?select=id&couple_id=eq.${coupleId}&archived_at=is.null&order=created_at.asc`,
  )) as { id: string }[];

  return {
    coupleId,
    userIds: members.map((m) => m.user_id),
    taskIds: tasks.map((t) => t.id),
  };
}

/** Moves the couple's start date back, so earlier days are theirs to settle. */
export async function backdateCouple(coupleId: string, days: number): Promise<void> {
  await admin(`couples?id=eq.${coupleId}`, {
    method: 'PATCH',
    body: JSON.stringify({ created_at: new Date(Date.now() - days * 86_400_000).toISOString() }),
  });
}

/** Writes a completion straight in, for a day that has already closed. */
export async function seedCompletion(
  coupleId: string,
  taskId: string,
  userId: string,
  localDate: string,
  count = 1,
): Promise<void> {
  await admin('task_completions?on_conflict=task_id,user_id,local_date', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      couple_id: coupleId,
      task_id: taskId,
      user_id: userId,
      local_date: localDate,
      count,
    }),
  });
}

/** The couple's own idea of what day it is, and the day before it. */
export async function coupleDates(coupleId: string): Promise<{ active: string; yesterday: string }> {
  const active = (await admin('rpc/couple_active_date', {
    method: 'POST',
    body: JSON.stringify({ p_couple_id: coupleId }),
  })) as string;

  const yesterday = new Date(`${active}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  return { active, yesterday: yesterday.toISOString().slice(0, 10) };
}
