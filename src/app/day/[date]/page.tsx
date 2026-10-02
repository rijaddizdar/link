import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  getCoupleContext,
  getDayResult,
  getRecentDayResults,
  getSession,
  getTasks,
  isLinked,
  settleDueDays,
} from '@/lib/data';
import { dayOutcome, sharedStreak, winMargin } from '@/lib/scoring';
import { tasksScheduledOn } from '@/lib/schedule';
import { formatDayEndTime } from '@/lib/format';

function longDate(localDate: string): string {
  return new Date(`${localDate}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * The end-of-day moment: who took the day, or the shared heart when neither did.
 * A tie is deliberately not framed as a loss — nobody wins, so they both do.
 */
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  await settleDueDays(context.couple.id);

  const [result, history, tasks] = await Promise.all([
    getDayResult(date),
    getRecentDayResults(context.activeDate),
    getTasks(),
  ]);

  if (!result) {
    return (
      <>
        <div className="l-stack-tight">
          <h1>{longDate(date)}</h1>
          <p className="l-muted">
            This day has not closed yet. It settles at{' '}
            {formatDayEndTime(context.couple.day_end_time)}.
          </p>
        </div>
        <Link href="/" className="l-btn l-btn-secondary">
          Back to today
        </Link>
      </>
    );
  }

  const meId = context.me.id;
  const partnerId = context.partner?.id ?? '';
  const partnerName = context.partner?.display_name ?? 'Your partner';
  const myScore = result.scores[meId] ?? 0;
  const theirScore = result.scores[partnerId] ?? 0;
  const outcome = dayOutcome(result, meId);
  const margin = winMargin(result);

  // Only the streak as it stood at the end of this day, not today's.
  const streak = sharedStreak(history.filter((r) => r.local_date <= date));

  const headline =
    outcome === 'nobody'
      ? 'NOBODY FINISHED'
      : outcome === 'tie'
        ? "IT'S A TIE"
        : outcome === 'won'
          ? 'YOU WON'
          : `${partnerName.toUpperCase()} WON`;

  const subline =
    outcome === 'nobody'
      ? `Neither of you logged anything from ${result.scheduled_count}. Tomorrow is already waiting.`
      : outcome === 'tie'
        ? myScore === result.scheduled_count
          ? `You both did all ${result.scheduled_count}. Nobody wins, so you both do.`
          : `You both did ${myScore} of ${result.scheduled_count}. Nobody wins, so you both do.`
        : `${myScore} to ${theirScore}${margin > 0 ? `, by ${margin}` : ''}.`;

  const scheduled = tasksScheduledOn(tasks, date);

  return (
    <>
      <div className="l-win">
        <span className="l-win-badge" aria-hidden="true">
          {outcome === 'nobody' ? '🌙' : outcome === 'tie' ? '💞' : '🏆'}
        </span>
        <span className="l-label">
          {formatDayEndTime(context.couple.day_end_time)} · day closed
        </span>
        <h1 className="l-win-headline" data-testid="day-headline">
          {headline}
        </h1>
        <p>{subline}</p>
      </div>

      <div className="l-tally" data-testid="day-scores">
        <div className="l-tally-side l-tally-mine">
          <span className="l-tally-number">{myScore}</span>
          <span className="l-who l-who-mine">You</span>
        </div>
        <div className="l-tally-side l-tally-theirs">
          <span className="l-tally-number">{theirScore}</span>
          <span className="l-who l-who-theirs">{partnerName}</span>
        </div>
      </div>

      <div className="l-panel l-stack-tight">
        <span className="l-label">Shared streak</span>
        <span className="l-tally-number" style={{ color: 'var(--ink)' }}>
          {streak} {streak === 1 ? 'day' : 'days'}
        </span>
        <p className="l-muted">
          Days in a row you both cleared everything. A day only counts when you both finish.
        </p>
      </div>

      {scheduled.length > 0 && (
        <div className="l-stack-tight">
          <span className="l-label">{longDate(date)}</span>
          <ul className="l-list">
            {scheduled.map((task) => (
              <li key={task.id} className="l-task" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                <div className="l-task-body">
                  <div className="l-task-title">
                    <span aria-hidden="true">{task.emoji} </span>
                    {task.title}
                  </div>
                  <div className="l-task-meta">
                    {task.target_count == null
                      ? 'Tick box'
                      : `Counter · target ${task.target_count} a day`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="l-row">
        <Link href="/calendar" className="l-btn">
          See the calendar
        </Link>
        <Link href="/" className="l-btn l-btn-quiet">
          Back to today
        </Link>
      </div>
    </>
  );
}
