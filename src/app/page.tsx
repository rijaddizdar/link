import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TaskBoard } from '@/components/TaskBoard';
import {
  getChallenges,
  getCoupleContext,
  getDayBoard,
  getLatestDayResult,
  getProposals,
  getRecentDayResults,
  getSession,
  isLinked,
  settleDueDays,
} from '@/lib/data';
import { partitionOpenProposals } from '@/lib/proposals';
import { isDone } from '@/lib/schedule';
import { sharedStreak } from '@/lib/scoring';
import { addDays, timeLeftLabel } from '@/lib/day';
import { formatDayEndTime } from '@/lib/format';

/** Today: the shared list for the day the couple is currently living. */
export default async function TodayPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  // Close out anything that ended while nobody was looking, before reading results.
  await settleDueDays(context.couple.id);

  const localDate = context.activeDate;
  const [items, proposals, challenges, latest, history] = await Promise.all([
    getDayBoard(context, localDate),
    getProposals(),
    getChallenges(localDate),
    getLatestDayResult(),
    getRecentDayResults(localDate),
  ]);

  const { waitingOnMe } = partitionOpenProposals(proposals, session.userId);
  const streak = sharedStreak(history);

  // A plain count of where each of you is. The day is not decided until it closes.
  const doneByMe = items.filter((item) => isDone(item.task, item.mine)).length;
  const doneByPartner = items.filter((item) => isDone(item.task, item.theirs)).length;

  const justFinished = latest && latest.local_date === addDays(localDate, -1) ? latest : null;

  return (
    <>
      <div className="l-spread">
        <div className="l-stack-tight">
          <h1>Today</h1>
          <p className="l-muted">
            {context.me.display_name || 'You'} &amp; {context.partner?.display_name}
          </p>
        </div>
        <div className="l-row">
          {streak > 0 && (
            <span className="l-chip l-chip-accent" data-testid="streak">
              <span aria-hidden="true">🔥</span> {streak}
            </span>
          )}
          <Link href="/tasks/new" className="l-btn">
            Add a task
          </Link>
        </div>
      </div>

      <p className="l-dayend">
        <span aria-hidden="true">◷</span>
        <span>
          Day ends at{' '}
          <span className="l-dayend-time">{formatDayEndTime(context.couple.day_end_time)}</span>
        </span>
        <span className="l-muted">· {timeLeftLabel(context.msLeft)}</span>
      </p>

      {justFinished && (
        <Link href={`/day/${justFinished.local_date}`} className="l-note" data-testid="last-day">
          Yesterday is settled. <strong>See how it went →</strong>
        </Link>
      )}

      {waitingOnMe.length > 0 && (
        <p className="l-note">
          {waitingOnMe.length === 1
            ? 'One change is waiting for your approval.'
            : `${waitingOnMe.length} changes are waiting for your approval.`}{' '}
          <Link href="/proposals">Take a look</Link>
        </p>
      )}

      <TaskBoard
        items={items}
        me={context.me}
        partner={context.partner}
        localDate={localDate}
        challenges={challenges}
      />

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
