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
import { formatDayEndTime } from '@/lib/format';
import { WEEKDAY_LABELS, type TaskProposal } from '@/lib/types';

/**
 * One pending proposal.
 *
 * Waiting on me, it is the lime approval card — the one place lime carries a
 * whole surface. Waiting on my partner, it is a quiet dashed putty card, because
 * there is nothing for me to do but withdraw it.
 */
export function ProposalCard({
  proposal,
  taskTitle,
  proposerName,
  mine,
  position,
}: {
  proposal: TaskProposal;
  taskTitle: string | null;
  proposerName: string;
  mine: boolean;
  position?: string;
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

  const headline =
    proposal.kind === 'day_end'
      ? payload.day_end_time
        ? `Day ends at ${formatDayEndTime(payload.day_end_time)}`
        : 'A new end-of-day time'
      : payload.title ?? taskTitle ?? 'A task';

  const meta: string[] = [];
  if (proposal.kind !== 'day_end') {
    if (payload.schedule_kind) {
      meta.push(
        scheduleLabel(
          {
            schedule_kind: payload.schedule_kind,
            weekdays: payload.weekdays ?? [],
            due_date: payload.due_date ?? null,
          },
          WEEKDAY_LABELS,
        ),
      );
    }
    if (payload.target_count != null) meta.push(`Counter · target ${payload.target_count} a day`);
  }

  const detail = (
    <div className="l-approval-inset">
      <span className="l-task-title">
        {proposal.kind !== 'day_end' && <span aria-hidden="true">{payload.emoji ?? '💞'} </span>}
        {headline}
      </span>
      {meta.length > 0 && <span className="l-task-meta">{meta.join(' · ')}</span>}
      {payload.description ? <p className="l-task-note">{payload.description}</p> : null}
      {proposal.note ? <p className="l-task-note">&ldquo;{proposal.note}&rdquo;</p> : null}
    </div>
  );

  const error = approveState.error ?? rejectState.error ?? cancelState.error;

  if (mine) {
    return (
      <article className="l-mine-out" data-testid="proposal-card">
        <div className="l-spread">
          <span className="l-label">Waiting for {proposerName}</span>
          <span className="l-chip">{expiresInLabel(proposal)}</span>
        </div>
        <p>
          You {PROPOSAL_KIND_LABELS[proposal.kind]}
        </p>
        {detail}
        <FormError message={error} />
        <form action={cancel} className="l-row">
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <SubmitButton className="l-btn l-btn-quiet l-btn-small" pendingLabel="Withdrawing…">
            Withdraw
          </SubmitButton>
        </form>
      </article>
    );
  }

  return (
    <article className="l-approval" data-testid="proposal-card">
      <div className="l-spread">
        <span className="l-label">Needs your ok</span>
        <span className="l-chip">{position ?? expiresInLabel(proposal)}</span>
      </div>

      <p>
        <strong>{proposerName}</strong> {PROPOSAL_KIND_LABELS[proposal.kind]}
      </p>

      {detail}

      <p className="l-muted">
        Nothing on your shared list changes until you both agree. {expiresInLabel(proposal)}.
      </p>

      <FormError message={error} />

      <div className="l-row">
        <form action={approve}>
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <SubmitButton className="l-btn" pendingLabel="Approving…">
            Approve
          </SubmitButton>
        </form>
        <form action={reject}>
          <input type="hidden" name="proposal_id" value={proposal.id} />
          <SubmitButton className="l-btn l-btn-quiet" pendingLabel="Declining…">
            Not now
          </SubmitButton>
        </form>
      </div>
    </article>
  );
}
