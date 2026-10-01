import { describe, expect, it } from 'vitest';
import {
  coupleLocalDate,
  isDone,
  isScheduledOn,
  isoWeekdayOf,
  loggedCount,
  progressFraction,
  requiredCount,
  scheduleLabel,
  tasksScheduledOn,
} from '@/lib/schedule';
import { WEEKDAY_LABELS, type IsoWeekday, type Task, type TaskDraft } from '@/lib/types';

function draft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: 'Water',
    description: '',
    emoji: '💧',
    color: 'blush',
    schedule_kind: 'daily',
    weekdays: [],
    due_date: null,
    target_count: null,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    ...draft(),
    id: 't1',
    couple_id: 'c1',
    created_by: 'u1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

describe('coupleLocalDate', () => {
  it('uses the couple time zone, not the machine time zone', () => {
    // 23:30 UTC is already the next day in Tokyo and still the previous one in Honolulu.
    const at = new Date('2026-06-01T23:30:00Z');
    expect(coupleLocalDate('Asia/Tokyo', at)).toBe('2026-06-02');
    expect(coupleLocalDate('UTC', at)).toBe('2026-06-01');
    expect(coupleLocalDate('Pacific/Honolulu', at)).toBe('2026-06-01');
  });

  it('returns a zero-padded ISO date', () => {
    expect(coupleLocalDate('UTC', new Date('2026-01-05T10:00:00Z'))).toBe('2026-01-05');
  });
});

describe('isoWeekdayOf', () => {
  it('maps Monday to 1 and Sunday to 7', () => {
    expect(isoWeekdayOf('2026-06-01')).toBe(1); // Monday
    expect(isoWeekdayOf('2026-06-07')).toBe(7); // Sunday
  });

  it('covers a whole week in order', () => {
    const week = [
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ];
    expect(week.map(isoWeekdayOf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('isScheduledOn', () => {
  it('schedules a daily task on every day', () => {
    expect(isScheduledOn(draft(), '2026-06-01')).toBe(true);
    expect(isScheduledOn(draft(), '2026-06-07')).toBe(true);
  });

  it('schedules a weekday task only on the chosen days', () => {
    const weekdayTask = draft({ schedule_kind: 'weekdays', weekdays: [1, 3, 5] });
    expect(isScheduledOn(weekdayTask, '2026-06-01')).toBe(true); // Monday
    expect(isScheduledOn(weekdayTask, '2026-06-02')).toBe(false); // Tuesday
    expect(isScheduledOn(weekdayTask, '2026-06-05')).toBe(true); // Friday
    expect(isScheduledOn(weekdayTask, '2026-06-07')).toBe(false); // Sunday
  });

  it('schedules a one-time task on exactly its date', () => {
    const once = draft({ schedule_kind: 'once', due_date: '2026-06-03' });
    expect(isScheduledOn(once, '2026-06-03')).toBe(true);
    expect(isScheduledOn(once, '2026-06-02')).toBe(false);
    expect(isScheduledOn(once, '2026-06-04')).toBe(false);
  });
});

describe('tasksScheduledOn', () => {
  it('keeps only what is scheduled and drops archived tasks', () => {
    const tasks = [
      task({ id: 'daily' }),
      task({ id: 'tue', schedule_kind: 'weekdays', weekdays: [2] }),
      task({ id: 'gone', archived_at: '2026-06-01T00:00:00Z' }),
    ];
    expect(tasksScheduledOn(tasks, '2026-06-01').map((t) => t.id)).toEqual(['daily']);
    expect(tasksScheduledOn(tasks, '2026-06-02').map((t) => t.id)).toEqual(['daily', 'tue']);
  });
});

describe('requiredCount / loggedCount', () => {
  it('needs one for a simple task', () => {
    expect(requiredCount(draft())).toBe(1);
  });

  it('needs the target when one is set', () => {
    expect(requiredCount(draft({ target_count: 8 }))).toBe(8);
  });

  it('treats a missing log as zero', () => {
    expect(loggedCount(null)).toBe(0);
    expect(loggedCount({ count: 3 })).toBe(3);
  });
});

describe('isDone', () => {
  it('is false with nothing logged', () => {
    expect(isDone(draft(), null)).toBe(false);
  });

  it('is true once a simple task is logged', () => {
    expect(isDone(draft(), { count: 1 })).toBe(true);
  });

  it('needs the full target for a counted task', () => {
    const water = draft({ target_count: 8 });
    expect(isDone(water, { count: 7 })).toBe(false);
    expect(isDone(water, { count: 8 })).toBe(true);
  });

  it('stays done past the target', () => {
    expect(isDone(draft({ target_count: 8 }), { count: 11 })).toBe(true);
  });
});

describe('progressFraction', () => {
  it('reports partial progress toward a target', () => {
    expect(progressFraction(draft({ target_count: 8 }), { count: 2 })).toBe(0.25);
  });

  it('is zero with nothing logged', () => {
    expect(progressFraction(draft({ target_count: 8 }), null)).toBe(0);
  });

  it('clamps at one so the bar never overflows', () => {
    expect(progressFraction(draft({ target_count: 8 }), { count: 20 })).toBe(1);
  });
});

describe('scheduleLabel', () => {
  it('describes each schedule in words', () => {
    expect(scheduleLabel(draft(), WEEKDAY_LABELS)).toBe('Every day');
    expect(
      scheduleLabel(draft({ schedule_kind: 'weekdays', weekdays: [5, 1] }), WEEKDAY_LABELS),
    ).toBe('Mon, Fri');
    expect(
      scheduleLabel(draft({ schedule_kind: 'once', due_date: '2026-06-03' }), WEEKDAY_LABELS),
    ).toBe('Once, on 2026-06-03');
  });

  it('calls all seven weekdays "every day"', () => {
    const all = [1, 2, 3, 4, 5, 6, 7] as IsoWeekday[];
    expect(scheduleLabel(draft({ schedule_kind: 'weekdays', weekdays: all }), WEEKDAY_LABELS)).toBe(
      'Every day',
    );
  });
});
