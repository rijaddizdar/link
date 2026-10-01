'use client';

import { useActionState } from 'react';
import {
  generateInviteCodeAction,
  redeemInviteCodeAction,
  restoreLinkAction,
  type ActionResult,
} from '@/lib/actions';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { TimeZoneSelect } from '@/components/TimeZoneSelect';
import { DayEndTimeSelect } from '@/components/DayEndTimeSelect';
import { formatInviteCode } from '@/lib/invite-code';
import { toTimeInputValue } from '@/lib/format';
import type { Couple } from '@/lib/types';

/**
 * Two steps, once: share or enter a code, and agree the one time each day ends.
 * Both happen before there is any list, which is why they sit on one screen.
 */
export function LinkPanels({
  activeCode,
  currentTimeZone,
  currentDayEndTime,
  unlinkedCouple,
}: {
  activeCode: { code: string; expires_at: string } | null;
  currentTimeZone: string | null;
  currentDayEndTime: string | null;
  unlinkedCouple: Pick<Couple, 'id' | 'purge_after'> | null;
}) {
  const [generateState, generateAction] = useActionState<ActionResult, FormData>(
    generateInviteCodeAction,
    { error: null },
  );
  const [redeemState, redeemAction] = useActionState<ActionResult, FormData>(
    redeemInviteCodeAction,
    { error: null },
  );
  const [restoreState, restoreAction] = useActionState<ActionResult, FormData>(restoreLinkAction, {
    error: null,
  });

  return (
    <>
      <div className="l-banner">
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-xl)' }}>
          🔗
        </span>
        <h1>Link up</h1>
        <p>Two steps, once. Then it&apos;s just the two of you and a list.</p>
      </div>

      {unlinkedCouple && (
        <form action={restoreAction} className="l-panel l-stack">
          <input type="hidden" name="couple_id" value={unlinkedCouple.id} />
          <span className="l-label">Changed your mind?</span>
          <p className="l-muted">
            Your old link was ended, but the shared history is still here until{' '}
            {unlinkedCouple.purge_after
              ? new Date(unlinkedCouple.purge_after).toLocaleDateString()
              : 'the grace period ends'}
            . You can bring it back as long as neither of you has linked with someone else.
          </p>
          <FormError message={restoreState.error} />
          <div className="l-row">
            <SubmitButton className="l-btn l-btn-secondary" pendingLabel="Restoring…">
              Restore our link
            </SubmitButton>
          </div>
        </form>
      )}

      {/* Step 1 — the code */}
      <section className="l-panel l-stack">
        <span className="l-label">Step 1 · your code</span>

        {activeCode ? (
          <>
            <p className="l-code" data-testid="invite-code">
              {formatInviteCode(activeCode.code)}
            </p>
            <p className="l-muted">
              Send this to your partner. It works until{' '}
              {new Date(activeCode.expires_at).toLocaleDateString()}.
            </p>
          </>
        ) : (
          <p className="l-muted">
            Get a code and share it however you like. Your partner types it in on their own
            account.
          </p>
        )}

        <form action={redeemAction} className="l-stack">
          <FormError message={redeemState.error} />
          <p className="l-divider">or type theirs</p>
          <div>
            <label htmlFor="code">Their code</label>
            <input
              id="code"
              name="code"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD-2345"
            />
          </div>
          <div className="l-row">
            <SubmitButton className="l-btn l-btn-secondary" pendingLabel="Linking…">
              Link us up
            </SubmitButton>
          </div>
        </form>
      </section>

      {/* Step 2 — when the day ends, and which day it is */}
      <form action={generateAction} className="l-panel l-stack">
        <span className="l-label">Step 2 · when your day ends</span>
        <FormError message={generateState.error} />

        <div>
          <label htmlFor="day_end_time">The time your day closes</label>
          <DayEndTimeSelect
            defaultValue={currentDayEndTime ? toTimeInputValue(currentDayEndTime) : '21:00'}
          />
        </div>

        <p className="l-muted">
          You both agree on one time. At that time the day closes and tomorrow&apos;s list opens.
          Changing it later needs you both.
        </p>

        <div>
          <label htmlFor="time_zone">Your shared time zone</label>
          <TimeZoneSelect defaultValue={currentTimeZone ?? undefined} />
        </div>

        <div className="l-row">
          <SubmitButton
            className={activeCode ? 'l-btn l-btn-secondary l-btn-block' : 'l-btn l-btn-block'}
            pendingLabel="Making a code…"
          >
            {activeCode ? 'Save and make a new code' : 'Start our list'}
          </SubmitButton>
        </div>
        <p className="l-muted">You can only be linked to one person at a time.</p>
      </form>
    </>
  );
}
