import { json, userFromBearer } from '@/lib/connected-apps';
import { withUser } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { isDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

const hhmm = (m: number | null) => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

/**
 * One day of the person's work, for Autopilot to turn into Teamwork timesheet entries.
 * GET ?date=YYYY-MM-DD with "Authorization: Bearer mbat_…". Times are local to the person's
 * My Buddy time zone. Read-only; row-level security limits everything to what this person may see.
 */
export async function GET(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return json({ error: 'invalid_token' }, 401);
  const date = new URL(req.url).searchParams.get('date') ?? '';
  if (!isDateKey(date)) return json({ error: 'Use ?date=YYYY-MM-DD' }, 400);

  const data = await withUser(user.id, async c => {
    const tz = (await getSettings(c, user.id)).timezone;

    // Time entries the person logged on that day (any workspace they belong to).
    const timeEntries = (await c.query<{ id: string; project_id: string; project: string; client: string | null; workspace: string;
      start_min: number; end_min: number; billable: boolean; note: string }>(
      `select t.id, t.project_id, p.name as project, cl.name as client, w.name as workspace, t.start_min, t.end_min, t.billable, t.note
         from time_entries t
         join projects p on p.id = t.project_id
         join workspaces w on w.id = t.workspace_id
         left join clients cl on cl.id = p.client_id
        where t.user_id = $1 and t.spent_on = $2 and t.deleted_at is null
        order by t.start_min`, [user.id, date])).rows;

    // Meetings that day. Personal-workspace meetings are the person's own; organisation meetings are
    // marked shared (they may be colleagues' meetings), so Autopilot leaves them unticked.
    const meetings = (await c.query<{ id: string; title: string; start_min: number | null; end_min: number | null; attendees: string; workspace: string; kind: string }>(
      `select m.id, m.title, m.start_min, m.end_min, m.attendees, w.name as workspace, w.kind::text as kind
         from meetings m join workspaces w on w.id = m.workspace_id
        where m.meeting_on = $1 and m.deleted_at is null
        order by m.start_min nulls last`, [date])).rows;

    // Focus sessions finished that day (start = finish minus length).
    const focus = (await c.query<{ id: string; title: string; minutes: number; end_local: string }>(
      `select id, title, minutes, to_char(completed_at at time zone $3, 'HH24:MI') as end_local
         from focus_sessions
        where user_id = $1 and (completed_at at time zone $3)::date = $2::date
        order by completed_at`, [user.id, date, tz])).rows;

    // To-dos the person finished that day.
    const tasksDone = (await c.query<{ id: string; title: string; tag: string; done_local: string }>(
      `select id, title, tag, to_char(completed_at at time zone $3, 'HH24:MI') as done_local
         from tasks
        where done and deleted_at is null and completed_at is not null
          and (created_by = $1 or assignee_id = $1)
          and (completed_at at time zone $3)::date = $2::date
        order by completed_at`, [user.id, date, tz])).rows;

    return { tz, timeEntries, meetings, focus, tasksDone };
  });

  return json({
    date,
    timezone: data.tz,
    timeEntries: data.timeEntries.map(t => ({ id: t.id, projectId: t.project_id, project: t.project, client: t.client, workspace: t.workspace,
      start: hhmm(t.start_min), end: hhmm(t.end_min), minutes: t.end_min - t.start_min, billable: t.billable, note: t.note })),
    meetings: data.meetings.map(m => ({ id: m.id, title: m.title, start: hhmm(m.start_min), end: hhmm(m.end_min),
      minutes: m.start_min != null && m.end_min != null ? m.end_min - m.start_min : null, attendees: m.attendees, workspace: m.workspace, shared: m.kind !== 'personal' })),
    focus: data.focus.map(f => {
      const [h, mi] = f.end_local.split(':').map(Number), end = h * 60 + mi, start = Math.max(0, end - f.minutes);
      return { id: f.id, title: f.title || 'Focus session', start: hhmm(start), end: f.end_local, minutes: end - start };
    }),
    tasksDone: data.tasksDone.map(t => ({ id: t.id, title: t.title, tag: t.tag, doneAt: t.done_local })),
  });
}
