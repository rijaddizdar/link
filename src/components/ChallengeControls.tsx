'use client';

import { useActionState, useState } from 'react';
import {
  concedeChallengeAction,
  raiseChallengeAction,
  standByLogAction,
  withdrawChallengeAction,
  type ActionResult,
} from '@/lib/actions';
import { SubmitButton } from './SubmitButton';
import { FormError } from './FormError';
import type { CompletionChallenge, Task } from '@/lib/types';

const NO_ERROR: ActionResult = { error: null };

/**
 * Asking about your partner's log, and answering when they ask about yours.
 *
 * Logs are trusted: asking never removes anything. The only thing that clears a
 * log is the person who made it conceding, which is why "That's fair" sits on
 * their side and "Ask about it" on the other.
 */
export function ChallengeControls({
  task,
  localDate,
  challenge,
  isMine,
  partnerName,
  canAsk,
}: {
  task: Task;
  localDate: string;
  challenge: CompletionChallenge | null;
  /** True when the log in question is the signed-in partner's own. */
  isMine: boolean;
  partnerName: string;
  canAsk: boolean;
}) {
  const [raiseState, raise] = useActionState<ActionResult, FormData>(raiseChallengeAction, NO_ERROR);
  const [concedeState, concede] = useActionState<ActionResult, FormData>(
    concedeChallengeAction,
    NO_ERROR,
  );
  const [standState, stand] = useActionState<ActionResult, FormData>(standByLogAction, NO_ERROR);
  const [withdrawState, withdraw] = useActionState<ActionResult, FormData>(
    withdrawChallengeAction,
    NO_ERROR,
  );
  const [asking, setAsking] = useState(false);

  const error =
    raiseState.error ?? concedeState.error ?? standState.error ?? withdrawState.error;

  if (challenge) {
    return (
      <div className="l-challenge" data-testid="challenge">
        <span className="l-label">
          {isMine ? `${partnerName} asked about this` : 'You asked about this'}
        </span>
        {challenge.reason && <p className="l-task-note">&ldquo;{challenge.reason}&rdquo;</p>}
        <FormError message={error} />
        <div className="l-row">
          {isMine ? (
            <>
              <form action={concede}>
                <input type="hidden" name="challenge_id" value={challenge.id} />
                <SubmitButton className="l-btn l-btn-quiet l-btn-small" pendingLabel="…">
                  That&apos;s fair
                </SubmitButton>
              </form>
              <form action={stand}>
                <input type="hidden" name="challenge_id" value={challenge.id} />
                <SubmitButton className="l-btn l-btn-small" pendingLabel="…">
                  I did it
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={withdraw}>
              <input type="hidden" name="challenge_id" value={challenge.id} />
              <SubmitButton className="l-btn l-btn-quiet l-btn-small" pendingLabel="…">
                Never mind
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (isMine || !canAsk) return null;

  if (!asking) {
    return (
      <button
        type="button"
        className="l-ask"
        onClick={() => setAsking(true)}
        aria-label={`Ask ${partnerName} about ${task.title}`}
      >
        Ask about it
      </button>
    );
  }

  return (
    <form action={raise} className="l-challenge">
      <input type="hidden" name="task_id" value={task.id} />
      <input type="hidden" name="local_date" value={localDate} />
      <span className="l-label">Ask {partnerName} about this</span>
      <FormError message={error} />
      <input type="text" name="reason" maxLength={500} placeholder="Really, all eight?" />
      <p className="l-task-note">
        This only asks — it does not remove anything. Only {partnerName} can clear their own log.
      </p>
      <div className="l-row">
        <SubmitButton className="l-btn l-btn-small" pendingLabel="Asking…">
          Ask
        </SubmitButton>
        <button type="button" className="l-btn l-btn-quiet l-btn-small" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
