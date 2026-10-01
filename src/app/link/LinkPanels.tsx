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
import { formatInviteCode } from '@/lib/invite-code';
import type { Couple } from '@/lib/types';

type ActiveCode = {
  code: string;
  expires_at: string;
};

export function LinkPanels({
  activeCode,
  currentTimeZone,
  unlinkedCouple,
}: {
  activeCode: ActiveCode | null;
  currentTimeZone: string | null;
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
  const [restoreState, restoreAction] = useActionState<ActionResult, FormData>(
    restoreLinkAction,
    { error: null },
  );

  return (
    <div className="stack">
      <div className="stack-tight">
        <h1>Link up</h1>
        <p className="muted">
          One of you shares a code, the other enters it. You only need to do this once.
        </p>
      </div>

      {unlinkedCouple && (
        <form action={restoreAction} className="card stack">
          <input type="hidden" name="couple_id" value={unlinkedCouple.id} />
          <h2>Changed your mind?</h2>
          <p className="muted">
            Your old link was ended, but the shared history is still here until{' '}
            {unlinkedCouple.purge_after
              ? new Date(unlinkedCouple.purge_after).toLocaleDateString()
              : 'the grace period ends'}
            . You can bring it back as long as neither of you has linked with someone else.
          </p>
          <FormError message={restoreState.error} />
          <div className="row">
            <SubmitButton className="btn btn-secondary" pendingLabel="Restoring…">
              Restore our link
            </SubmitButton>
          </div>
        </form>
      )}

      <section className="card card-accent stack">
        <h2>Share a code</h2>
        {activeCode ? (
          <>
            <p className="code-display" data-testid="invite-code">
              {formatInviteCode(activeCode.code)}
            </p>
            <p className="muted">
              Send this to your partner. It works until{' '}
              {new Date(activeCode.expires_at).toLocaleDateString()}.
            </p>
          </>
        ) : (
          <p className="muted">
            Pick the time zone you two live your days in — it decides when a day starts and ends
            for both of you.
          </p>
        )}

        <form action={generateAction} className="stack">
          <FormError message={generateState.error} />
          <div>
            <label htmlFor="time_zone">Your shared time zone</label>
            <TimeZoneSelect defaultValue={currentTimeZone ?? undefined} />
          </div>
          <div className="row">
            <SubmitButton
              className={activeCode ? 'btn btn-secondary' : 'btn'}
              pendingLabel="Making a code…"
            >
              {activeCode ? 'Make a new code' : 'Get our code'}
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2>Enter your partner&apos;s code</h2>
        <form action={redeemAction} className="stack">
          <FormError message={redeemState.error} />
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
          <div className="row">
            <SubmitButton className="btn btn-secondary" pendingLabel="Linking…">
              Link us up
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
