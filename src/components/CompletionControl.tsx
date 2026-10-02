'use client';

import { useActionState } from 'react';
import { setCompletionAction, type ActionResult } from '@/lib/actions';
import { isDone, requiredCount } from '@/lib/schedule';
import type { Task, TaskCompletion } from '@/lib/types';

/**
 * My own column: the only place a completion is logged. A plain task is a tick
 * box; a task with a target is a counter with the same 40×40 shell, so the two
 * columns stay aligned down the whole list.
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

  const hidden = (count: number) => (
    <>
      <input type="hidden" name="task_id" value={task.id} />
      <input type="hidden" name="local_date" value={localDate} />
      <input type="hidden" name="count" value={count} />
    </>
  );

  if (task.target_count == null) {
    return (
      <form action={formAction}>
        {hidden(done ? 0 : 1)}
        <button
          type="submit"
          className={done ? 'l-box l-box-mine l-box-done' : 'l-box l-box-mine'}
          aria-label={done ? `Undo ${task.title}` : `Mark ${task.title} done`}
          aria-pressed={done}
        >
          <span className="l-box-check" aria-hidden="true">
            {done ? '✓' : ''}
          </span>
        </button>
        {state.error && <span className="l-visually-hidden">{state.error}</span>}
      </form>
    );
  }

  return (
    <div className="l-counter">
      <form action={formAction}>
        {hidden(logged + 1)}
        <button
          type="submit"
          className="l-counter-step"
          aria-label={`One more for ${task.title}`}
        >
          +
        </button>
      </form>

      <div className={done ? 'l-box l-box-mine l-box-done' : 'l-box l-box-mine'}>
        <span className="l-box-count">{logged}</span>
        <span className="l-box-target">/{required}</span>
      </div>

      <form action={formAction}>
        {hidden(Math.max(0, logged - 1))}
        <button
          type="submit"
          className="l-counter-step"
          disabled={logged === 0}
          aria-label={`One fewer for ${task.title}`}
        >
          −
        </button>
      </form>
      {state.error && <span className="l-visually-hidden">{state.error}</span>}
    </div>
  );
}
