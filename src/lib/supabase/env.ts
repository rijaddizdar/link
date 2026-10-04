/**
 * Reads the two public Supabase values. They come from .env.local locally and
 * from the host's environment settings in production (see .env.example).
 */
export function supabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set — copy .env.example to .env.local.',
    );
  }
  return { url: normalizeSupabaseUrl(rawUrl), anonKey };
}

/**
 * Supabase's settings pages show several addresses, and the easiest one to copy
 * is the database API — `https://<ref>.supabase.co/rest/v1/`. The client adds
 * its own paths on top, so anything after the host produces "Invalid path
 * specified in request URL" from Supabase. Keeping only the origin makes every
 * one of those copies work.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a web address: "${raw}". It should look like https://<ref>.supabase.co`,
    );
  }

  // The dashboard's own address is a common wrong paste, and fails confusingly.
  if (parsed.hostname === 'supabase.com' || parsed.hostname.endsWith('.supabase.com')) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is the Supabase dashboard address. Use the Project URL instead, which looks like https://<ref>.supabase.co',
    );
  }

  return parsed.origin;
}
