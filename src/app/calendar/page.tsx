import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getCoupleContext,
  getRecentDayResults,
  getSession,
  isLinked,
  settleDueDays,
} from '@/lib/data';
import {
  datesInMonth,
  dayOutcome,
  leadingBlanks,
  monthOf,
  sharedStreak,
  tallyMonth,
} from '@/lib/scoring';
import { addDays } from '@/lib/day';
import type { DayResult } from '@/lib/types';

const WEEKDAY_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Daily winners and ties across a month, and who is taking the month itself. */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  await settleDueDays(context.couple.id);

  const { month: requested } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(requested ?? '') ? requested! : monthOf(context.activeDate);

  const history = await getRecentDayResults(context.activeDate);
  const byDate = new Map<string, DayResult>(history.map((r) => [r.local_date, r]));

  const meId = context.me.id;
  const partnerId = context.partner?.id ?? '';
  const partnerName = context.partner?.display_name ?? 'Your partner';

  // A day neither of them touched is not a tie worth counting, so it is left out
  // of the month tally as well as off the grid.
  const contested = history.filter((r) => Math.max(0, ...Object.values(r.scores)) > 0);
  const tally = tallyMonth(contested, [meId, partnerId], month);
  const lastMonth = tallyMonth(contested, [meId, partnerId], shiftMonth(month, -1));
  const streak = sharedStreak(history);

  const myWins = tally.wins[meId] ?? 0;
  const theirWins = tally.wins[partnerId] ?? 0;
  const total = myWins + theirWins + tally.ties;

  const leaderLine =
    tally.settledDays === 0
      ? 'No days have closed this month yet.'
      : tally.leaderUserId === null
        ? 'You are level this month.'
        : tally.leaderUserId === meId
          ? 'You are ahead this month.'
          : `${partnerName} is ahead this month.`;

  const yesterday = addDays(context.activeDate, -1);

  return (
    <>
      <div className="l-spread">
        <div className="l-stack-tight">
          <h1>Calendar</h1>
          <p className="l-muted">{monthLabel(month)}</p>
        </div>
        <div className="l-row">
          <Link href={`/calendar?month=${shiftMonth(month, -1)}`} className="l-btn l-btn-quiet l-btn-small">
            ← Earlier
          </Link>
          <Link href={`/calendar?month=${shiftMonth(month, 1)}`} className="l-btn l-btn-quiet l-btn-small">
            Later →
          </Link>
        </div>
      </div>

      <section className="l-panel l-stack-tight">
        <span className="l-label">{monthLabel(month)} so far</span>
        <h2 data-testid="month-leader">{leaderLine}</h2>

        {total > 0 && (
          <div className="l-monthbar" aria-hidden="true">
            <span className="l-monthbar-mine" style={{ flexGrow: myWins }} />
            <span className="l-monthbar-theirs" style={{ flexGrow: theirWins }} />
            <span className="l-monthbar-tie" style={{ flexGrow: tally.ties }} />
          </div>
        )}

        <p className="l-muted">
          You {myWins} {myWins === 1 ? 'day' : 'days'} · {partnerName} {theirWins}{' '}
          {theirWins === 1 ? 'day' : 'days'} · {tally.ties}{' '}
          {tally.ties === 1 ? 'tie' : 'ties'}
        </p>
        <p className="l-muted">
          Whoever wins the most days takes the month. Today is not counted until it closes.
        </p>
      </section>

      <section className="l-panel l-stack-tight">
        <div className="l-month" data-testid="month-grid">
          {WEEKDAY_HEADS.map((head, i) => (
            <span key={`${head}-${i}`} className="l-month-head" aria-hidden="true">
              {head}
            </span>
          ))}

          {Array.from({ length: leadingBlanks(month) }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}

          {datesInMonth(month).map((date) => {
            const result = byDate.get(date);
            const isFuture = date >= context.activeDate;
            const isToday = date === context.activeDate;

            let mark = 'l-day-none';
            let glyph = '';
            let label = 'nothing finished';

            if (isFuture) {
              mark = 'l-day-future';
              label = isToday ? 'today, still open' : 'still to come';
            } else if (result) {
              const outcome = dayOutcome(result, meId);
              if (outcome === 'won') {
                mark = 'l-day-mine';
                glyph = 'Y';
                label = 'you won';
              } else if (outcome === 'lost') {
                mark = 'l-day-theirs';
                glyph = partnerName.slice(0, 1).toUpperCase();
                label = `${partnerName} won`;
              } else if (outcome === 'tie') {
                mark = 'l-day-tie';
                glyph = '♥';
                label = 'a tie';
              }
              // 'nobody' keeps the default marker: a day neither of them finished.
            }

            const cell = (
              <span className={`l-day ${mark} ${isToday ? 'l-day-today' : ''}`}>
                <span className="l-day-number">{Number(date.slice(-2))}</span>
                <span className="l-day-mark" aria-hidden="true">
                  {glyph}
                </span>
              </span>
            );

            return result ? (
              <Link
                key={date}
                href={`/day/${date}`}
                className="l-day-link"
                aria-label={`${date}: ${label}`}
              >
                {cell}
              </Link>
            ) : (
              <span key={date} className="l-day-link" aria-label={`${date}: ${label}`}>
                {cell}
              </span>
            );
          })}
        </div>

        <ul className="l-key">
          <li>
            <span className="l-day l-day-mine l-day-chip" aria-hidden="true" /> You won
          </li>
          <li>
            <span className="l-day l-day-theirs l-day-chip" aria-hidden="true" /> {partnerName} won
          </li>
          <li>
            <span className="l-day l-day-tie l-day-chip" aria-hidden="true" /> Tie
          </li>
          <li>
            <span className="l-day l-day-none l-day-chip" aria-hidden="true" /> Nobody finished
          </li>
        </ul>
      </section>

      <section className="l-panel l-stack-tight">
        <span className="l-label">And overall</span>
        <p>
          Longest shared streak right now: <strong>{streak} {streak === 1 ? 'day' : 'days'}</strong>
        </p>
        <p className="l-muted">
          {lastMonth.settledDays === 0
            ? 'Last month has nothing settled yet.'
            : lastMonth.leaderUserId === null
              ? `${monthLabel(shiftMonth(month, -1))} finished level.`
              : `${monthLabel(shiftMonth(month, -1))} went to ${
                  lastMonth.leaderUserId === meId ? 'you' : partnerName
                }.`}
        </p>
        {byDate.has(yesterday) && (
          <Link href={`/day/${yesterday}`}>See how yesterday went →</Link>
        )}
      </section>
    </>
  );
}
