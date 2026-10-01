import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCoupleContext, getProposals, getSession, getTasks, isLinked } from '@/lib/data';
import { isOpen } from '@/lib/proposals';
import { scheduleLabel } from '@/lib/schedule';
import { WEEKDAY_LABELS } from '@/lib/types';
import { DeleteTaskButton } from './DeleteTaskButton';

/** The whole shared list, with no cap on how many tasks a couple keeps. */
export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const [tasks, proposals] = await Promise.all([getTasks(), getProposals()]);
  const lockedTaskIds = new Set(
    proposals.filter((p) => isOpen(p) && p.task_id).map((p) => p.task_id as string),
  );

  return (
    <>
      <div className="l-spread">
        <div className="l-stack-tight">
          <h1>Our tasks</h1>
          <p className="l-muted">{tasks.length} on the list. Add as many as you like.</p>
        </div>
        <Link href="/tasks/new" className="l-btn">
          Add a task
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="l-empty">
          <p>Your list is empty.</p>
          <p className="l-muted">
            Whatever you add goes to {context.partner?.display_name} to approve first.
          </p>
        </div>
      ) : (
        <ul className="l-list">
          {tasks.map((task) => {
            const locked = lockedTaskIds.has(task.id);
            return (
              <li
                key={task.id}
                className={locked ? 'l-task l-task-pending' : 'l-task'}
                style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}
              >
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
                  {locked && (
                    <p className="l-task-note">
                      A change to this task is already waiting for approval.{' '}
                      <Link href="/proposals">See it</Link>
                    </p>
                  )}
                </div>

                {!locked && (
                  <div className="l-row">
                    <Link href={`/tasks/${task.id}/edit`} className="l-btn l-btn-quiet l-btn-small">
                      Change
                    </Link>
                    <DeleteTaskButton taskId={task.id} title={task.title} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
