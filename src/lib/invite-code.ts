/**
 * Invite codes: the one thing a couple passes between two phones by voice or
 * message, so the alphabet leaves out characters that get misheard or misread
 * (0/O, 1/I/L). Mirrors `public.new_invite_code()` in the migration.
 */

export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

/** Seven days, matching `public.invite_code_ttl()`. */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Strips separators and upper-cases, so "abcd-2345", "abcd 2345" and
 * "ABCD2345" are all the same code.
 */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isValidInviteCodeFormat(input: string): boolean {
  const code = normalizeInviteCode(input);
  if (code.length !== INVITE_CODE_LENGTH) return false;
  return [...code].every((char) => INVITE_CODE_ALPHABET.includes(char));
}

/** Groups the code in fours for display: ABCD-2345. */
export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  return normalized.replace(/(.{4})(?=.)/g, '$1-');
}

export function generateInviteCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    const index = Math.floor(random() * INVITE_CODE_ALPHABET.length);
    code += INVITE_CODE_ALPHABET[index];
  }
  return code;
}

export type InviteCodeState = {
  code: string;
  createdBy: string;
  expiresAt: Date | string;
  redeemedAt: Date | string | null;
  revokedAt: Date | string | null;
};

export type RedeemRejection =
  | 'bad-format'
  | 'expired'
  | 'already-used'
  | 'revoked'
  | 'own-code';

/**
 * Why a code cannot be redeemed by `userId`, or null when it can.
 * Mirrors the checks in `public.redeem_invite_code()`; the database remains the
 * authority, this exists so the UI can explain the problem without a round trip.
 */
export function rejectRedemption(
  invite: InviteCodeState,
  userId: string,
  now: Date = new Date(),
): RedeemRejection | null {
  if (!isValidInviteCodeFormat(invite.code)) return 'bad-format';
  if (invite.revokedAt !== null) return 'revoked';
  if (invite.redeemedAt !== null) return 'already-used';
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return 'expired';
  if (invite.createdBy === userId) return 'own-code';
  return null;
}

export const REDEEM_REJECTION_MESSAGES: Record<RedeemRejection, string> = {
  'bad-format': "That doesn't look like a Link code — it's 8 letters and numbers.",
  expired: 'That code has expired. Ask your partner for a fresh one.',
  'already-used': 'That code has already been used.',
  revoked: 'That code was replaced by a newer one.',
  'own-code': "That's your own code — share it with your partner instead.",
};
