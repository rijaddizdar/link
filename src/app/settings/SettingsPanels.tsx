'use client';

import { useActionState, useState } from 'react';
import { setTimeZoneAction, unlinkAction, type ActionResult } from '@/lib/actions';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { TimeZoneSelect } from '@/components/TimeZoneSelect';

/** The grace period in `public.unlink_grace_period()`, for the warning text. */
const UNLINK_GRACE_DAYS = 30;

export function SettingsPanels({
  coupleId,
  timeZone,
  partnerName,
}: {
  coupleId: string;
  timeZone: string;
  partnerName: string;
}) {
  const [tzState, tzAction] = useActionState<ActionResult, FormData>(setTimeZoneAction, {
    error: null,
  });
  const [unlinkState, unlinkFormAction] = useActionState<ActionResult, FormData>(unlinkAction, {
    error: null,
  });
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Our time zone</h2>
        <p className="muted">
          This decides when a day starts and ends for both of you, wherever either of you is.
        </p>
        <form action={tzAction} className="stack">
          <input type="hidden" name="couple_id" value={coupleId} />
          <FormError message={tzState.error} />
          <div>
            <label htmlFor="time_zone">Time zone</label>
            <TimeZoneSelect defaultValue={timeZone} />
          </div>
          <div className="row">
            <SubmitButton className="btn btn-secondary" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2>Unlink</h2>
        <p className="muted">
          Either of you can end the link. Your shared tasks and logs stay for{' '}
          {UNLINK_GRACE_DAYS} days in case you change your mind, then they are deleted for good.
        </p>
        <FormError message={unlinkState.error} />
        {confirming ? (
          <form action={unlinkFormAction} className="row">
            <SubmitButton className="btn btn-danger" pendingLabel="Unlinking…">
              Yes, unlink from {partnerName}
            </SubmitButton>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
              Keep our link
            </button>
          </form>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
              Unlink
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
