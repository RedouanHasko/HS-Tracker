export const APP_TIME_ZONE = 'Africa/Casablanca';

/** Calendar date in the application's business timezone, independent of device timezone. */
export function appDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Date-only arithmetic that is not affected by daylight-saving or browser timezone changes. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  parsed.setUTCDate(parsed.getUTCDate() + Math.trunc(days));
  return parsed.toISOString().slice(0, 10);
}

export function appDateKeyAfterDays(days: number, date = new Date()): string {
  return addDaysToDateKey(appDateKey(date), days);
}

export function appMonthKey(date = new Date()): string {
  return appDateKey(date).slice(0, 7);
}
