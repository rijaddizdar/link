import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TaskBoard } from '@/components/TaskBoard';
import { getCoupleContext, getDayBoard, getProposals, getSession, isLinked } from '@/lib/data';
import { partitionOpenProposals } from '@/lib/proposals';
import { isDone } from '@/lib/schedule';
import { formatDayEndTime } from '@/lib/format';

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

  const [items, proposals] = await Promise.all([getDayBoard(context, localDate), getProposals()]);
  const { waitingOnMe } = partitionOpenProposals(proposals, session.userId);

  // A plain count of what each of us finished. Who *won* the day is a later PR:
  // nothing here declares a winner.
  const doneByMe = items.filter((item) => isDone(item.task, item.mine)).length;
  const doneByPartner = items.filter((item) => isDone(item.task, item.theirs)).length;

  const heading =
    localDate === context.today
      ? 'Today'
      : new Date(`${localDate}T00:00:00Z`).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        });

  return (
    <>
      <div className="l-spread">
        <div className="l-stack-tight">
          <h1>{heading}</h1>
          <p className="l-muted">
            {context.me.display_name || 'You'} &amp; {context.partner?.display_name}
          </p>
        </div>
        <Link href="/tasks/new" className="l-btn">
          Add a task
        </Link>
      </div>

      <p className="l-dayend">
        <span aria-hidden="true">◷</span>
        <span>
          Day ends at <span className="l-dayend-time">{formatDayEndTime(context.couple.day_end_time)}</span>
        </span>
        <span className="l-muted">· {context.couple.time_zone}</span>
      </p>

      {waitingOnMe.length > 0 && (
        <p className="l-note">
          {waitingOnMe.length === 1
            ? 'One change is waiting for your approval.'
            : `${waitingOnMe.length} changes are waiting for your approval.`}{' '}
          <Link href="/proposals">Take a look</Link>
        </p>
      )}

      <TaskBoard items={items} me={context.me} partner={context.partner} localDate={localDate} />

      {items.length > 0 && (
        <div className="l-tally">
          <div className="l-tally-side l-tally-mine">
            <span className="l-tally-number">{doneByMe}</span>
            <span className="l-who l-who-mine">You</span>
            <span className="l-muted">of {items.length} done</span>
          </div>
          <div className="l-tally-side l-tally-theirs">
            <span className="l-tally-number">{doneByPartner}</span>
            <span className="l-who l-who-theirs">{context.partner?.display_name}</span>
            <span className="l-muted">of {items.length} done</span>
          </div>
        </div>
      )}
    </>
  );
}
