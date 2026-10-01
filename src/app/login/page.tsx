import { redirect } from 'next/navigation';
import { getSession } from '@/lib/data';
import { AuthForms } from './AuthForms';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <>
      <div className="l-banner">
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-xl)' }}>
          ♥
        </span>
        <h1>Two people, one list</h1>
        <p>
          Make an account, link up with your partner using a code, and each log your own day —
          yours next to theirs.
        </p>
      </div>
      <AuthForms />
    </>
  );
}
