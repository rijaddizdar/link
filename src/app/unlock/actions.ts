'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  GATE_COOKIE,
  GATE_MAX_AGE_SECONDS,
  gateToken,
  passwordMatches,
  safeNext,
  sitePassword,
} from '@/lib/gate';

export type UnlockResult = { error: string | null };

/**
 * Checks the shared password and, if it is right, remembers this device for as
 * long as a browser allows. The cookie holds a token derived from the password,
 * never the password itself.
 */
export async function unlockAction(
  _prev: UnlockResult,
  formData: FormData,
): Promise<UnlockResult> {
  const password = sitePassword();
  if (!password) {
    return { error: 'The site password has not been set up yet.' };
  }

  const attempt = String(formData.get('password') ?? '');
  const next = safeNext(String(formData.get('next') ?? ''));

  if (!(await passwordMatches(attempt, password))) {
    // A pause on every wrong guess. Not real brute-force protection — there is
    // nowhere to count attempts — but it makes guessing slow and tedious.
    await new Promise((resolve) => setTimeout(resolve, 750));
    return { error: "That's not it." };
  }

  (await cookies()).set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GATE_MAX_AGE_SECONDS,
  });

  redirect(next);
}
