import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
  isValidInviteCodeFormat,
  normalizeInviteCode,
  rejectRedemption,
  type InviteCodeState,
} from '@/lib/invite-code';

const FUTURE = new Date('2026-06-10T00:00:00Z');
const NOW = new Date('2026-06-01T00:00:00Z');

function invite(overrides: Partial<InviteCodeState> = {}): InviteCodeState {
  return {
    code: 'ABCD2345',
    createdBy: 'user-a',
    expiresAt: FUTURE,
    redeemedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('normalizeInviteCode', () => {
  it('upper-cases and drops separators so a code can be typed any way', () => {
    expect(normalizeInviteCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeInviteCode('abcd 2345')).toBe('ABCD2345');
    expect(normalizeInviteCode(' ABCD_2345 ')).toBe('ABCD2345');
  });

  it('leaves an already-normal code alone', () => {
    expect(normalizeInviteCode('ABCD2345')).toBe('ABCD2345');
  });
});

describe('isValidInviteCodeFormat', () => {
  it('accepts a well-formed code in any casing or grouping', () => {
    expect(isValidInviteCodeFormat('ABCD2345')).toBe(true);
    expect(isValidInviteCodeFormat('abcd-2345')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidInviteCodeFormat('ABCD234')).toBe(false);
    expect(isValidInviteCodeFormat('ABCD23456')).toBe(false);
    expect(isValidInviteCodeFormat('')).toBe(false);
  });

  it('rejects characters that are outside the alphabet', () => {
    // 0, O, 1, I and L are deliberately absent: they get misheard.
    for (const char of ['0', 'O', '1', 'I', 'L']) {
      expect(INVITE_CODE_ALPHABET.includes(char)).toBe(false);
      expect(isValidInviteCodeFormat(`ABCD234${char}`)).toBe(false);
    }
  });
});

describe('formatInviteCode', () => {
  it('groups in fours for reading aloud', () => {
    expect(formatInviteCode('ABCD2345')).toBe('ABCD-2345');
  });

  it('normalizes before grouping', () => {
    expect(formatInviteCode('abcd2345')).toBe('ABCD-2345');
  });
});

describe('generateInviteCode', () => {
  it('produces a code of the right length from the safe alphabet', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(isValidInviteCodeFormat(code)).toBe(true);
  });

  it('is driven entirely by the supplied randomness', () => {
    expect(generateInviteCode(() => 0)).toBe('A'.repeat(INVITE_CODE_LENGTH));
  });

  it('never runs off the end of the alphabet', () => {
    // Math.random() can return values arbitrarily close to 1.
    const code = generateInviteCode(() => 0.999999999);
    expect(code).toBe(INVITE_CODE_ALPHABET.at(-1)!.repeat(INVITE_CODE_LENGTH));
    expect(isValidInviteCodeFormat(code)).toBe(true);
  });
});

describe('rejectRedemption', () => {
  it('lets the other partner redeem a fresh code', () => {
    expect(rejectRedemption(invite(), 'user-b', NOW)).toBeNull();
  });

  it('will not let you redeem your own code', () => {
    expect(rejectRedemption(invite(), 'user-a', NOW)).toBe('own-code');
  });

  it('rejects a code that was already used', () => {
    expect(rejectRedemption(invite({ redeemedAt: NOW }), 'user-b', NOW)).toBe('already-used');
  });

  it('rejects a code that was replaced by a newer one', () => {
    expect(rejectRedemption(invite({ revokedAt: NOW }), 'user-b', NOW)).toBe('revoked');
  });

  it('rejects a code past its expiry', () => {
    const past = new Date('2026-05-01T00:00:00Z');
    expect(rejectRedemption(invite({ expiresAt: past }), 'user-b', NOW)).toBe('expired');
  });

  it('treats the expiry instant itself as expired', () => {
    expect(rejectRedemption(invite({ expiresAt: NOW }), 'user-b', NOW)).toBe('expired');
  });

  it('rejects a malformed code before anything else', () => {
    expect(rejectRedemption(invite({ code: 'nope' }), 'user-b', NOW)).toBe('bad-format');
  });

  it('accepts ISO strings as well as Date objects', () => {
    expect(rejectRedemption(invite({ expiresAt: FUTURE.toISOString() }), 'user-b', NOW)).toBeNull();
  });
});
