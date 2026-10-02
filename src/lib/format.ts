/** Display helpers that have no business living in a component. */

/** "21:00" / "21:00:00" → "9:00 PM", the way the design writes it. */
export function formatDayEndTime(value: string): string {
  const [rawHour, rawMinute] = value.split(':');
  const hour = Number(rawHour);
  const minute = Number(rawMinute ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** Trims a Postgres `time` to the "HH:MM" an <input type="time"> wants. */
export function toTimeInputValue(value: string): string {
  return value.slice(0, 5);
}
