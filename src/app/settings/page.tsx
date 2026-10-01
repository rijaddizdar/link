import { redirect } from 'next/navigation';
import { getCoupleContext, getSession, isLinked } from '@/lib/data';
import { SettingsPanels } from './SettingsPanels';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  return (
    <div className="stack">
      <div className="stack-tight">
        <h1>Settings</h1>
        <p className="muted">
          Linked with {context.partner?.display_name}.
        </p>
      </div>
      <SettingsPanels
        coupleId={context.couple.id}
        timeZone={context.couple.time_zone}
        partnerName={context.partner?.display_name ?? 'your partner'}
      />
    </div>
  );
}
