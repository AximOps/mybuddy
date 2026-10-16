import { pool, withUser } from '@/lib/db';
import { isPremium } from '@/lib/entitlements';
import { buildCalendar, type CalEvent } from '@/lib/ical';
import { personalWorkspaceId } from '@/lib/planner';
import { getSettings } from '@/lib/settings';
import { dateKeyIn, shiftDateKey, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Private calendar feed for Google, Apple or Outlook calendar. The token in the URL is the only
 * credential, so it is long and can be replaced from Settings. Add ?routines=1 to include routines.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) return new Response('Not found', { status: 404 });
  const owner = (await pool.query<{ u: string | null }>(`select calendar_owner($1) as u`, [token])).rows[0]?.u;
  if (!owner) return new Response('Not found', { status: 404 });
  const withRoutines = new URL(req.url).searchParams.get('routines') === '1';
  const origin = process.env.BETTER_AUTH_URL ?? new URL(req.url).origin;

  const { tz, events } = await withUser(owner, async c => {
    const settings = await getSettings(c, owner);
    const tz = settings.timezone;
    const today = dateKeyIn(tz);
    const from = shiftDateKey(today, -30), to = shiftDateKey(today, 120);
    const ws = await personalWorkspaceId(c, owner);
    const premium = isPremium(settings);
    const out: CalEvent[] = [];

    const tasks = (await c.query<{ id: string; title: string; due_date: string; due_time: number | null; tag: string }>(
      `select id, title, due_date::text as due_date, due_time, tag from tasks
        where (workspace_id = $1 or assignee_id = $2) and deleted_at is null and not done and due_date between $3 and $4`, [ws, owner, from, to])).rows;
    for (const t of tasks) out.push({ uid: `task-${t.id}`, title: `☐ ${t.title}`, day: t.due_date, startMin: t.due_time, endMin: null, description: `To-do · ${t.tag}`, url: `${origin}/tasks` });

    if (premium) {
      const meetings = (await c.query<{ id: string; title: string; meeting_on: string; start_min: number | null; end_min: number | null; attendees: string; agenda: string }>(
        `select id, title, meeting_on::text as meeting_on, start_min, end_min, attendees, agenda from meetings
          where deleted_at is null and meeting_on between $1 and $2`, [from, to])).rows;
      for (const m of meetings) out.push({ uid: `meeting-${m.id}`, title: m.title, day: m.meeting_on, startMin: m.start_min, endMin: m.end_min, description: [m.attendees && `With: ${m.attendees}`, m.agenda].filter(Boolean).join('\n'), url: `${origin}/work?tab=meetings&meeting=${m.id}` });

      if (settings.studentEnabled) {
        const classes = (await c.query<{ id: string; title: string; kind: string; weekday: number; start_min: number; end_min: number; room: string }>(
          `select id, title, kind, weekday, start_min, end_min, room from classes where workspace_id = $1 and deleted_at is null`, [ws])).rows;
        for (const k of classes) {
          let d = today; while (weekdayOf(d) !== k.weekday) d = shiftDateKey(d, 1);
          out.push({ uid: `class-${k.id}`, title: `📚 ${k.title}`, day: d, startMin: k.start_min, endMin: k.end_min, location: k.room, description: k.kind, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[k.weekday]}` });
        }
        const deadlines = (await c.query<{ id: string; title: string; kind: string; due_date: string; due_time: number | null }>(
          `select id, title, kind, due_date::text as due_date, due_time from deadlines where workspace_id = $1 and deleted_at is null and not done and due_date between $2 and $3`, [ws, from, to])).rows;
        for (const d of deadlines) out.push({ uid: `deadline-${d.id}`, title: `${d.kind === 'exam' ? '📝 Exam' : '📌 Due'}: ${d.title}`, day: d.due_date, startMin: d.due_time, endMin: null });
      }
    }

    const reminders = (await c.query<{ id: string; title: string; local: string }>(
      `select id, title, to_char(reminder_at at time zone $2, 'YYYY-MM-DD HH24:MI') as local from notes
        where workspace_id = $1 and deleted_at is null and reminder_at is not null and reminder_at > now() - interval '30 days'`, [ws, tz])).rows;
    for (const r of reminders) {
      const [d, t] = r.local.split(' '); const [h, mi] = t.split(':').map(Number);
      out.push({ uid: `note-${r.id}`, title: `🔔 ${r.title || 'Note reminder'}`, day: d, startMin: h * 60 + mi, endMin: h * 60 + mi + 15, url: `${origin}/notes?id=${r.id}` });
    }

    if (withRoutines) {
      const rows = (await c.query<{ id: string; title: string; emoji: string; start_min: number; end_min: number; weekdays: number[] }>(
        `select e.id, e.title, e.emoji, e.start_min, e.end_min, array_agg(d.weekday order by d.weekday) as weekdays
           from events e join routine_days d on d.routine_id = e.routine_id and d.deleted_at is null
          where e.workspace_id = $1 and e.deleted_at is null group by e.id`, [ws])).rows;
      for (const e of rows) {
        let d = today; while (!e.weekdays.includes(weekdayOf(d))) d = shiftDateKey(d, 1);
        out.push({ uid: `routine-${e.id}`, title: `${e.emoji} ${e.title}`, day: d, startMin: e.start_min, endMin: e.end_min, rrule: `FREQ=WEEKLY;BYDAY=${e.weekdays.map(w => BYDAY[w]).join(',')}` });
      }
    }
    return { tz, events: out };
  });

  return new Response(buildCalendar('My Buddy', tz, events), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="mybuddy.ics"' },
  });
}
