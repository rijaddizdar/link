import { describe, expect, it } from 'vitest';
import {
  datesInMonth,
  dayOutcome,
  isTie,
  leadingBlanks,
  monthOf,
  scoreDay,
  sharedStreak,
  tallyMonth,
  winMargin,
} from '@/lib/scoring';
import type { DayResult, Task, TaskCompletion } from '@/lib/types';

const ALEX = 'alex';
const SAM = 'sam';
const BOTH = [ALEX, SAM];
const DATE = '2026-10-02'; // a Friday

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    couple_id: 'c1',
    title: id,
    description: '',
    emoji: '💞',
    color: 'blush',
    schedule_kind: 'daily',
    weekdays: [],
    due_date: null,
    target_count: null,
    created_by: ALEX,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

function log(taskId: string, userId: string, count = 1, localDate = DATE): TaskCompletion {
  return {
    id: `${taskId}-${userId}-${localDate}`,
    task_id: taskId,
    user_id: userId,
    local_date: localDate,
    count,
    completed_at: '2026-10-02T10:00:00Z',
  };
}

function dayResult(overrides: Partial<DayResult> = {}): DayResult {
  return {
    couple_id: 'c1',
    local_date: DATE,
    scheduled_count: 2,
    scores: { [ALEX]: 2, [SAM]: 2 },
    winner_user_id: null,
    both_complete: true,
    settled_at: '2026-10-02T19:00:00Z',
    ...overrides,
  };
}

describe('scoreDay', () => {
  it('counts only the tasks scheduled that day', () => {
    const tasks = [
      task('daily'),
      task('mondays', { schedule_kind: 'weekdays', weekdays: [1] }),
      task('fridays', { schedule_kind: 'weekdays', weekdays: [5] }),
    ];
    const result = scoreDay(tasks, [log('daily', ALEX), log('mondays', ALEX)], BOTH, DATE);
    // Monday's task is not on today's list, so logging it earns nothing.
    expect(result.scheduledCount).toBe(2);
    expect(result.scores[ALEX]).toBe(1);
  });

  it('gives the day to whoever did more', () => {
    const tasks = [task('a'), task('b'), task('c')];
    const result = scoreDay(
      tasks,
      [log('a', ALEX), log('b', ALEX), log('a', SAM)],
      BOTH,
      DATE,
    );
    expect(result.scores).toEqual({ [ALEX]: 2, [SAM]: 1 });
    expect(result.winnerUserId).toBe(ALEX);
  });

  it('calls equal counts a tie, not a win for either', () => {
    const tasks = [task('a'), task('b')];
    const result = scoreDay(tasks, [log('a', ALEX), log('a', SAM)], BOTH, DATE);
    expect(result.winnerUserId).toBeNull();
  });

  it('treats a day where neither did anything as a tie, not a win at zero', () => {
    const result = scoreDay([task('a')], [], BOTH, DATE);
    expect(result.scores).toEqual({ [ALEX]: 0, [SAM]: 0 });
    expect(result.winnerUserId).toBeNull();
    expect(result.bothComplete).toBe(false);
  });

  it('needs a counter to reach its target before it counts', () => {
    const tasks = [task('water', { target_count: 8 })];
    const result = scoreDay(tasks, [log('water', ALEX, 8), log('water', SAM, 7)], BOTH, DATE);
    expect(result.scores).toEqual({ [ALEX]: 1, [SAM]: 0 });
    expect(result.winnerUserId).toBe(ALEX);
  });

  it('counts a counter past its target once, not twice', () => {
    const tasks = [task('water', { target_count: 5 })];
    const result = scoreDay(tasks, [log('water', ALEX, 50)], BOTH, DATE);
    expect(result.scores[ALEX]).toBe(1);
  });

  it('ignores logs from another day', () => {
    const tasks = [task('a')];
    const result = scoreDay(tasks, [log('a', ALEX, 1, '2026-10-01')], BOTH, DATE);
    expect(result.scores[ALEX]).toBe(0);
  });

  it('ignores archived tasks', () => {
    const tasks = [task('a'), task('gone', { archived_at: '2026-10-01T00:00:00Z' })];
    const result = scoreDay(tasks, [log('a', ALEX)], BOTH, DATE);
    expect(result.scheduledCount).toBe(1);
  });

  it('flags a day both of them cleared', () => {
    const tasks = [task('a'), task('b')];
    const result = scoreDay(
      tasks,
      [log('a', ALEX), log('b', ALEX), log('a', SAM), log('b', SAM)],
      BOTH,
      DATE,
    );
    expect(result.bothComplete).toBe(true);
    expect(result.winnerUserId).toBeNull();
  });

  it('is not a clear day when nothing was scheduled', () => {
    const result = scoreDay([], [], BOTH, DATE);
    expect(result.scheduledCount).toBe(0);
    expect(result.bothComplete).toBe(false);
    expect(result.winnerUserId).toBeNull();
  });
});

describe('winMargin', () => {
  it('is the gap between the two', () => {
    expect(winMargin({ scores: { [ALEX]: 4, [SAM]: 1 }, winner_user_id: ALEX })).toBe(3);
  });

  it('is zero on a tie', () => {
    expect(winMargin({ scores: { [ALEX]: 2, [SAM]: 2 }, winner_user_id: null })).toBe(0);
  });
});

describe('isTie', () => {
  it('is a tie exactly when nobody won', () => {
    expect(isTie({ winner_user_id: null })).toBe(true);
    expect(isTie({ winner_user_id: ALEX })).toBe(false);
  });
});

describe('sharedStreak', () => {
  it('counts back from the most recent settled day', () => {
    const results = [
      dayResult({ local_date: '2026-10-01', both_complete: true }),
      dayResult({ local_date: '2026-10-02', both_complete: true }),
      dayResult({ local_date: '2026-10-03', both_complete: true }),
    ];
    expect(sharedStreak(results)).toBe(3);
  });

  it('stops at the first day they did not both clear', () => {
    const results = [
      dayResult({ local_date: '2026-10-01', both_complete: true }),
      dayResult({ local_date: '2026-10-02', both_complete: false }),
      dayResult({ local_date: '2026-10-03', both_complete: true }),
    ];
    expect(sharedStreak(results)).toBe(1);
  });

  it('is zero when the latest day was missed', () => {
    expect(sharedStreak([dayResult({ both_complete: false })])).toBe(0);
  });

  it('does not let an empty day break the streak', () => {
    // Nothing was scheduled, so there was nothing to finish. It should not punish them.
    const results = [
      dayResult({ local_date: '2026-10-01', both_complete: true }),
      dayResult({ local_date: '2026-10-02', both_complete: false, scheduled_count: 0 }),
      dayResult({ local_date: '2026-10-03', both_complete: true }),
    ];
    expect(sharedStreak(results)).toBe(2);
  });

  it('does not let an empty day add to it either', () => {
    const results = [dayResult({ local_date: '2026-10-03', both_complete: false, scheduled_count: 0 })];
    expect(sharedStreak(results)).toBe(0);
  });

  it('is zero with nothing settled yet', () => {
    expect(sharedStreak([])).toBe(0);
  });

  it('does not care what order it is given the days in', () => {
    const ordered = [
      dayResult({ local_date: '2026-10-01' }),
      dayResult({ local_date: '2026-10-02' }),
    ];
    expect(sharedStreak([...ordered].reverse())).toBe(sharedStreak(ordered));
  });
});

describe('tallyMonth', () => {
  const october = [
    dayResult({ local_date: '2026-10-01', winner_user_id: ALEX }),
    dayResult({ local_date: '2026-10-02', winner_user_id: SAM }),
    dayResult({ local_date: '2026-10-03', winner_user_id: SAM }),
    dayResult({ local_date: '2026-10-04', winner_user_id: null }),
    dayResult({ local_date: '2026-09-30', winner_user_id: ALEX }),
  ];

  it('counts only the month asked for', () => {
    const tally = tallyMonth(october, BOTH, '2026-10');
    expect(tally.settledDays).toBe(4);
    expect(tally.wins).toEqual({ [ALEX]: 1, [SAM]: 2 });
    expect(tally.ties).toBe(1);
  });

  it('gives the month to whoever won the most days', () => {
    expect(tallyMonth(october, BOTH, '2026-10').leaderUserId).toBe(SAM);
  });

  it('has no leader while they are level', () => {
    const level = [
      dayResult({ local_date: '2026-10-01', winner_user_id: ALEX }),
      dayResult({ local_date: '2026-10-02', winner_user_id: SAM }),
    ];
    expect(tallyMonth(level, BOTH, '2026-10').leaderUserId).toBeNull();
  });

  it('has no leader from ties alone', () => {
    const allTies = [dayResult({ local_date: '2026-10-01', winner_user_id: null })];
    const tally = tallyMonth(allTies, BOTH, '2026-10');
    expect(tally.leaderUserId).toBeNull();
    expect(tally.ties).toBe(1);
  });

  it('is empty for a month with nothing in it', () => {
    const tally = tallyMonth(october, BOTH, '2026-11');
    expect(tally.settledDays).toBe(0);
    expect(tally.leaderUserId).toBeNull();
  });
});

describe('monthOf / datesInMonth / leadingBlanks', () => {
  it('takes the month off a date', () => {
    expect(monthOf('2026-10-02')).toBe('2026-10');
  });

  it('lists every day of the month', () => {
    const october = datesInMonth('2026-10');
    expect(october).toHaveLength(31);
    expect(october[0]).toBe('2026-10-01');
    expect(october.at(-1)).toBe('2026-10-31');
  });

  it('gets month lengths right, including February in a leap year', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28);
    expect(datesInMonth('2028-02')).toHaveLength(29);
    expect(datesInMonth('2026-04')).toHaveLength(30);
  });

  it('pads the grid so the month starts on a Monday', () => {
    // 1 October 2026 is a Thursday, so three blanks come first.
    expect(leadingBlanks('2026-10')).toBe(3);
    // 1 June 2026 is a Monday.
    expect(leadingBlanks('2026-06')).toBe(0);
  });
});

describe('dayOutcome', () => {
  const won = { winner_user_id: ALEX, scores: { [ALEX]: 3, [SAM]: 1 } };
  const tied = { winner_user_id: null, scores: { [ALEX]: 2, [SAM]: 2 } };
  const untouched = { winner_user_id: null, scores: { [ALEX]: 0, [SAM]: 0 } };

  it('reads a win from each side', () => {
    expect(dayOutcome(won, ALEX)).toBe('won');
    expect(dayOutcome(won, SAM)).toBe('lost');
  });

  it('calls equal non-zero counts a tie for both of them', () => {
    expect(dayOutcome(tied, ALEX)).toBe('tie');
    expect(dayOutcome(tied, SAM)).toBe('tie');
  });

  it('does not dress a day neither of them touched up as a tie', () => {
    // The database records "no winner" for both cases; only the screens can tell
    // them apart, and showing this one as a shared heart would be a lie.
    expect(dayOutcome(untouched, ALEX)).toBe('nobody');
    expect(dayOutcome(untouched, SAM)).toBe('nobody');
  });

  it('counts a one-sided day with any progress as a win, not nothing', () => {
    expect(dayOutcome({ winner_user_id: ALEX, scores: { [ALEX]: 1, [SAM]: 0 } }, ALEX)).toBe('won');
  });
});
