import { redirect } from 'next/navigation';
import { getSession } from '@/lib/data';
import { AuthForms } from './AuthForms';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <div className="stack">
      <div className="stack-tight">
        <h1>Two people, one list</h1>
        <p className="muted">
          Make an account, then link up with your partner using a code. You each log your own
          days, side by side.
        </p>
      </div>
      <AuthForms />
    </div>
  );
}
