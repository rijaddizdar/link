/**
 * The site gate: one shared password in front of the whole site, so only the
 * two of you can even reach the sign-in page.
 *
 * The password itself never leaves the server and never goes in the repo — it is
 * read from the SITE_PASSWORD environment variable. What the browser keeps is a
 * cookie holding an HMAC derived from the password, so:
 *
 *   * the cookie cannot be turned back into the password,
 *   * it cannot be forged without knowing the password,
 *   * changing the password changes the token, which locks every device out
 *     until the new one is entered.
 *
 * Everything here uses Web Crypto, so the same code runs in the middleware
 * (Edge runtime) and in the unlock server action (Node).
 */

export const GATE_COOKIE = 'link_gate';

/** Browsers cap a cookie's lifetime at 400 days, so that is the longest "remember me". */
export const GATE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const encoder = new TextEncoder();

/** The site password from the environment, or null when it has not been set up. */
export function sitePassword(): string | null {
  const value = process.env.SITE_PASSWORD?.trim();
  return value ? value : null;
}

/** The value the gate cookie holds for a given password. 64 hex characters. */
export async function gateToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('link-site-gate-v1'));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares two strings without bailing out at the first difference, so the time
 * it takes does not hint at how much of a guess was right.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * Whether a request's gate cookie is good. With no password configured nothing
 * is ever unlocked: the site fails closed rather than open.
 */
export async function isUnlocked(
  cookieValue: string | undefined,
  password: string | null,
): Promise<boolean> {
  if (!password || !cookieValue) return false;
  return timingSafeEqual(cookieValue, await gateToken(password));
}

/** Whether a typed attempt matches the site password. */
export async function passwordMatches(attempt: string, password: string | null): Promise<boolean> {
  const typed = attempt.trim();
  if (!password || !typed) return false;
  const [given, expected] = await Promise.all([gateToken(typed), gateToken(password)]);
  return timingSafeEqual(given, expected);
}

/**
 * Where to send someone after they unlock. Only ever a path on this site —
 * anything that could leave it ("//evil.example", "https://…") falls back to
 * the home page, so the unlock page cannot be used as an open redirect.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next === '/unlock' || next.startsWith('/unlock?') || next.startsWith('/unlock/')) return '/';
  return next;
}
