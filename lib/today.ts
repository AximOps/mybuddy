import type { PoolClient } from 'pg';
import { routineForDay } from './planner';
import { weekdayOf } from './time';
import { activityStreaks } from './streaks';

/** One row in the Today timeline. Items without a time are listed under "Anytime". */
export type AgendaKind = 'routine' | 'meeting' | 'class' | 'task' | 'deadline' | 'reminder' | 'focus';
export interface AgendaItem {
  key: string;
  kind: AgendaKind;
  startMin: number | null;
  endMin: number | null;
  title: string;
  emoji: string;
  meta: string;
  done: boolean;
  href?: string;
  /** Scheduled days in a row this routine activity was done. */
  streak?: number;
  /** What the check box toggles, when the item can be ticked off from Today. */
  toggle?: { action: 'event' | 'task' | 'deadline'; id: string };
}

export interface TodayTask { id: string; title: string; tag: string; dueDate: string | null; dueTime: number | null; done: boolean; overdue: boolean; repeat: string }

export interface TodayData {
  routineId: string | null;
  routineName: string | null;
  routineDone: number;
  routineTotal: number;
  agenda: AgendaItem[];
  tasks: { overdue: TodayTask[]; today: TodayTask[]; anytime: TodayTask[]; doneToday: number };
  focus: { minutes: number; sessions: { title: string; minutes: number; atMin: number }[] };
  notes: { pinned: { id: string; title: string; snippet: string }[]; reminders: { id: string; title: string; atMin: number }[] };
  work: { minutes: number; billableMinutes: number; timer: { project: string; note: string; startedAt: string } | null; meetings: number; openActions: number } | null;
  spend: { totalMinor: number; count: number; monthMinor: number; budgetMinor: number | null } | null;
  nowMin: number | null;
}

/** Minutes after local midnight for a timestamp, in the person's time zone. */
function minutesIn(tz: string, d: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  return Number(p.find(x => x.type === 'hour')?.value ?? 0) * 60 + Number(p.find(x => x.type === 'minute')?.value ?? 0);
}

/**
 * Everything that belongs on one day: the routine, tasks, focus sessions, notes, meetings,
 * classes, deadlines, time and spending. Premium-only areas are skipped for free plans.
 */
export async function loadToday(c: PoolClient, o: {
  ws: string; userId: string; day: string; today: string; tz: string; premium: boolean; student: boolean; workMode: boolean; budgetMinor: number | null;
}): Promise<TodayData> {
  const { ws, userId, day, today, tz, premium } = o;
  const isToday = day === today;
  const agenda: AgendaItem[] = [];

  // Routine activities
  const routine = await routineForDay(c, ws, userId, weekdayOf(day), day);
  const streaks = routine.events.length ? await activityStreaks(c, ws, userId, day, routine.events.map(e => e.id)) : new Map();
  for (const e of routine.events) {
    agenda.push({ key: `e${e.id}`, kind: 'routine', startMin: e.startMin, endMin: e.endMin, title: e.title, emoji: e.emoji, meta: e.category, done: e.done, streak: streaks.get(e.id)?.streak ?? 0, toggle: { action: 'event', id: e.id } });
  }

  // Tasks: overdue (only when looking at today), due on the day, done on the day, and a few without a date.
  const taskRows = (await c.query<{ id: string; title: string; tag: string; due_date: string | null; due_time: number | null; done: boolean; done_on: string | null; repeat: string }>(
    `select id, title, tag, due_date::text as due_date, due_time, done, repeat,
            case when completed_at is null then null else (completed_at at time zone $3)::date::text end as done_on
       from tasks
      where (workspace_id = $1 or assignee_id = $4) and deleted_at is null
        and (
          (not done and (due_date = $2 or due_date is null or ($5 and due_date < $2)))
          or (done and completed_at is not null and (completed_at at time zone $3)::date = $2::date)
        )
      order by done, due_date nulls last, due_time nulls last, updated_at desc
      limit 80`,
    [ws, day, tz, userId, isToday])).rows;
  const toTask = (r: typeof taskRows[number]): TodayTask => ({ id: r.id, title: r.title, tag: r.tag, dueDate: r.due_date, dueTime: r.due_time, done: r.done, overdue: !r.done && !!r.due_date && r.due_date < day, repeat: r.repeat });
  const overdue = taskRows.filter(r => !r.done && r.due_date && r.due_date < day).map(toTask);
  const dueToday = taskRows.filter(r => r.due_date === day && (!r.done || r.done_on === day)).map(toTask);
  const anytime = taskRows.filter(r => !r.done && !r.due_date).slice(0, 5).map(toTask);
  const doneToday = taskRows.filter(r => r.done && r.done_on === day).length;
  for (const t of dueToday) {
    if (t.dueTime !== null) agenda.push({ key: `t${t.id}`, kind: 'task', startMin: t.dueTime, endMin: null, title: t.title, emoji: '✅', meta: `To-do · ${t.tag}`, done: t.done, href: '/tasks', toggle: { action: 'task', id: t.id } });
  }

  // Notes: pinned ones, and reminders that fall on the day.
  const pinned = (await c.query<{ id: string; title: string; body: string }>(
    `select id, title, body from notes where workspace_id = $1 and deleted_at is null and pinned order by updated_at desc limit 3`, [ws])).rows
    .map(n => ({ id: n.id, title: n.title || 'Untitled', snippet: n.body.replace(/\s+/g, ' ').slice(0, 90) }));
  const reminderRows = (await c.query<{ id: string; title: string; reminder_at: Date }>(
    `select id, title, reminder_at from notes
      where workspace_id = $1 and deleted_at is null and reminder_at is not null and (reminder_at at time zone $3)::date = $2::date
      order by reminder_at`, [ws, day, tz])).rows;
  const reminders = reminderRows.map(r => ({ id: r.id, title: r.title || 'Untitled', atMin: minutesIn(tz, r.reminder_at) }));
  for (const r of reminders) agenda.push({ key: `n${r.id}`, kind: 'reminder', startMin: r.atMin, endMin: null, title: r.title, emoji: '🔔', meta: 'Note reminder', done: false, href: `/notes?id=${r.id}` });

  // Focus sessions finished on the day (premium)
  let focus: TodayData['focus'] = { minutes: 0, sessions: [] };
  if (premium) {
    const rows = (await c.query<{ title: string; minutes: number; completed_at: Date }>(
      `select title, minutes, completed_at from focus_sessions
        where user_id = $1 and (completed_at at time zone $3)::date = $2::date order by completed_at`, [userId, day, tz])).rows;
    focus = { minutes: rows.reduce((s, r) => s + r.minutes, 0), sessions: rows.map(r => ({ title: r.title, minutes: r.minutes, atMin: minutesIn(tz, r.completed_at) })) };
    for (const [i, s] of focus.sessions.entries()) {
      const end = s.atMin;
      agenda.push({ key: `f${i}`, kind: 'focus', startMin: Math.max(0, end - s.minutes), endMin: end, title: s.title || 'Focus session', emoji: '⏱️', meta: `Focus · ${s.minutes} min`, done: true, href: '/focus' });
    }
  }

  // Meetings in any workspace the person belongs to (row-level security limits the rows), plus work time (premium)
  let work: TodayData['work'] = null;
  if (premium) {
    const meetings = (await c.query<{ id: string; title: string; start_min: number | null; end_min: number | null; attendees: string; open_actions: number }>(
      `select m.id, m.title, m.start_min, m.end_min, m.attendees,
              (select count(*)::int from meeting_actions a where a.meeting_id = m.id and not a.done) as open_actions
         from meetings m where m.meeting_on = $1 and m.deleted_at is null order by m.start_min nulls last`, [day])).rows;
    for (const m of meetings) {
      agenda.push({ key: `m${m.id}`, kind: 'meeting', startMin: m.start_min, endMin: m.end_min, title: m.title, emoji: '👥', meta: m.attendees ? `Meeting · ${m.attendees}` : 'Meeting', done: false, href: `/work?tab=meetings&meeting=${m.id}` });
    }
    const time = (await c.query<{ minutes: number; billable: number }>(
      `select coalesce(sum(end_min - start_min), 0)::int as minutes, coalesce(sum(end_min - start_min) filter (where billable), 0)::int as billable
         from time_entries where user_id = $1 and spent_on = $2 and deleted_at is null`, [userId, day])).rows[0];
    const timerRow = (await c.query<{ work_timer: { projectId: string; note: string; startedAt: string } | null }>(
      `select work_timer from user_settings where user_id = $1`, [userId])).rows[0]?.work_timer ?? null;
    let timer: NonNullable<TodayData['work']>['timer'] = null;
    if (timerRow) {
      const p = (await c.query<{ name: string }>(`select name from projects where id = $1`, [timerRow.projectId])).rows[0];
      timer = { project: p?.name ?? 'Project', note: timerRow.note, startedAt: timerRow.startedAt };
    }
    const openActions = meetings.reduce((s, m) => s + m.open_actions, 0);
    if (o.workMode || meetings.length || time.minutes || timer) {
      work = { minutes: time.minutes, billableMinutes: time.billable, timer, meetings: meetings.length, openActions };
    }
  }

  // Student classes and deadlines (premium, when student tools are on)
  if (premium && o.student) {
    const classes = (await c.query<{ id: string; title: string; kind: string; start_min: number; end_min: number; room: string }>(
      `select id, title, kind, start_min, end_min, room from classes where workspace_id = $1 and weekday = $2 and deleted_at is null order by start_min`, [ws, weekdayOf(day)])).rows;
    for (const k of classes) agenda.push({ key: `c${k.id}`, kind: 'class', startMin: k.start_min, endMin: k.end_min, title: k.title, emoji: '📚', meta: `${k.kind}${k.room ? ` · ${k.room}` : ''}`, done: false, href: '/student' });
    const deadlines = (await c.query<{ id: string; title: string; kind: string; due_date: string; due_time: number | null; done: boolean }>(
      `select id, title, kind, due_date::text as due_date, due_time, done from deadlines
        where workspace_id = $1 and deleted_at is null and (due_date = $2 or ($3 and not done and due_date < $2))
        order by due_date, coalesce(due_time, 1440)`, [ws, day, isToday])).rows;
    for (const d of deadlines) {
      agenda.push({ key: `d${d.id}`, kind: 'deadline', startMin: d.due_date === day ? d.due_time : null, endMin: null, title: d.title, emoji: d.kind === 'exam' ? '📝' : '📌', meta: d.due_date < day ? `Overdue ${d.kind}` : d.kind === 'exam' ? 'Exam' : `Due · ${d.kind}`, done: d.done, href: '/student?tab=deadlines', toggle: { action: 'deadline', id: d.id } });
    }
  }

  // Meetings or deadlines without a time go to "Anytime"; tasks without a time live in the To-do card.
  let spend: TodayData['spend'] = null;
  if (premium) {
    const s = (await c.query<{ total: number; n: number; month: number }>(
      `select coalesce(sum(amount_minor) filter (where spent_on = $2), 0)::int as total,
              count(*) filter (where spent_on = $2)::int as n,
              coalesce(sum(amount_minor) filter (where date_trunc('month', spent_on) = date_trunc('month', $2::date)), 0)::int as month
         from expenses where user_id = $1 and deleted_at is null and spent_on >= date_trunc('month', $2::date) and spent_on <= $2::date`, [userId, day])).rows[0];
    spend = { totalMinor: s.total, count: s.n, monthMinor: s.month, budgetMinor: o.budgetMinor };
  }

  agenda.sort((a, b) => (a.startMin ?? 9999) - (b.startMin ?? 9999) || (a.endMin ?? 0) - (b.endMin ?? 0));
  return {
    routineId: routine.routineId, routineName: routine.routineName,
    routineDone: routine.events.filter(e => e.done).length, routineTotal: routine.events.length,
    agenda,
    tasks: { overdue, today: dueToday, anytime, doneToday },
    focus, notes: { pinned, reminders }, work, spend,
    nowMin: isToday ? minutesIn(tz, new Date()) : null,
  };
}
