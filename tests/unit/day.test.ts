import { describe, expect, it } from 'vitest';
import {
  activeLocalDate,
  addDays,
  coupleCalendarDate,
  dayClosesAt,
  isDayClosed,
  msUntilDayCloses,
  timeLeftLabel,
  timeToMinutes,
} from '@/lib/day';

const BERLIN = 'Europe/Berlin';
const TOKYO = 'Asia/Tokyo';

describe('timeToMinutes', () => {
  it('reads both the short and the Postgres form', () => {
    expect(timeToMinutes('21:00')).toBe(21 * 60);
    expect(timeToMinutes('21:00:00')).toBe(21 * 60);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(23 * 60 + 59);
  });
});

describe('addDays', () => {
  it('moves forward and back', () => {
    expect(addDays('2026-10-02', 1)).toBe('2026-10-03');
    expect(addDays('2026-10-02', -1)).toBe('2026-10-01');
  });

  it('crosses a month and a year end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('coupleCalendarDate', () => {
  it('uses the couple zone, not the machine zone', () => {
    const at = new Date('2026-10-02T23:30:00Z');
    expect(coupleCalendarDate(TOKYO, at)).toBe('2026-10-03');
    expect(coupleCalendarDate('UTC', at)).toBe('2026-10-02');
    expect(coupleCalendarDate('Pacific/Honolulu', at)).toBe('2026-10-02');
  });
});

describe('activeLocalDate', () => {
  // Berlin is UTC+2 in October (CEST), so 19:00Z is 21:00 local.
  it('is today before the end-of-day time', () => {
    expect(activeLocalDate(BERLIN, '21:00', new Date('2026-10-02T17:00:00Z'))).toBe('2026-10-02');
  });

  it('rolls to tomorrow the moment the day closes', () => {
    // 19:00Z is exactly 21:00 in Berlin.
    expect(activeLocalDate(BERLIN, '21:00', new Date('2026-10-02T19:00:00Z'))).toBe('2026-10-03');
  });

  it('stays on tomorrow through the rest of the evening', () => {
    expect(activeLocalDate(BERLIN, '21:00', new Date('2026-10-02T22:00:00Z'))).toBe('2026-10-03');
  });

  it('is still that day in the small hours before a late end time', () => {
    // 00:30 Berlin on the 3rd, with the day ending at 02:00, is still the 3rd.
    expect(activeLocalDate(BERLIN, '02:00', new Date('2026-10-02T22:30:00Z'))).toBe('2026-10-03');
  });

  it('is the same day for both partners wherever they are', () => {
    // The couple's zone decides, not the device's.
    const at = new Date('2026-10-02T17:00:00Z');
    expect(activeLocalDate(BERLIN, '21:00', at)).toBe('2026-10-02');
    expect(activeLocalDate(BERLIN, '21:00', at)).toBe(activeLocalDate(BERLIN, '21:00', at));
  });

  it('never skips a date across a full day', () => {
    const seen = new Set<string>();
    for (let hour = 0; hour < 24; hour += 1) {
      seen.add(
        activeLocalDate(BERLIN, '21:00', new Date(`2026-10-02T${String(hour).padStart(2, '0')}:00:00Z`)),
      );
    }
    expect([...seen].sort()).toEqual(['2026-10-02', '2026-10-03']);
  });
});

describe('dayClosesAt', () => {
  it('is the agreed time on that date, in the couple zone', () => {
    // 21:00 Berlin on 2 October (CEST, UTC+2) is 19:00Z.
    expect(dayClosesAt(BERLIN, '21:00', '2026-10-02').toISOString()).toBe('2026-10-02T19:00:00.000Z');
  });

  it('accepts the Postgres time form with seconds', () => {
    expect(dayClosesAt(BERLIN, '21:00:00', '2026-10-02').toISOString()).toBe(
      '2026-10-02T19:00:00.000Z',
    );
  });

  it('follows the zone offset, not a fixed one', () => {
    // Tokyo is UTC+9 all year.
    expect(dayClosesAt(TOKYO, '21:00', '2026-10-02').toISOString()).toBe('2026-10-02T12:00:00.000Z');
  });

  it('tracks a daylight-saving change rather than drifting an hour', () => {
    // Berlin leaves CEST on 25 October 2026, so the same wall-clock time is an
    // hour later in UTC once the clocks go back.
    expect(dayClosesAt(BERLIN, '21:00', '2026-10-24').toISOString()).toBe(
      '2026-10-24T19:00:00.000Z',
    );
    expect(dayClosesAt(BERLIN, '21:00', '2026-10-26').toISOString()).toBe(
      '2026-10-26T20:00:00.000Z',
    );
  });
});

describe('isDayClosed', () => {
  it('is false before the time and true from it onwards', () => {
    expect(isDayClosed(BERLIN, '21:00', '2026-10-02', new Date('2026-10-02T18:59:00Z'))).toBe(false);
    expect(isDayClosed(BERLIN, '21:00', '2026-10-02', new Date('2026-10-02T19:00:00Z'))).toBe(true);
    expect(isDayClosed(BERLIN, '21:00', '2026-10-02', new Date('2026-10-03T08:00:00Z'))).toBe(true);
  });

  it('says a past day is closed and a future day is not', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(isDayClosed(BERLIN, '21:00', '2026-10-01', now)).toBe(true);
    expect(isDayClosed(BERLIN, '21:00', '2026-10-03', now)).toBe(false);
  });
});

describe('msUntilDayCloses', () => {
  it('counts down to the close', () => {
    const ms = msUntilDayCloses(BERLIN, '21:00', '2026-10-02', new Date('2026-10-02T15:48:00Z'));
    expect(ms).toBe((3 * 60 + 12) * 60 * 1000);
  });

  it('clamps at zero rather than going negative', () => {
    expect(msUntilDayCloses(BERLIN, '21:00', '2026-10-02', new Date('2026-10-03T00:00:00Z'))).toBe(0);
  });
});

describe('timeLeftLabel', () => {
  it('writes hours and minutes the way the design does', () => {
    expect(timeLeftLabel((3 * 60 + 12) * 60 * 1000)).toBe('3h 12m left');
  });

  it('drops to minutes inside the last hour', () => {
    expect(timeLeftLabel(48 * 60 * 1000)).toBe('48m left');
  });

  it('never shows a bare zero', () => {
    expect(timeLeftLabel(30 * 1000)).toBe('less than a minute left');
    expect(timeLeftLabel(0)).toBe('closed');
  });
});
