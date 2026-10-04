import { afterEach, describe, expect, it } from 'vitest';
import {
  gateToken,
  isUnlocked,
  passwordMatches,
  safeNext,
  sitePassword,
  timingSafeEqual,
} from '@/lib/gate';

const PASSWORD = 'correct horse battery staple';

describe('gateToken', () => {
  it('is 64 hex characters', async () => {
    expect(await gateToken(PASSWORD)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the same every time for the same password', async () => {
    expect(await gateToken(PASSWORD)).toBe(await gateToken(PASSWORD));
  });

  it('changes when the password changes, which locks every device out', async () => {
    expect(await gateToken(PASSWORD)).not.toBe(await gateToken(`${PASSWORD}!`));
  });

  it('never contains the password itself', async () => {
    const token = await gateToken('MapleHarbor');
    expect(token.toLowerCase()).not.toContain('maple');
    expect(token.toLowerCase()).not.toContain('harbor');
  });
});

describe('timingSafeEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('rejects a difference anywhere', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'xbc')).toBe(false);
  });

  it('rejects strings of different lengths', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });
});

describe('isUnlocked', () => {
  it('accepts the cookie the right password produces', async () => {
    expect(await isUnlocked(await gateToken(PASSWORD), PASSWORD)).toBe(true);
  });

  it('rejects a cookie made from a different password', async () => {
    expect(await isUnlocked(await gateToken('something else'), PASSWORD)).toBe(false);
  });

  it('rejects no cookie at all', async () => {
    expect(await isUnlocked(undefined, PASSWORD)).toBe(false);
  });

  it('rejects the raw password sitting in the cookie', async () => {
    expect(await isUnlocked(PASSWORD, PASSWORD)).toBe(false);
  });

  it('fails closed when no password has been configured', async () => {
    // Forgetting to set SITE_PASSWORD must lock the site, never open it.
    expect(await isUnlocked(await gateToken(PASSWORD), null)).toBe(false);
    expect(await isUnlocked('', null)).toBe(false);
  });
});

describe('passwordMatches', () => {
  it('accepts the right password', async () => {
    expect(await passwordMatches(PASSWORD, PASSWORD)).toBe(true);
  });

  it('forgives stray spaces a phone keyboard might add', async () => {
    expect(await passwordMatches(`  ${PASSWORD} `, PASSWORD)).toBe(true);
  });

  it('is case sensitive', async () => {
    expect(await passwordMatches('mapleharbor', 'MapleHarbor')).toBe(false);
  });

  it('rejects a wrong or empty attempt', async () => {
    expect(await passwordMatches('nope', PASSWORD)).toBe(false);
    expect(await passwordMatches('', PASSWORD)).toBe(false);
    expect(await passwordMatches('   ', PASSWORD)).toBe(false);
  });

  it('rejects everything when no password has been configured', async () => {
    expect(await passwordMatches(PASSWORD, null)).toBe(false);
  });
});

describe('sitePassword', () => {
  const original = process.env.SITE_PASSWORD;
  afterEach(() => {
    if (original === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = original;
  });

  it('reads and trims the environment variable', () => {
    process.env.SITE_PASSWORD = '  MapleHarbor \n';
    expect(sitePassword()).toBe('MapleHarbor');
  });

  it('treats a missing or blank value as not configured', () => {
    delete process.env.SITE_PASSWORD;
    expect(sitePassword()).toBeNull();
    process.env.SITE_PASSWORD = '   ';
    expect(sitePassword()).toBeNull();
  });
});

describe('safeNext', () => {
  it('keeps a path on this site, query and all', () => {
    expect(safeNext('/calendar')).toBe('/calendar');
    expect(safeNext('/calendar?month=2026-09')).toBe('/calendar?month=2026-09');
    expect(safeNext('/day/2026-10-01')).toBe('/day/2026-10-01');
  });

  it('falls back home for nothing at all', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  it('never sends anyone off the site', () => {
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
  });

  it('does not send someone back to the unlock page in a loop', () => {
    expect(safeNext('/unlock')).toBe('/');
    expect(safeNext('/unlock?next=/calendar')).toBe('/');
  });
});
