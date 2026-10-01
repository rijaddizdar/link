import { CompletionControl } from './CompletionControl';
import { isDone, requiredCount, scheduleLabel } from '@/lib/schedule';
import { WEEKDAY_LABELS, type Profile, type TaskCompletion, type TaskWithProgress } from '@/lib/types';

/** Read-only summary of one partner's progress on a task for the day. */
function Progress({
  completion,
  target,
}: {
  completion: TaskCompletion | null;
  target: number | null;
}) {
  const logged = completion?.count ?? 0;
  const done = isDone({ target_count: target }, completion);

  if (target == null) {
    return (
      <span className="side-state">
        {done ? <span className="done-mark">✓ Done</span> : 'Not yet'}
      </span>
    );
  }

  return (
    <span className="side-state">
      {logged} / {requiredCount({ target_count: target })}
      {done && (
        <>
          {' '}
          <span className="done-mark">✓</span>
        </>
      )}
    </span>
  );
}

/**
 * The shared list for one day. Each task shows my log and my partner's log in
 * two fixed columns, so "how did we each do" is answered without scrolling
 * sideways or switching screens.
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
  if (items.length === 0) {
    return (
      <div className="empty">
        <p>Nothing is scheduled for this day yet.</p>
        <p className="muted">Add a task and your partner can approve it.</p>
      </div>
    );
  }

  return (
    <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map(({ task, mine, theirs }) => (
        <li
          key={task.id}
          className="task-card"
          style={{ ['--task-accent' as string]: `var(--task-${task.color})` }}
        >
          <div className="task-head">
            <span className="task-emoji" aria-hidden="true">
              {task.emoji}
            </span>
            <div className="stack-tight" style={{ minWidth: 0, flex: 1 }}>
              <span className="task-title">{task.title}</span>
              <div className="row">
                <span className="chip">{scheduleLabel(task, WEEKDAY_LABELS)}</span>
                {task.target_count != null && (
                  <span className="chip">Target {task.target_count}</span>
                )}
              </div>
              {task.description && <p className="muted">{task.description}</p>}
            </div>
          </div>

          <div className="side-by-side">
            <div className="side side-mine">
              <span className="side-who">{me.display_name || 'You'} (you)</span>
              <Progress completion={mine} target={task.target_count} />
              <CompletionControl task={task} completion={mine} localDate={localDate} />
            </div>

            <div className="side side-theirs">
              <span className="side-who">{partner?.display_name || 'Your partner'}</span>
              <Progress completion={theirs} target={task.target_count} />
              <span className="muted">
                {theirs
                  ? `Logged ${new Date(theirs.completed_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Nothing logged yet'}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
