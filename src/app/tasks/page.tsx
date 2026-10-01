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
    <div className="stack">
      <div className="spread">
        <div className="stack-tight">
          <h1>Our tasks</h1>
          <p className="muted">{tasks.length} on the list. Add as many as you like.</p>
        </div>
        <Link href="/tasks/new" className="btn">
          Add a task
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="empty">
          <p>Your list is empty.</p>
          <p className="muted">
            Whatever you add goes to {context.partner?.display_name} to approve first.
          </p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {tasks.map((task) => {
            const locked = lockedTaskIds.has(task.id);
            return (
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

                {locked ? (
                  <p className="notice">
                    A change to this task is already waiting for approval.{' '}
                    <Link href="/proposals">See it</Link>
                  </p>
                ) : (
                  <div className="row">
                    <Link href={`/tasks/${task.id}/edit`} className="btn btn-secondary btn-small">
                      Propose a change
                    </Link>
                    <DeleteTaskButton taskId={task.id} title={task.title} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
