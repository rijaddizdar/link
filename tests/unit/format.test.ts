import { describe, expect, it } from 'vitest';
import { formatDayEndTime, toTimeInputValue } from '@/lib/format';

describe('formatDayEndTime', () => {
  it('writes an evening time the way the design does', () => {
    expect(formatDayEndTime('21:00')).toBe('9:00 PM');
    expect(formatDayEndTime('21:00:00')).toBe('9:00 PM');
  });

  it('handles both ends of the clock', () => {
    expect(formatDayEndTime('00:00')).toBe('12:00 AM');
    expect(formatDayEndTime('12:00')).toBe('12:00 PM');
    expect(formatDayEndTime('23:59')).toBe('11:59 PM');
    expect(formatDayEndTime('09:05')).toBe('9:05 AM');
  });

  it('pads the minutes', () => {
    expect(formatDayEndTime('21:05')).toBe('9:05 PM');
  });

  it('gives back anything it cannot read, rather than throwing', () => {
    expect(formatDayEndTime('nonsense')).toBe('nonsense');
  });
});

describe('toTimeInputValue', () => {
  it('trims the seconds Postgres adds', () => {
    expect(toTimeInputValue('21:00:00')).toBe('21:00');
    expect(toTimeInputValue('21:00')).toBe('21:00');
  });
});
