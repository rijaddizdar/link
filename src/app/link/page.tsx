import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoupleContext, getSession, isLinked } from '@/lib/data';
import { LinkPanels } from './LinkPanels';

/** The linking screen: hand out a code, or enter the one you were given. */
export default async function LinkPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (isLinked(context)) redirect('/');

  // The code this user has outstanding, if any. RLS limits this to their own couple.
  const supabase = await createClient();
  const { data: codes } = await supabase
    .from('invite_codes')
    .select('code, expires_at, redeemed_at, revoked_at')
    .is('redeemed_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  return (
    <LinkPanels
      activeCode={codes?.[0] ?? null}
      currentTimeZone={context?.couple.time_zone ?? null}
      currentDayEndTime={context?.couple.day_end_time ?? null}
      unlinkedCouple={context && context.couple.unlinked_at !== null ? context.couple : null}
    />
  );
}
