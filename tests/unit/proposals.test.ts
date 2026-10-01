import { describe, expect, it } from 'vitest';
import {
  PROPOSAL_TTL_MS,
  canApprove,
  canCancel,
  effectiveStatus,
  expiresInLabel,
  hasExpired,
  isOpen,
  msUntilExpiry,
  partitionOpenProposals,
  proposalExpiresAt,
} from '@/lib/proposals';
import type { ProposalKind, ProposalStatus, TaskProposal } from '@/lib/types';

const ALEX = 'user-alex';
const SAM = 'user-sam';
const NOW = new Date('2026-06-01T12:00:00Z');

function proposal(overrides: Partial<TaskProposal> = {}): TaskProposal {
  return {
    id: 'p1',
    couple_id: 'c1',
    task_id: null,
    kind: 'create' as ProposalKind,
    payload: { title: 'Morning walk' },
    note: '',
    proposed_by: ALEX,
    created_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() + PROPOSAL_TTL_MS).toISOString(),
    status: 'pending' as ProposalStatus,
    resolved_by: null,
    resolved_at: null,
    ...overrides,
  };
}

function atOffset(ms: number): Date {
  return new Date(NOW.getTime() + ms);
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe('proposalExpiresAt', () => {
  it('is exactly seven days after the proposal was made', () => {
    expect(proposalExpiresAt(NOW).toISOString()).toBe('2026-06-08T12:00:00.000Z');
    expect(PROPOSAL_TTL_MS).toBe(7 * DAY);
  });
});

describe('hasExpired', () => {
  it('is false inside the window', () => {
    expect(hasExpired(proposal(), atOffset(6 * DAY))).toBe(false);
  });

  it('is true at the expiry instant, not only after it', () => {
    expect(hasExpired(proposal(), atOffset(7 * DAY))).toBe(true);
  });

  it('is true after the window', () => {
    expect(hasExpired(proposal(), atOffset(8 * DAY))).toBe(true);
  });
});

describe('effectiveStatus', () => {
  it('reads a still-pending row past its expiry as expired', () => {
    // The database flips these in expire_stale_proposals(); until it runs, the
    // UI must not offer an approve button on a dead proposal.
    expect(effectiveStatus(proposal(), atOffset(8 * DAY))).toBe('expired');
  });

  it('leaves a live pending row pending', () => {
    expect(effectiveStatus(proposal(), atOffset(1 * DAY))).toBe('pending');
  });

  it('never rewrites a status that was already settled', () => {
    for (const status of ['approved', 'rejected', 'cancelled', 'expired'] as const) {
      expect(effectiveStatus(proposal({ status }), atOffset(8 * DAY))).toBe(status);
    }
  });
});

describe('isOpen', () => {
  it('is true only for a live pending proposal', () => {
    expect(isOpen(proposal(), atOffset(DAY))).toBe(true);
    expect(isOpen(proposal(), atOffset(8 * DAY))).toBe(false);
    expect(isOpen(proposal({ status: 'approved' }), atOffset(DAY))).toBe(false);
  });
});

describe('canApprove', () => {
  it('lets the partner approve', () => {
    expect(canApprove(proposal(), SAM, atOffset(DAY))).toBe(true);
  });

  it('never lets the proposer approve their own proposal', () => {
    // This is the whole point of partner approval.
    expect(canApprove(proposal(), ALEX, atOffset(DAY))).toBe(false);
  });

  it('does not let the partner approve an expired proposal', () => {
    expect(canApprove(proposal(), SAM, atOffset(7 * DAY))).toBe(false);
  });

  it('does not let the partner approve an already-settled proposal', () => {
    expect(canApprove(proposal({ status: 'rejected' }), SAM, atOffset(DAY))).toBe(false);
  });

  it('applies to edits and deletions the same way as creates', () => {
    for (const kind of ['create', 'edit', 'delete'] as const) {
      const p = proposal({ kind, task_id: kind === 'create' ? null : 't1' });
      expect(canApprove(p, SAM, atOffset(DAY))).toBe(true);
      expect(canApprove(p, ALEX, atOffset(DAY))).toBe(false);
    }
  });
});

describe('canCancel', () => {
  it('lets the proposer withdraw their own proposal', () => {
    expect(canCancel(proposal(), ALEX, atOffset(DAY))).toBe(true);
  });

  it('does not let the partner withdraw it — they decline instead', () => {
    expect(canCancel(proposal(), SAM, atOffset(DAY))).toBe(false);
  });

  it('cannot withdraw an expired proposal', () => {
    expect(canCancel(proposal(), ALEX, atOffset(8 * DAY))).toBe(false);
  });
});

describe('msUntilExpiry', () => {
  it('counts down inside the window', () => {
    expect(msUntilExpiry(proposal(), atOffset(6 * DAY))).toBe(DAY);
  });

  it('clamps at zero rather than going negative', () => {
    expect(msUntilExpiry(proposal(), atOffset(30 * DAY))).toBe(0);
  });
});

describe('expiresInLabel', () => {
  it('counts whole days down from seven', () => {
    expect(expiresInLabel(proposal(), NOW)).toBe('7 days left');
    expect(expiresInLabel(proposal(), atOffset(5 * DAY))).toBe('2 days left');
  });

  it('switches to a single day under 48 hours', () => {
    expect(expiresInLabel(proposal(), atOffset(6 * DAY))).toBe('1 day left');
  });

  it('switches to hours inside the last day', () => {
    expect(expiresInLabel(proposal(), atOffset(7 * DAY - 5 * HOUR))).toBe('5 hours left');
    expect(expiresInLabel(proposal(), atOffset(7 * DAY - 1 * HOUR))).toBe('1 hour left');
  });

  it('says less than an hour rather than zero', () => {
    expect(expiresInLabel(proposal(), atOffset(7 * DAY - 60_000))).toBe('less than an hour left');
  });

  it('says expired once the window has closed', () => {
    expect(expiresInLabel(proposal(), atOffset(7 * DAY))).toBe('expired');
  });
});

describe('partitionOpenProposals', () => {
  const fromAlex = proposal({ id: 'a', proposed_by: ALEX });
  const fromSam = proposal({ id: 's', proposed_by: SAM });
  const settled = proposal({ id: 'done', proposed_by: SAM, status: 'approved' });
  const stale = proposal({
    id: 'stale',
    proposed_by: SAM,
    expires_at: new Date(NOW.getTime() - DAY).toISOString(),
  });

  it('splits by who has to act next', () => {
    const result = partitionOpenProposals([fromAlex, fromSam], ALEX, atOffset(DAY));
    expect(result.waitingOnMe.map((p) => p.id)).toEqual(['s']);
    expect(result.waitingOnPartner.map((p) => p.id)).toEqual(['a']);
  });

  it('is the mirror image for the other partner', () => {
    const result = partitionOpenProposals([fromAlex, fromSam], SAM, atOffset(DAY));
    expect(result.waitingOnMe.map((p) => p.id)).toEqual(['a']);
    expect(result.waitingOnPartner.map((p) => p.id)).toEqual(['s']);
  });

  it('drops anything settled or expired', () => {
    const result = partitionOpenProposals([settled, stale], ALEX, atOffset(DAY));
    expect(result.waitingOnMe).toEqual([]);
    expect(result.waitingOnPartner).toEqual([]);
  });

  it('returns empty piles for an empty list', () => {
    expect(partitionOpenProposals([], ALEX, NOW)).toEqual({
      waitingOnMe: [],
      waitingOnPartner: [],
    });
  });
});

describe('expiresInLabel rounding', () => {
  it('reads as the full seven days the moment a proposal is made', () => {
    // Rounding down here would say "6 days left" on a brand new proposal.
    const justMade = proposal({ expires_at: new Date(NOW.getTime() + 7 * DAY - 1000).toISOString() });
    expect(expiresInLabel(justMade, NOW)).toBe('7 days left');
  });

  it('rounds hours to the nearest hour', () => {
    expect(expiresInLabel(proposal(), atOffset(7 * DAY - 90 * 60 * 1000))).toBe('2 hours left');
  });
});
