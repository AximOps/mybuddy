/** Time zone for "today" and times. Set APP_TIMEZONE to change it. Timezone per user comes later. */
export const APP_TZ = process.env.APP_TIMEZONE ?? 'Asia/Kolkata';

/** Calendar date (YYYY-MM-DD) in the given time zone. */
export function dateKeyIn(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function isDateKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Day of week for a calendar date: 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

export function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function longDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Minutes after midnight to "9:30 AM". */
export function fmtMinutes(min: number): string {
  const h24 = Math.floor(min / 60), m = min % 60;
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/** "09:30" to minutes after midnight, or null if invalid. */
export function parseHM(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
