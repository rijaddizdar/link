import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GATE_COOKIE, isUnlocked, safeNext, sitePassword } from '@/lib/gate';
import { UnlockForm } from './UnlockForm';

/**
 * The first thing anyone sees. Says nothing about what is behind it.
 */
export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const password = sitePassword();

  // Already unlocked on this device: no reason to stop here.
  const cookie = (await cookies()).get(GATE_COOKIE)?.value;
  if (await isUnlocked(cookie, password)) redirect(safeNext(next));

  return (
    <div className="l-unlock">
      <div className="l-banner">
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-xl)' }}>
          ♥
        </span>
        <h1>Link</h1>
        <p>Just for the two of us.</p>
      </div>

      {password ? (
        <UnlockForm next={safeNext(next)} />
      ) : (
        <p className="l-error" role="alert">
          This site&apos;s password has not been set up yet, so it stays locked.
        </p>
      )}
    </div>
  );
}
