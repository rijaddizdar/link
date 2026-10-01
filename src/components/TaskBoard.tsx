import Link from 'next/link';
import { CompletionControl } from './CompletionControl';
import { PartnerProgress } from './PartnerProgress';
import { scheduleLabel } from '@/lib/schedule';
import { WEEKDAY_LABELS, type Profile, type TaskWithProgress } from '@/lib/types';

/**
 * The shared list for one day.
 *
 * Every row is one task on a `minmax(0,1fr) box box` grid, so the two completion
 * columns are the same width and vertically aligned all the way down. That
 * alignment is the whole point: "mine next to theirs" has to read at a glance,
 * on a phone as much as on a laptop.
 *
 * Rose is always me. Violet is always my partner.
 */
export function TaskBoard({
  items,
  me,
  partner,
  localDate,
}: {
  items: TaskWithProgress[];
  me: Profile;
  partner: Profile | null;
  localDate: string;
}) {
  const partnerName = partner?.display_name || 'Your partner';

  if (items.length === 0) {
    return (
      <div className="l-empty">
        <p>Nothing is scheduled for this day yet.</p>
        <p className="l-muted">Add a task and your partner can approve it.</p>
      </div>
    );
  }

  return (
    <div className="l-stack-tight">
      <div className="l-list-head">
        <span className="l-label">
          {items.length} {items.length === 1 ? 'task' : 'tasks'} today
        </span>
        <span className="l-who l-who-mine">
          <span className="l-who-dot" aria-hidden="true" />
          You
        </span>
        <span className="l-who l-who-theirs">
          <span className="l-who-dot" aria-hidden="true" />
          {partnerName}
        </span>
      </div>

      <ul className="l-list">
        {items.map(({ task, mine, theirs }) => (
          <li key={task.id} className="l-task" data-testid="task-row">
            <div className="l-task-body">
              <div className="l-task-title">
                <span
                  className="l-task-colour"
                  style={{ ['--task-colour' as string]: `var(--task-${task.color})` }}
                  aria-hidden="true"
                />
                <span aria-hidden="true">{task.emoji} </span>
                {task.title}
              </div>
              <div className="l-task-meta">
                {task.target_count == null
                  ? scheduleLabel(task, WEEKDAY_LABELS)
                  : `Counter · target ${task.target_count} a day · ${scheduleLabel(task, WEEKDAY_LABELS)}`}
              </div>
              {task.description && <p className="l-task-note">{task.description}</p>}
            </div>

            <CompletionControl task={task} completion={mine} localDate={localDate} />
            <PartnerProgress task={task} completion={theirs} partnerName={partnerName} />
          </li>
        ))}
      </ul>

      <Link href="/tasks/new" className="l-add-task">
        <span aria-hidden="true">+</span> Add a task
      </Link>

      <span className="l-visually-hidden">
        {me.display_name || 'You'} and {partnerName} each log their own day.
      </span>
    </div>
  );
}
