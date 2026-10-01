import { redirect } from 'next/navigation';
import { getCoupleContext, getProposals, getSession, isLinked } from '@/lib/data';
import { isOpen } from '@/lib/proposals';
import { SettingsPanels } from './SettingsPanels';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const proposals = await getProposals();
  const dayEndChangePending = proposals.some((p) => p.kind === 'day_end' && isOpen(p));

  return (
    <>
      <div className="l-stack-tight">
        <h1>Settings</h1>
        <p className="l-muted">Linked with {context.partner?.display_name}.</p>
      </div>
      <SettingsPanels
        coupleId={context.couple.id}
        timeZone={context.couple.time_zone}
        dayEndTime={context.couple.day_end_time}
        dayEndChangePending={dayEndChangePending}
        partnerName={context.partner?.display_name ?? 'your partner'}
      />
    </>
  );
}
