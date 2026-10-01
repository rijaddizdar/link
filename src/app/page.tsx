import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TaskBoard } from '@/components/TaskBoard';
import { getCoupleContext, getDayBoard, getProposals, getSession, isLinked } from '@/lib/data';
import { partitionOpenProposals } from '@/lib/proposals';

/** Today: the shared list for the couple's current local date, side by side. */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const { date } = await searchParams;
  const localDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : context.today;

  const [items, proposals] = await Promise.all([
    getDayBoard(context, localDate),
    getProposals(),
  ]);
  const { waitingOnMe } = partitionOpenProposals(proposals, session.userId);

  const doneByMe = items.filter((item) => (item.mine?.count ?? 0) >= (item.task.target_count ?? 1));
  const doneByPartner = items.filter(
    (item) => (item.theirs?.count ?? 0) >= (item.task.target_count ?? 1),
  );

  return (
    <div className="stack">
      <div className="spread">
        <div className="stack-tight">
          <h1>{localDate === context.today ? 'Today' : localDate}</h1>
          <p className="muted">
            {context.me.display_name || 'You'} &amp; {context.partner?.display_name} ·{' '}
            {context.couple.time_zone}
          </p>
        </div>
        <Link href="/tasks/new" className="btn">
          Add a task
        </Link>
      </div>

      {waitingOnMe.length > 0 && (
        <p className="notice">
          {waitingOnMe.length === 1
            ? 'One change is waiting for your approval.'
            : `${waitingOnMe.length} changes are waiting for your approval.`}{' '}
          <Link href="/proposals">Take a look</Link>
        </p>
      )}

      {items.length > 0 && (
        <div className="side-by-side">
          <div className="side side-mine">
            <span className="side-who">{context.me.display_name || 'You'} (you)</span>
            <span className="side-state">
              {doneByMe.length} of {items.length} done
            </span>
          </div>
          <div className="side side-theirs">
            <span className="side-who">{context.partner?.display_name}</span>
            <span className="side-state">
              {doneByPartner.length} of {items.length} done
            </span>
          </div>
        </div>
      )}

      <TaskBoard
        items={items}
        me={context.me}
        partner={context.partner}
        localDate={localDate}
      />
    </div>
  );
}
