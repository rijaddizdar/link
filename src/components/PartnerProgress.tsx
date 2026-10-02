import { isDone, requiredCount } from '@/lib/schedule';
import type { Task, TaskCompletion } from '@/lib/types';

/** My partner's column: read-only, always violet, never mine to change. */
export function PartnerProgress({
  task,
  completion,
  partnerName,
}: {
  task: Task;
  completion: TaskCompletion | null;
  partnerName: string;
}) {
  const logged = completion?.count ?? 0;
  const done = isDone(task, completion);

  if (task.target_count == null) {
    return (
      <div
        className={done ? 'l-box l-box-theirs l-box-done' : 'l-box l-box-theirs'}
        role="img"
        aria-label={`${partnerName}: ${done ? 'done' : 'not done'}`}
      >
        <span className="l-box-check" aria-hidden="true">
          {done ? '✓' : ''}
        </span>
      </div>
    );
  }

  return (
    <div
      className={done ? 'l-box l-box-theirs l-box-done' : 'l-box l-box-theirs'}
      role="img"
      aria-label={`${partnerName}: ${logged} of ${requiredCount(task)}`}
    >
      <span className="l-box-count">{logged}</span>
      <span className="l-box-target">/{requiredCount(task)}</span>
    </div>
  );
}
