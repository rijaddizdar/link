'use client';

/**
 * The one time of day both partners agree a day closes. A plain time input: the
 * couple picks any time, and the design shows it back in the putty bar.
 */
export function DayEndTimeSelect({
  name = 'day_end_time',
  defaultValue = '21:00',
  id = 'day_end_time',
}: {
  name?: string;
  defaultValue?: string;
  id?: string;
}) {
  return <input id={id} name={name} type="time" defaultValue={defaultValue} required />;
}
