'use client';

import { useActionState } from 'react';
import {
  approveProposalAction,
  cancelProposalAction,
  rejectProposalAction,
  type ActionResult,
} from '@/lib/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { FormError } from '@/components/FormError';
import { PROPOSAL_KIND_LABELS, expiresInLabel } from '@/lib/proposals';
import { scheduleLabel } from '@/lib/schedule';
import { WEEKDAY_LABELS, type TaskProposal } from '@/lib/types';

/** One pending proposal, with the buttons the viewer is actually allowed to use. */
export function ProposalCard({
  proposal,
  taskTitle,
  proposerName,
  mine,
}: {
  proposal: TaskProposal;
  taskTitle: string | null;
  proposerName: string;
  mine: boolean;
}) {
  const [approveState, approve] = useActionState<ActionResult, FormData>(approveProposalAction, {
    error: null,
  });
  const [rejectState, reject] = useActionState<ActionResult, FormData>(rejectProposalAction, {
    error: null,
  });
  const [cancelState, cancel] = useActionState<ActionResult, FormData>(cancelProposalAction, {
    error: null,
  });

  const payload = proposal.payload;
  const title = payload.title ?? taskTitle ?? 'A task';
  const colorToken = `var(--task-${payload.color ?? 'blush'})`;

  return (
    <article
      className="task-card"
      style={{ ['--task-accent' as string]: colorToken }}
      data-testid="proposal-card"
    >
      <div className="task-head">
        <span className="task-emoji" aria-hidden="true">
          {payload.emoji ?? '💞'}
        </span>
        <div className="stack-tight" style={{ minWidth: 0, flex: 1 }}>
          <span className="muted">
            {proposerName} {PROPOSAL_KIND_LABELS[proposal.kind]}
          </span>
          <span className="task-title">{title}</span>
          <div className="row">
            <span className="chip">{expiresInLabel(proposal)}</span>
            {payload.schedule_kind && (
              <span className="chip">
                {scheduleLabel(
                  {
                    schedule_kind: payload.schedule_kind,
                    weekdays: payload.weekdays ?? [],
                    due_date: payload.due_date ?? null,
                  },
                  WEEKDAY_LABELS,
                )}
              </span>
            )}
            {payload.target_count != null && (
              <span className="chip">Target {payload.target_count}</span>
            )}
          </div>
          {payload.description ? <p className="muted">{payload.description}</p> : null}
          {proposal.note ? <p className="notice">&ldquo;{proposal.note}&rdquo;</p> : null}
        </div>
      </div>

      <FormError message={approveState.error ?? rejectState.error ?? cancelState.error} />

      {mine ? (
        <form action={cancel} className="row">
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <SubmitButton className="btn btn-quiet btn-small" pendingLabel="Withdrawing…">
            Withdraw
          </SubmitButton>
        </form>
      ) : (
        <div className="row">
          <form action={approve}>
            <input type="hidden" name="proposal_id" value={proposal.id} />
            <SubmitButton className="btn btn-small" pendingLabel="Approving…">
              Approve
            </SubmitButton>
          </form>
          <form action={reject}>
            <input type="hidden" name="proposal_id" value={proposal.id} />
            <SubmitButton className="btn btn-danger btn-small" pendingLabel="Declining…">
              Decline
            </SubmitButton>
          </form>
        </div>
      )}
    </article>
  );
}
