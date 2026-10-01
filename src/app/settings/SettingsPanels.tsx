'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  proposeDayEndTimeAction,
  setTimeZoneAction,
  unlinkAction,
  type ActionResult,
} from '@/lib/actions';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { TimeZoneSelect } from '@/components/TimeZoneSelect';
import { DayEndTimeSelect } from '@/components/DayEndTimeSelect';
import { formatDayEndTime, toTimeInputValue } from '@/lib/format';

/** The grace period in `public.unlink_grace_period()`, for the warning text. */
const UNLINK_GRACE_DAYS = 30;

export function SettingsPanels({
  coupleId,
  timeZone,
  dayEndTime,
  dayEndChangePending,
  partnerName,
}: {
  coupleId: string;
  timeZone: string;
  dayEndTime: string;
  dayEndChangePending: boolean;
  partnerName: string;
}) {
  const [tzState, tzAction] = useActionState<ActionResult, FormData>(setTimeZoneAction, {
    error: null,
  });
  const [dayEndState, dayEndAction] = useActionState<ActionResult, FormData>(
    proposeDayEndTimeAction,
    { error: null },
  );
  const [unlinkState, unlinkFormAction] = useActionState<ActionResult, FormData>(unlinkAction, {
    error: null,
  });
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <section className="l-panel l-stack">
        <span className="l-label">When our day ends</span>

        <p className="l-dayend">
          <span aria-hidden="true">◷</span>
          <span className="l-dayend-time">{formatDayEndTime(dayEndTime)}</span>
        </p>

        <p className="l-muted">
          You both agreed on this one time. At that time the day closes and tomorrow&apos;s list
          opens. Changing it needs you both, so this goes to {partnerName} to approve.
        </p>

        {dayEndChangePending ? (
          <p className="l-note">
            A change to this time is already waiting for approval.{' '}
            <Link href="/proposals">See it</Link>
          </p>
        ) : (
          <form action={dayEndAction} className="l-stack">
            <FormError message={dayEndState.error} />
            <div>
              <label htmlFor="day_end_time">Propose a new time</label>
              <DayEndTimeSelect defaultValue={toTimeInputValue(dayEndTime)} />
            </div>
            <div className="l-row">
              <SubmitButton className="l-btn l-btn-secondary" pendingLabel="Sending…">
                Send to {partnerName}
              </SubmitButton>
            </div>
          </form>
        )}
      </section>

      <section className="l-panel l-stack">
        <span className="l-label">Our time zone</span>
        <p className="l-muted">
          This decides which calendar day a completion lands on, wherever either of you is.
        </p>
        <form action={tzAction} className="l-stack">
          <input type="hidden" name="couple_id" value={coupleId} />
          <FormError message={tzState.error} />
          <div>
            <label htmlFor="time_zone">Time zone</label>
            <TimeZoneSelect defaultValue={timeZone} />
          </div>
          <div className="l-row">
            <SubmitButton className="l-btn l-btn-secondary" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="l-panel l-stack">
        <span className="l-label">Unlink</span>
        <p className="l-muted">
          Either of you can end the link. Your shared tasks and logs stay for {UNLINK_GRACE_DAYS}{' '}
          days in case you change your mind, then they are deleted for good.
        </p>
        <FormError message={unlinkState.error} />
        {confirming ? (
          <form action={unlinkFormAction} className="l-row">
            <SubmitButton className="l-btn l-btn-danger" pendingLabel="Unlinking…">
              Yes, unlink from {partnerName}
            </SubmitButton>
            <button type="button" className="l-btn l-btn-quiet" onClick={() => setConfirming(false)}>
              Keep our link
            </button>
          </form>
        ) : (
          <div className="l-row">
            <button type="button" className="l-btn l-btn-danger" onClick={() => setConfirming(true)}>
              Unlink
            </button>
          </div>
        )}
      </section>
    </>
  );
}
