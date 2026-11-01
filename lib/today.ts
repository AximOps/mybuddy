import type { PoolClient } from 'pg';
import { routineForDay } from './planner';
import { weekdayOf } from './time';
import { activityStreaks } from './streaks';
import { loadCatalog, taskRemoved } from './timesheet';

/** One row in the Today timeline. Items without a time are listed under "Anytime". */
export type AgendaKind = 'routine' | 'meeting' | 'class' | 'task' | 'deadline' | 'reminder' | 'focus' | 'work' | 'plan';
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
  toggle?: { action: 'event' | 'task' | 'deadline' | 'check' | 'plan'; id: string; kind?: 'meeting' | 'class' | 'reminder' | 'note' };
  /** A small status label, e.g. "In timesheet". */
  badge?: { text: string; tone: 'success' | 'warn' | 'accent' | 'danger' | '' };
  /** A planned work block that can be removed from Today. */
  removePlan?: string;
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
  notes: { pinned: { id: string; title: string; snippet: string; done: boolean }[]; reminders: { id: string; title: string; atMin: number; done: boolean }[] };
  work: { minutes: number; billableMinutes: number; timer: { project: string; note: string; startedAt: string; twTask: string | null } | null; meetings: number; openActions: number; plans: number } | null;
  /** Only for people connected to Autopilot: Teamwork hours (sent by Autopilot) and what is still to send. */
  timesheet: { loggedMinutes: number | null; targetMinutes: number | null; updatedAt: Date | null; unsentMinutes: number; unsentCount: number; noTaskCount: number } | null;
  spend: { totalMinor: number; count: number; monthMinor: number; budgetMinor: number | null } | null;
  nowMin: number | null;
}

/** The local date (YYYY-MM-DD) of a timestamp in the person's time zone. */
function dayIn(tz: string, d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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
  /** Connected to Autopilot: show Teamwork tasks and the timesheet card. */
  autopilot?: boolean;
}): Promise<TodayData> {
  const { ws, userId, day, today, tz, premium } = o;
  const isToday = day === today;
  const agenda: AgendaItem[] = [];
  const checks = new Set((await c.query<{ k: string }>(
    `select kind || ':' || ref_id as k from day_checks where user_id = $1 and day = $2`, [userId, day])).rows.map(r => r.k));
  const checked = (kind: string, id: string) => checks.has(`${kind}:${id}`);

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
    .map(n => ({ id: n.id, title: n.title || 'Untitled', snippet: n.body.replace(/\s+/g, ' ').slice(0, 90), done: checked('note', n.id) }));
  const reminderRows = (await c.query<{ id: string; title: string; reminder_at: Date }>(
    `select id, title, reminder_at from notes
      where workspace_id = $1 and deleted_at is null and reminder_at is not null and (reminder_at at time zone $3)::date = $2::date
      order by reminder_at`, [ws, day, tz])).rows;
  const reminders = reminderRows.map(r => ({ id: r.id, title: r.title || 'Untitled', atMin: minutesIn(tz, r.reminder_at), done: checked('reminder', r.id) }));
  for (const r of reminders) agenda.push({ key: `n${r.id}`, kind: 'reminder', startMin: r.atMin, endMin: null, title: r.title, emoji: '🔔', meta: 'Note reminder', done: r.done, href: `/notes?id=${r.id}`, toggle: { action: 'check', kind: 'reminder', id: r.id } });

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
  let timesheet: TodayData['timesheet'] = null;
  if (premium) {
    const meetings = (await c.query<{ id: string; title: string; start_min: number | null; end_min: number | null; attendees: string; open_actions: number }>(
      `select m.id, m.title, m.start_min, m.end_min, m.attendees,
              (select count(*)::int from meeting_actions a where a.meeting_id = m.id and not a.done) as open_actions
         from meetings m where m.meeting_on = $1 and m.deleted_at is null order by m.start_min nulls last`, [day])).rows;
    for (const m of meetings) {
      agenda.push({ key: `m${m.id}`, kind: 'meeting', startMin: m.start_min, endMin: m.end_min, title: m.title, emoji: '👥', meta: m.attendees ? `Meeting · ${m.attendees}` : 'Meeting', done: checked('meeting', m.id), href: `/work?tab=meetings&meeting=${m.id}`, toggle: { action: 'check', kind: 'meeting', id: m.id } });
    }
    const time = (await c.query<{ minutes: number; billable: number }>(
      `select coalesce(sum(end_min - start_min), 0)::int as minutes, coalesce(sum(end_min - start_min) filter (where billable), 0)::int as billable
         from time_entries where user_id = $1 and spent_on = $2 and deleted_at is null`, [userId, day])).rows[0];
    const timerRow = (await c.query<{ work_timer: { projectId: string; note: string; startedAt: string; twTask?: string } | null }>(
      `select work_timer from user_settings where user_id = $1`, [userId])).rows[0]?.work_timer ?? null;
    let timer: NonNullable<TodayData['work']>['timer'] = null;
    if (timerRow) {
      const p = (await c.query<{ name: string }>(`select name from projects where id = $1`, [timerRow.projectId])).rows[0];
      timer = { project: p?.name ?? 'Project', note: timerRow.note, startedAt: timerRow.startedAt, twTask: timerRow.twTask ?? null };
      const started = new Date(timerRow.startedAt);
      if (isToday && !Number.isNaN(started.getTime()) && dayIn(tz, started) === day) {
        const s0 = minutesIn(tz, started), nowM = minutesIn(tz, new Date());
        agenda.push({ key: 'timer', kind: 'work', startMin: s0, endMin: Math.max(s0 + 1, nowM), title: timer.note || timer.project,
          emoji: '⏱️', meta: [timer.project, timer.twTask].filter(Boolean).join(' · '), done: false, href: '/work', badge: { text: 'Timer running', tone: 'accent' } });
      }
    }

    // Planned work blocks; a ticked-off block has a live time entry behind it.
    const cat = o.autopilot ? await loadCatalog(c, userId) : null;
    const gone = (id: string | null, logged: boolean) => !logged && taskRemoved(cat, id);
    const plans = (await c.query<{ id: string; start_min: number; end_min: number; note: string; project: string; tw_task: string | null; tw_task_id: string | null; entry_id: string | null; logged: boolean }>(
      `select w.id, w.start_min, w.end_min, w.note, p.name as project, w.tw_task, w.tw_task_id::text as tw_task_id, e.id as entry_id, (e.tw_logged_at is not null) as logged
         from work_plans w join projects p on p.id = w.project_id
         left join time_entries e on e.id = w.entry_id and e.deleted_at is null
        where w.user_id = $1 and w.day = $2 and w.deleted_at is null order by w.start_min`, [userId, day])).rows;
    const planned = new Set<string>();
    for (const w of plans) {
      if (w.entry_id) planned.add(w.entry_id);
      agenda.push({ key: `w${w.id}`, kind: 'plan', startMin: w.start_min, endMin: w.end_min, title: w.note || w.tw_task || w.project, emoji: '🗂️',
        meta: [w.project, o.autopilot ? w.tw_task ?? 'no Teamwork task' : null].filter(Boolean).join(' · '), done: !!w.entry_id,
        toggle: { action: 'plan', id: w.id }, removePlan: w.entry_id ? undefined : w.id,
        badge: o.autopilot && gone(w.tw_task_id, w.logged) ? { text: 'Task removed in Teamwork', tone: 'danger' }
          : o.autopilot && w.entry_id ? (w.logged ? { text: 'In timesheet', tone: 'success' } : { text: 'Not sent yet', tone: 'warn' }) : undefined });
    }

    // Time entries of the day, each on the timeline (blocks from a plan are already there).
    const entries = (await c.query<{ id: string; start_min: number; end_min: number; note: string; billable: boolean; project: string; tw_task: string | null; tw_task_id: string | null; logged: boolean }>(
      `select e.id, e.start_min, e.end_min, e.note, e.billable, p.name as project, e.tw_task, e.tw_task_id::text as tw_task_id, (e.tw_logged_at is not null) as logged
         from time_entries e join projects p on p.id = e.project_id
        where e.user_id = $1 and e.spent_on = $2 and e.deleted_at is null order by e.start_min`, [userId, day])).rows;
    for (const e of entries) {
      if (planned.has(e.id)) continue;
      agenda.push({ key: `te${e.id}`, kind: 'work', startMin: e.start_min, endMin: e.end_min, title: e.note || e.project, emoji: '💼',
        meta: [e.project, o.autopilot ? e.tw_task ?? 'no Teamwork task' : null, `${e.end_min - e.start_min} min`, e.billable ? null : 'non-billable'].filter(Boolean).join(' · '),
        done: false, href: '/work',
        badge: o.autopilot && gone(e.tw_task_id, e.logged) ? { text: 'Task removed in Teamwork', tone: 'danger' }
          : o.autopilot ? (e.logged ? { text: 'In timesheet', tone: 'success' } : { text: 'Not sent yet', tone: e.tw_task ? 'warn' : '' }) : undefined });
    }

    if (o.autopilot) {
      const ts = (await c.query<{ logged_minutes: number; target_minutes: number | null; updated_at: Date }>(
        `select logged_minutes, target_minutes, updated_at from timesheet_days where user_id = $1 and day = $2`, [userId, day])).rows[0];
      const target = ts?.target_minutes ?? (await c.query<{ t: number | null }>(`select target_minutes as t from timesheet_catalog where user_id = $1`, [userId])).rows[0]?.t ?? null;
      const unsent = entries.filter(e => !e.logged);
      timesheet = {
        loggedMinutes: ts ? ts.logged_minutes : null, targetMinutes: target, updatedAt: ts?.updated_at ?? null,
        unsentMinutes: unsent.reduce((a, e) => a + e.end_min - e.start_min, 0), unsentCount: unsent.length, noTaskCount: unsent.filter(e => !e.tw_task).length,
      };
    }

    const openActions = meetings.reduce((s, m) => s + m.open_actions, 0);
    if (o.workMode || o.autopilot || meetings.length || time.minutes || timer || plans.length) {
      work = { minutes: time.minutes, billableMinutes: time.billable, timer, meetings: meetings.length, openActions, plans: plans.length };
    }
  }

  // Student classes and deadlines (premium, when student tools are on)
  if (premium && o.student) {
    const classes = (await c.query<{ id: string; title: string; kind: string; start_min: number; end_min: number; room: string }>(
      `select id, title, kind, start_min, end_min, room from classes where workspace_id = $1 and weekday = $2 and deleted_at is null order by start_min`, [ws, weekdayOf(day)])).rows;
    for (const k of classes) agenda.push({ key: `c${k.id}`, kind: 'class', startMin: k.start_min, endMin: k.end_min, title: k.title, emoji: '📚', meta: `${k.kind}${k.room ? ` · ${k.room}` : ''}`, done: checked('class', k.id), href: '/student', toggle: { action: 'check', kind: 'class', id: k.id } });
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
    focus, notes: { pinned, reminders }, work, timesheet, spend,
    nowMin: isToday ? minutesIn(tz, new Date()) : null,
  };
}
