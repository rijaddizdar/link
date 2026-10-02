/**
 * Where a day starts and stops for a couple.
 *
 * A couple agrees one end-of-day time, and that — not midnight — is when the day
 * rolls over: at 9:01 PM on the 2nd you are already logging into the 3rd. Every
 * date in the app is this *active date*, so both partners are always filling in
 * the same day however far apart they are.
 *
 * Mirrors `couple_active_date()` and `couple_day_closes_at()` in the migration.
 */

/** "21:00" or "21:00:00" → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

type Wall = { date: string; minutes: number };

/** What wall clock a time zone is showing at a given instant. */
function wallClockIn(timeZone: string, at: Date): Wall {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // h23 rather than hour12:false, which can report midnight as hour 24.
    hourCycle: 'h23',
  }).formatToParts(at);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** The calendar date in the couple's zone, ignoring the end-of-day rollover. */
export function coupleCalendarDate(timeZone: string, at: Date = new Date()): string {
  return wallClockIn(timeZone, at).date;
}

export function addDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The day the couple is logging into right now. Once the clock passes the agreed
 * end-of-day time, that is tomorrow.
 */
export function activeLocalDate(
  timeZone: string,
  dayEndTime: string,
  at: Date = new Date(),
): string {
  const wall = wallClockIn(timeZone, at);
  return wall.minutes >= timeToMinutes(dayEndTime) ? addDays(wall.date, 1) : wall.date;
}

/**
 * Turns a wall-clock date and time in a zone back into a real instant.
 * Done by guessing and correcting, because there is no built-in inverse — the
 * second pass is what gets the hour right across a daylight-saving change.
 */
function instantAt(timeZone: string, localDate: string, time: string): Date {
  const [h, m] = time.split(':');
  const guess = new Date(`${localDate}T${(h ?? '00').padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}:00Z`);

  const offsetAt = (instant: Date) => {
    const wall = wallClockIn(timeZone, instant);
    const asUtc = new Date(`${wall.date}T00:00:00Z`).getTime() + wall.minutes * 60_000;
    return asUtc - instant.getTime();
  };

  let result = new Date(guess.getTime() - offsetAt(guess));
  const corrected = offsetAt(result);
  if (corrected !== offsetAt(guess)) result = new Date(guess.getTime() - corrected);
  return result;
}

/** The instant day `localDate` closes — its own date, at the agreed time. */
export function dayClosesAt(timeZone: string, dayEndTime: string, localDate: string): Date {
  return instantAt(timeZone, localDate, dayEndTime.slice(0, 5));
}

export function isDayClosed(
  timeZone: string,
  dayEndTime: string,
  localDate: string,
  at: Date = new Date(),
): boolean {
  return at.getTime() >= dayClosesAt(timeZone, dayEndTime, localDate).getTime();
}

export function msUntilDayCloses(
  timeZone: string,
  dayEndTime: string,
  localDate: string,
  at: Date = new Date(),
): number {
  return Math.max(0, dayClosesAt(timeZone, dayEndTime, localDate).getTime() - at.getTime());
}

/** "3h 12m left" / "48m left" / "closed". */
export function timeLeftLabel(ms: number): string {
  if (ms <= 0) return 'closed';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return 'less than a minute left';
}
