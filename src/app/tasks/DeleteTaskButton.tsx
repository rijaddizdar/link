'use client';

import { useActionState } from 'react';
import { proposeTaskDeleteAction, type ActionResult } from '@/lib/actions';
import { SubmitButton } from '@/components/SubmitButton';

/** Removing a task is a proposal too: the partner has to agree to it. */
export function DeleteTaskButton({ taskId, title }: { taskId: string; title: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(proposeTaskDeleteAction, {
    error: null,
  });

  return (
    <form action={action} className="row">
      <input type="hidden" name="task_id" value={taskId} />
      <SubmitButton
        className="btn btn-danger btn-small"
        pendingLabel="Sending…"
        aria-label={`Propose removing ${title}`}
      >
        Propose removal
      </SubmitButton>
      {state.error && <span className="muted">{state.error}</span>}
    </form>
  );
}
