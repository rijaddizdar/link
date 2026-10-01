'use client';

import { useActionState } from 'react';
import { SubmitButton } from './SubmitButton';
import { setCompletionAction, type ActionResult } from '@/lib/actions';
import { isDone, progressFraction, requiredCount } from '@/lib/schedule';
import type { Task, TaskCompletion } from '@/lib/types';

/**
 * My own column in the side-by-side view: the only place a completion is logged.
 * A task with a target counts up and down; a plain task toggles.
 */
export function CompletionControl({
  task,
  completion,
  localDate,
}: {
  task: Task;
  completion: TaskCompletion | null;
  localDate: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(setCompletionAction, {
    error: null,
  });

  const logged = completion?.count ?? 0;
  const required = requiredCount(task);
  const done = isDone(task, completion);

  if (task.target_count == null) {
    return (
      <form action={formAction} className="stack-tight">
        <input type="hidden" name="task_id" value={task.id} />
        <input type="hidden" name="local_date" value={localDate} />
        <input type="hidden" name="count" value={done ? 0 : 1} />
        <SubmitButton
          className={done ? 'btn btn-secondary btn-small' : 'btn btn-small'}
          pendingLabel="…"
        >
          {done ? 'Undo' : 'Mark done'}
        </SubmitButton>
        {state.error && <span className="muted">{state.error}</span>}
      </form>
    );
  }

  return (
    <div className="stack-tight">
      <div className="meter" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${progressFraction(task, completion) * 100}%` }} />
      </div>
      <div className="counter">
        <form action={formAction}>
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="local_date" value={localDate} />
          <input type="hidden" name="count" value={Math.max(0, logged - 1)} />
          <SubmitButton
            className="btn btn-quiet btn-small"
            aria-label={`One fewer for ${task.title}`}
          >
            −
          </SubmitButton>
        </form>
        <span className="counter-value">
          {logged} / {required}
        </span>
        <form action={formAction}>
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="local_date" value={localDate} />
          <input type="hidden" name="count" value={logged + 1} />
          <SubmitButton
            className="btn btn-small"
            aria-label={`One more for ${task.title}`}
          >
            +
          </SubmitButton>
        </form>
      </div>
      {state.error && <span className="muted">{state.error}</span>}
    </div>
  );
}
