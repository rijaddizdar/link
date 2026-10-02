/**
 * Partner approval: nothing one partner proposes lands on the shared list until
 * the other says yes, and an unanswered proposal stops mattering after a week.
 *
 * The database enforces all of this in `approve_proposal` / `reject_proposal` /
 * `cancel_proposal` / `expire_stale_proposals`. These functions are the same
 * rules in TypeScript so the UI can show the right buttons and the right
 * wording without asking the server first.
 */

import type { ProposalKind, ProposalStatus, TaskProposal } from './types';

/** Seven days, matching `public.proposal_ttl()`. */
export const PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function proposalExpiresAt(createdAt: Date | string): Date {
  return new Date(new Date(createdAt).getTime() + PROPOSAL_TTL_MS);
}

export function hasExpired(
  proposal: Pick<TaskProposal, 'expires_at'>,
  now: Date = new Date(),
): boolean {
  return new Date(proposal.expires_at).getTime() <= now.getTime();
}

/**
 * The status to show. A row still marked 'pending' past its expiry reads as
 * expired, because `expire_stale_proposals()` has simply not run yet.
 */
export function effectiveStatus(
  proposal: Pick<TaskProposal, 'status' | 'expires_at'>,
  now: Date = new Date(),
): ProposalStatus {
  if (proposal.status === 'pending' && hasExpired(proposal, now)) return 'expired';
  return proposal.status;
}

export function isOpen(
  proposal: Pick<TaskProposal, 'status' | 'expires_at'>,
  now: Date = new Date(),
): boolean {
  return effectiveStatus(proposal, now) === 'pending';
}

/** Only the *other* partner can approve or reject. */
export function canApprove(
  proposal: Pick<TaskProposal, 'status' | 'expires_at' | 'proposed_by'>,
  userId: string,
  now: Date = new Date(),
): boolean {
  return isOpen(proposal, now) && proposal.proposed_by !== userId;
}

/** Only the partner who proposed it can withdraw it. */
export function canCancel(
  proposal: Pick<TaskProposal, 'status' | 'expires_at' | 'proposed_by'>,
  userId: string,
  now: Date = new Date(),
): boolean {
  return isOpen(proposal, now) && proposal.proposed_by === userId;
}

export function msUntilExpiry(
  proposal: Pick<TaskProposal, 'expires_at'>,
  now: Date = new Date(),
): number {
  return Math.max(0, new Date(proposal.expires_at).getTime() - now.getTime());
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * "7 days left" / "4 hours left" / "expired".
 *
 * Rounds to the nearest unit rather than down, so a proposal made a moment ago
 * reads as the full seven days instead of six.
 */
export function expiresInLabel(
  proposal: Pick<TaskProposal, 'expires_at'>,
  now: Date = new Date(),
): string {
  const ms = msUntilExpiry(proposal, now);
  if (ms === 0) return 'expired';
  if (ms < HOUR_MS) return 'less than an hour left';
  if (ms < DAY_MS) {
    const hours = Math.round(ms / HOUR_MS);
    return hours === 1 ? '1 hour left' : `${hours} hours left`;
  }
  const days = Math.max(1, Math.round(ms / DAY_MS));
  return days === 1 ? '1 day left' : `${days} days left`;
}

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  create: 'wants to add',
  edit: 'wants to change',
  delete: 'wants to remove',
  day_end: 'wants to move when your day ends',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
  expired: 'Expired',
};

/**
 * Partitions proposals into the two piles the UI shows: ones waiting on me, and
 * ones I proposed and am waiting on. Anything resolved or expired drops out.
 */
export function partitionOpenProposals<T extends Pick<TaskProposal, 'status' | 'expires_at' | 'proposed_by'>>(
  proposals: T[],
  userId: string,
  now: Date = new Date(),
): { waitingOnMe: T[]; waitingOnPartner: T[] } {
  const waitingOnMe: T[] = [];
  const waitingOnPartner: T[] = [];
  for (const proposal of proposals) {
    if (!isOpen(proposal, now)) continue;
    if (proposal.proposed_by === userId) waitingOnPartner.push(proposal);
    else waitingOnMe.push(proposal);
  }
  return { waitingOnMe, waitingOnPartner };
}
