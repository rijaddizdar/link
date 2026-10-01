'use client';

import { useEffect, useState } from 'react';

/**
 * Time zone picker, defaulting to the browser's own zone.
 *
 * This renders on the server too, so the first client render has to match the
 * server's output exactly — reading the browser zone or the full zone list
 * during render would differ between the two and leave the hydrated <select>
 * showing the wrong option. Both are therefore filled in after mount.
 */
export function TimeZoneSelect({
  name = 'time_zone',
  defaultValue,
  id = 'time_zone',
}: {
  name?: string;
  defaultValue?: string;
  id?: string;
}) {
  const initial = defaultValue || 'UTC';
  const [value, setValue] = useState(initial);
  const [zones, setZones] = useState<string[]>([initial]);

  useEffect(() => {
    try {
      const supported =
        typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
      if (supported.length > 0) setZones(supported);
    } catch {
      // Keep the single-entry list; the user can still submit it.
    }

    // A couple that already agreed a zone keeps it; only a fresh link follows
    // whichever device is setting it up.
    if (defaultValue) return;
    try {
      setValue(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      // Stay on UTC.
    }
  }, [defaultValue]);

  const options = zones.includes(value) ? zones : [value, ...zones];

  return (
    <select id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)}>
      {options.map((zone) => (
        <option key={zone} value={zone}>
          {zone}
        </option>
      ))}
    </select>
  );
}
