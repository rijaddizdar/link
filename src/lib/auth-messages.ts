/**
 * What to tell someone when signing up or in does not work.
 *
 * The rule: never hide the real reason. A wrong password gets the usual polite
 * message, but anything else — a misconfigured server, an unconfirmed email —
 * is passed through, because "wrong password" for a problem that is not a wrong
 * password sends people looking in completely the wrong place.
 */

/** Supabase's answer when the email/password pair is simply wrong. */
const WRONG_CREDENTIALS = /invalid login credentials/i;
const EMAIL_NOT_CONFIRMED = /email not confirmed/i;

export const EMAIL_CONFIRMATION_REQUIRED =
  'Your account was created, but Supabase is waiting for you to confirm your email before you can sign in. ' +
  "To skip that, turn off 'Confirm email' in Supabase (Authentication → Sign In / Providers → Email), " +
  'delete this account under Authentication → Users, and sign up again.';

export function signInErrorMessage(message: string | null | undefined): string {
  const text = (message ?? '').trim();
  if (!text || WRONG_CREDENTIALS.test(text)) {
    return 'That email and password do not match an account.';
  }
  if (EMAIL_NOT_CONFIRMED.test(text)) {
    return EMAIL_CONFIRMATION_REQUIRED;
  }
  return `Could not sign in: ${text}`;
}
