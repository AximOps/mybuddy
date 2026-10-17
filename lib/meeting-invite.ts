import { esc, fold } from './ical';
import { callLabel, isGoogleMeet } from './meeting-link';
import { fmtMinutes, longDate, zonedToUtc } from './time';

/**
 * A calendar invite (iCalendar METHOD:REQUEST) for a meeting, plus the plain-text email that goes
 * with it. Gmail, Google Calendar, Outlook and Apple Mail show it as an invitation with the date,
 * time and join link. Times are written in UTC so no time zone block is needed.
 */
export interface InviteInput {
  id: string; seq: number; title: string; day: string; startMin: number | null; endMin: number | null; tz: string;
  meetUrl: string | null; agenda: string; organizer: { name: string; email: string }; attendees: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function whenText(i: Pick<InviteInput, 'day' | 'startMin' | 'endMin' | 'tz'>) {
  const date = longDate(i.day);
  if (i.startMin === null) return `${date} (all day)`;
  return `${date}, ${fmtMinutes(i.startMin)}${i.endMin !== null ? ` – ${fmtMinutes(i.endMin)}` : ''} (${i.tz})`;
}

export function buildInviteIcs(i: InviteInput): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Amiroon//Meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT', `UID:meeting-${i.id}@mybuddy`, `SEQUENCE:${i.seq}`, `DTSTAMP:${utc(Date.now())}`, `SUMMARY:${esc(i.title)}`];
  if (i.startMin === null) {
    const next = new Date(Date.parse(`${i.day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    lines.push(`DTSTART;VALUE=DATE:${i.day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${next.replace(/-/g, '')}`);
  } else {
    const end = i.endMin !== null && i.endMin > i.startMin ? i.endMin : Math.min(i.startMin + 30, 1440);
    const startMs = zonedToUtc(`${i.day}T${hhmm(i.startMin)}`, i.tz);
    lines.push(`DTSTART:${utc(startMs)}`, `DTEND:${utc(startMs + (end - i.startMin) * 60_000)}`);
  }
  const desc = [i.meetUrl ? `Join ${callLabel(i.meetUrl)}: ${i.meetUrl}` : '', i.agenda ? `Agenda:\n${i.agenda}` : ''].filter(Boolean).join('\n\n');
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  if (i.meetUrl) {
    lines.push(`LOCATION:${esc(i.meetUrl)}`, `URL:${i.meetUrl}`);
    // Google Calendar shows its "Join with Google Meet" button for this.
    if (isGoogleMeet(i.meetUrl)) lines.push(`X-GOOGLE-CONFERENCE:${i.meetUrl}`);
  }
  lines.push(`ORGANIZER;CN=${esc(i.organizer.name || i.organizer.email)}:mailto:${i.organizer.email}`);
  for (const a of i.attendees) lines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`);
  lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(i.title)}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function inviteText(i: InviteInput): string {
  const from = i.organizer.name || i.organizer.email;
  return [
    `${from} invited you to a meeting.`, '',
    i.title, whenText(i), '',
    i.meetUrl ? `Join ${callLabel(i.meetUrl)}:\n${i.meetUrl}\n` : '',
    i.agenda ? `Agenda:\n${i.agenda}\n` : '',
    'The calendar invite is attached. Open it to add the meeting to your calendar.',
    `Reply to this email to reach ${from}.`,
  ].filter((l, idx, arr) => l !== '' || arr[idx - 1] !== '').join('\n');
}
