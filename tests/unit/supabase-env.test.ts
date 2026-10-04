import { afterEach, describe, expect, it } from 'vitest';
import { normalizeSupabaseUrl, supabaseEnv } from '@/lib/supabase/env';

describe('normalizeSupabaseUrl', () => {
  it('leaves a correct project URL alone', () => {
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co')).toBe('https://abcd1234.supabase.co');
  });

  it('drops the /rest/v1/ that Supabase shows for the database API', () => {
    // The paste that produced "Invalid path specified in request URL" in production.
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/rest/v1/')).toBe(
      'https://abcd1234.supabase.co',
    );
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/rest/v1')).toBe(
      'https://abcd1234.supabase.co',
    );
  });

  it('drops any other path, a trailing slash, or stray whitespace', () => {
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/auth/v1')).toBe('https://abcd1234.supabase.co');
    expect(normalizeSupabaseUrl('https://abcd1234.supabase.co/')).toBe('https://abcd1234.supabase.co');
    expect(normalizeSupabaseUrl('  https://abcd1234.supabase.co \n')).toBe('https://abcd1234.supabase.co');
  });

  it('keeps the port for the local stack', () => {
    expect(normalizeSupabaseUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    expect(normalizeSupabaseUrl('http://127.0.0.1:54321/rest/v1/')).toBe('http://127.0.0.1:54321');
  });

  it('refuses the dashboard address with a message that says what to use instead', () => {
    expect(() => normalizeSupabaseUrl('https://supabase.com/dashboard/project/abcd1234')).toThrow(
      /dashboard address/,
    );
  });

  it('refuses something that is not a web address at all', () => {
    expect(() => normalizeSupabaseUrl('abcd1234')).toThrow(/not a web address/);
  });
});

describe('supabaseEnv', () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  });

  it('hands back the cleaned-up URL and a trimmed key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcd1234.supabase.co/rest/v1/';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ' sb_publishable_example \n';
    expect(supabaseEnv()).toEqual({
      url: 'https://abcd1234.supabase.co',
      anonKey: 'sb_publishable_example',
    });
  });

  it('says plainly when either value is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    expect(() => supabaseEnv()).toThrow(/must be set/);
  });
});
