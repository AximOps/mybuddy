/** Small iCalendar (RFC 5545) writer for the private calendar feed. */

export const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Folds lines longer than 75 octets, as the format requires. */
export function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

const ymd = (d: string) => d.replace(/-/g, '');
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export interface CalEvent {
  uid: string;
  title: string;
  day: string;              // YYYY-MM-DD
  startMin: number | null;  // null = all-day
  endMin: number | null;
  description?: string;
  location?: string;
  rrule?: string;           // e.g. FREQ=WEEKLY;BYDAY=MO,WE
  url?: string;
}

export function buildCalendar(name: string, tz: string, events: CalEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Amiroon//Life Organized//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, `X-WR-TIMEZONE:${tz}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  const now = stamp();
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@mybuddy`, `DTSTAMP:${now}`, `SUMMARY:${esc(e.title)}`);
    if (e.startMin === null) {
      const next = new Date(Date.parse(`${e.day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.day)}`, `DTEND;VALUE=DATE:${ymd(next)}`);
    } else {
      const end = e.endMin !== null && e.endMin > e.startMin ? e.endMin : Math.min(e.startMin + 30, 1439);
      lines.push(`DTSTART;TZID=${tz}:${ymd(e.day)}T${hm(e.startMin)}`, `DTEND;TZID=${tz}:${ymd(e.day)}T${hm(end)}`);
    }
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
