import { describe, expect, it } from 'vitest';
import { EMAIL_CONFIRMATION_REQUIRED, signInErrorMessage } from '@/lib/auth-messages';

describe('signInErrorMessage', () => {
  it('keeps the usual polite message for a wrong email or password', () => {
    expect(signInErrorMessage('Invalid login credentials')).toBe(
      'That email and password do not match an account.',
    );
  });

  it('explains an unconfirmed email instead of calling it a wrong password', () => {
    expect(signInErrorMessage('Email not confirmed')).toBe(EMAIL_CONFIRMATION_REQUIRED);
  });

  it('passes any other problem through, so a broken setup is visible', () => {
    // This is the exact error the live site hid behind "wrong password".
    expect(signInErrorMessage('Invalid path specified in request URL')).toBe(
      'Could not sign in: Invalid path specified in request URL',
    );
  });

  it('falls back to the polite message when there is nothing to go on', () => {
    expect(signInErrorMessage('')).toBe('That email and password do not match an account.');
    expect(signInErrorMessage(undefined)).toBe('That email and password do not match an account.');
  });
});

describe('EMAIL_CONFIRMATION_REQUIRED', () => {
  it('tells you where the setting is and what to do about the stuck account', () => {
    expect(EMAIL_CONFIRMATION_REQUIRED).toMatch(/Confirm email/);
    expect(EMAIL_CONFIRMATION_REQUIRED).toMatch(/Authentication → Users/);
  });
});
