'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from './SubmitButton';
import { FormError } from './FormError';
import type { ActionResult } from '@/lib/actions';
import { TASK_COLORS, WEEKDAY_LABELS, type IsoWeekday, type TaskDraft } from '@/lib/types';

const ALL_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * The one form behind adding and changing a task. Both paths send a *proposal*,
 * never a direct write, which is why the submit label says so.
 */
export function TaskForm({
  action,
  taskId,
  initial,
  submitLabel,
  today,
}: {
  action: Action;
  taskId?: string;
  initial?: TaskDraft;
  submitLabel: string;
  today: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { error: null });
  const [scheduleKind, setScheduleKind] = useState(initial?.schedule_kind ?? 'daily');
  const [hasTarget, setHasTarget] = useState(initial?.target_count != null);

  return (
    <form action={formAction} className="stack">
      {taskId && <input type="hidden" name="task_id" value={taskId} />}
      <FormError message={state.error} />

      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={120}
          defaultValue={initial?.title}
          placeholder="Morning walk together"
        />
      </div>

      <div>
        <label htmlFor="description">Notes (optional)</label>
        <textarea
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={initial?.description}
          placeholder="What counts as done?"
        />
      </div>

      <div className="row">
        <div style={{ width: '6rem' }}>
          <label htmlFor="emoji">Emoji</label>
          <input
            id="emoji"
            name="emoji"
            type="text"
            maxLength={8}
            defaultValue={initial?.emoji ?? '💞'}
          />
        </div>
      </div>

      <fieldset>
        <legend>Colour</legend>
        <div className="swatch-row">
          {TASK_COLORS.map((color) => (
            <label
              key={color}
              className="swatch"
              style={{ ['--swatch-color' as string]: `var(--task-${color})` }}
            >
              <input
                type="radio"
                name="color"
                value={color}
                defaultChecked={(initial?.color ?? 'blush') === color}
              />
              <span className="swatch-dot" aria-hidden="true" />
              {color}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>How often</legend>
        <div className="check-row">
          {(
            [
              ['daily', 'Every day'],
              ['weekdays', 'Chosen days'],
              ['once', 'One time'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="check-chip">
              <input
                type="radio"
                name="schedule_kind"
                value={value}
                checked={scheduleKind === value}
                onChange={() => setScheduleKind(value)}
              />
              {label}
            </label>
          ))}
        </div>

        {scheduleKind === 'weekdays' && (
          <div className="check-row" style={{ marginTop: 'var(--space-3)' }}>
            {ALL_WEEKDAYS.map((day) => (
              <label key={day} className="check-chip">
                <input
                  type="checkbox"
                  name="weekdays"
                  value={day}
                  defaultChecked={initial?.weekdays.includes(day) ?? false}
                />
                {WEEKDAY_LABELS[day]}
              </label>
            ))}
          </div>
        )}

        {scheduleKind === 'once' && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <label htmlFor="due_date">On</label>
            <input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={initial?.due_date ?? today}
            />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Target</legend>
        <label className="check-chip">
          <input
            type="checkbox"
            checked={hasTarget}
            onChange={(e) => setHasTarget(e.target.checked)}
          />
          Count up to a number
        </label>
        {hasTarget ? (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <label htmlFor="target_count">Done when we reach</label>
            <input
              id="target_count"
              name="target_count"
              type="number"
              min={1}
              max={10000}
              defaultValue={initial?.target_count ?? 8}
            />
            <p className="muted">For example 8 glasses of water.</p>
          </div>
        ) : (
          <p className="muted">Otherwise it is a simple done / not done.</p>
        )}
      </fieldset>

      <div>
        <label htmlFor="note">Message to your partner (optional)</label>
        <input id="note" name="note" type="text" maxLength={500} placeholder="Shall we try this?" />
      </div>

      <div className="row">
        <SubmitButton pendingLabel="Sending…">{submitLabel}</SubmitButton>
      </div>
      <p className="muted">
        This goes to your partner first. It joins your shared list once they approve it.
      </p>
    </form>
  );
}
