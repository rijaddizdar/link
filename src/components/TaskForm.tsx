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
 *
 * "How do you log it?" is the fork that matters: a tick box is done or not done,
 * a counter is a number you add to until you reach its target. A counter always
 * has a target — there is no such thing as one without.
 */
export function TaskForm({
  action,
  taskId,
  initial,
  submitLabel,
  today,
  partnerName,
}: {
  action: Action;
  taskId?: string;
  initial?: TaskDraft;
  submitLabel: string;
  today: string;
  partnerName: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { error: null });
  const [scheduleKind, setScheduleKind] = useState(initial?.schedule_kind ?? 'daily');
  const [isCounter, setIsCounter] = useState(initial?.target_count != null);

  return (
    <form action={formAction} className="l-stack">
      {taskId && <input type="hidden" name="task_id" value={taskId} />}
      <FormError message={state.error} />

      <div>
        <label htmlFor="title">Name</label>
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

      <fieldset>
        <legend>How do you log it?</legend>
        <div className="l-options">
          <label className="l-option">
            <input
              type="radio"
              name="log_kind"
              value="tick"
              checked={!isCounter}
              onChange={() => setIsCounter(false)}
              className="l-visually-hidden"
            />
            <span className="l-option-demo" aria-hidden="true">
              ✓
            </span>
            <span className="l-option-name">Tick it off</span>
            <span className="l-option-hint">Done or not done.</span>
          </label>

          <label className="l-option">
            <input
              type="radio"
              name="log_kind"
              value="count"
              checked={isCounter}
              onChange={() => setIsCounter(true)}
              className="l-visually-hidden"
            />
            <span className="l-option-demo l-option-demo-count" aria-hidden="true">
              7
            </span>
            <span className="l-option-name">Count it</span>
            <span className="l-option-hint">A number you add to, until you hit a target.</span>
          </label>
        </div>

        {isCounter && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <label htmlFor="target_count">Target for the day</label>
            <input
              id="target_count"
              name="target_count"
              type="number"
              min={1}
              max={10000}
              required
              defaultValue={initial?.target_count ?? 5}
            />
            <p className="l-muted">
              It counts as done once you reach it. Each of you has your own number.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>How often</legend>
        <div className="l-choices">
          {(
            [
              ['daily', 'Every day'],
              ['weekdays', 'Chosen days'],
              ['once', 'One time'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="l-choice">
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
          <div className="l-choices" style={{ marginTop: 'var(--space-3)' }}>
            {ALL_WEEKDAYS.map((day) => (
              <label key={day} className="l-choice">
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
        <legend>Look</legend>
        <div className="l-row" style={{ marginBottom: 'var(--space-3)' }}>
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
        <div className="l-swatches">
          {TASK_COLORS.map((color) => (
            <label
              key={color}
              className="l-swatch"
              style={{ ['--swatch-colour' as string]: `var(--task-${color})` }}
            >
              <input
                type="radio"
                name="color"
                value={color}
                defaultChecked={(initial?.color ?? 'blush') === color}
              />
              <span className="l-swatch-dot" aria-hidden="true" />
              {color}
            </label>
          ))}
        </div>
      </fieldset>

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

      <div>
        <label htmlFor="note">Message to your partner (optional)</label>
        <input id="note" name="note" type="text" maxLength={500} placeholder="Shall we try this?" />
      </div>

      <p className="l-muted">
        {partnerName} has to approve this before it joins your list.
      </p>

      <div className="l-row">
        <SubmitButton pendingLabel="Sending…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
