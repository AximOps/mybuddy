'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { resolveTag } from '@/lib/tags';
import { reportLines } from '@/lib/work';
import { getSettings } from '@/lib/settings';
import { userHasPremium } from '@/lib/entitlements';
import { activeWorkspaceId, weekStartOf, WORKSPACE_COOKIE } from '@/lib/workspace';
import { parseMoney, zonedToUtc } from '@/lib/time';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn, isDateKey, isUuid, parseHM, shiftDateKey, weekdayOf } from '@/lib/time';
import { isRepeat, setTaskDoneIn } from '@/lib/tasks';

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().slice(0, max);

/* ---------- Today ---------- */

export async function toggleEvent(formData: FormData) {
  const user = await requireUser();
  const eventId = String(formData.get('eventId') ?? '');
  const day = String(formData.get('day') ?? '');
  if (!isUuid(eventId) || !isDateKey(day)) return;

  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const existing = await c.query<{ id: string; deleted_at: Date | null }>(
      `select id, deleted_at from completions where user_id = $1 and event_id = $2 and day = $3`, [user.id, eventId, day]);
    const row = existing.rows[0];
    if (row && !row.deleted_at) {
      await c.query(`update completions set deleted_at = now() where id = $1`, [row.id]);
    } else if (row) {
      await c.query(`update completions set deleted_at = null, completed_at = now() where id = $1`, [row.id]);
    } else {
      await c.query(
        `insert into completions (id, workspace_id, user_id, event_id, day) values ($1, $2, $3, $4, $5)`,
        [randomUUID(), ws, user.id, eventId, day]);
    }
  });
  revalidatePath('/today');
}

export async function addEvent(formData: FormData) {
  const user = await requireUser();
  const day = String(formData.get('day') ?? '');
  const title = text(formData.get('title'), 120);
  const emoji = text(formData.get('emoji'), 8) || '📌';
  const start = parseHM(formData.get('start'));
  const end = parseHM(formData.get('end'));
  if (!isDateKey(day) || !title || start === null || end === null || end <= start) return;

  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    // The event goes into the routine that applies on that weekday.
    const routine = await c.query<{ routine_id: string }>(
      `select routine_id from routine_days where workspace_id = $1 and weekday = $2 and deleted_at is null`,
      [ws, weekdayOf(day)]);
    let routineId = routine.rows[0]?.routine_id ?? null;
    if (!routineId) {
      // No routine covers this weekday yet (new accounts start empty): create "My routine"
      // for every weekday that has none, so the first activity just works.
      routineId = randomUUID();
      await c.query(`insert into routines (id, workspace_id, name, color, sort_order, created_by) values ($1, $2, 'My routine', '#4B5BE8', 0, $3)`, [routineId, ws, user.id]);
      await c.query(
        `insert into routine_days (workspace_id, weekday, routine_id)
         select $1, d, $2 from generate_series(0, 6) d
          where not exists (select 1 from routine_days x where x.workspace_id = $1 and x.weekday = d and x.deleted_at is null)
         on conflict (workspace_id, weekday) do update set routine_id = excluded.routine_id, deleted_at = null`,
        [ws, routineId]);
    }
    await c.query(
      `insert into events (id, workspace_id, routine_id, title, emoji, start_min, end_min, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), ws, routineId, title, emoji, start, end, user.id]);
  });
  revalidatePath('/today');
}

/* ---------- Tasks ---------- */

export async function addTask(formData: FormData) {
  const user = await requireUser();
  const title = text(formData.get('title'), 120);
  const dueRaw = String(formData.get('dueDate') ?? '');
  const repeatRaw = String(formData.get('repeat') ?? 'none');
  const repeat = isRepeat(repeatRaw) ? repeatRaw : 'none';
  if (!title) return;

  await withUser(user.id, async c => {
    const { timezone } = await getSettings(c, user.id);
    // A repeating task needs a first date; without one it starts today.
    const dueDate = isDateKey(dueRaw) ? dueRaw : repeat !== 'none' ? dateKeyIn(timezone) : null;
    const dueTime = dueDate ? parseHM(formData.get('dueTime')) : null;
    const ws = await personalWorkspaceId(c, user.id);
    const tag = await resolveTag(c, user.id, 'task', text(formData.get('tag'), 20), text(formData.get('newTag'), 20), 'Personal');
    await c.query(
      `insert into tasks (id, workspace_id, title, due_date, due_time, tag, repeat, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), ws, title, dueDate, dueTime, tag, repeat, user.id]);
  });
  revalidatePath('/tasks');
  revalidatePath('/today');
}

export async function setTaskDone(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const done = formData.get('done') === 'true';
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    const { timezone } = await getSettings(c, user.id);
    await setTaskDoneIn(c, id, done, dateKeyIn(timezone));
  });
  revalidatePath('/tasks');
  revalidatePath('/today');
  revalidatePath('/week');
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update tasks set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/tasks');
}

/** Daily review: moves every unfinished task due on or before `from` to `to`. */
export async function moveUnfinishedTasks(formData: FormData) {
  const user = await requireUser();
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!isDateKey(from) || !isDateKey(to) || to <= from) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(
      `update tasks set due_date = $3 where workspace_id = $1 and deleted_at is null and not done and due_date is not null and due_date <= $2`,
      [ws, from, to]);
  });
  revalidatePath('/today');
  revalidatePath('/tasks');
  revalidatePath('/week');
}

/* ---------- Week view ---------- */

/**
 * Moves a to-do or a meeting to another day and time (drag and drop on the week view).
 * startMin null means "any time that day". A meeting keeps its length.
 */
export async function rescheduleItem(kind: 'task' | 'meeting', id: string, day: string, startMin: number | null): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!isUuid(id) || !isDateKey(day) || (startMin !== null && (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439))) return { ok: false };
  if (kind === 'meeting' && !(await withUser(user.id, async c => userHasPremium(c, user.id)))) return { ok: false };
  const ok = await withUser(user.id, async c => {
    if (kind === 'task') {
      const r = await c.query(`update tasks set due_date = $2, due_time = $3 where id = $1 and deleted_at is null`, [id, day, startMin]);
      return r.rowCount === 1;
    }
    const m = (await c.query<{ start_min: number | null; end_min: number | null }>(`select start_min, end_min from meetings where id = $1 and deleted_at is null`, [id])).rows[0];
    if (!m) return false;
    const length = m.start_min !== null && m.end_min !== null ? m.end_min - m.start_min : 60;
    const end = startMin === null ? null : Math.min(1439, startMin + length);
    const r = await c.query(`update meetings set meeting_on = $2, start_min = $3, end_min = $4, updated_at = now() where id = $1`, [id, day, startMin, end]);
    return r.rowCount === 1;
  });
  revalidatePath('/week');
  revalidatePath('/today');
  revalidatePath('/tasks');
  revalidatePath('/work');
  return { ok };
}

/* ---------- Welcome step ---------- */

/** First sign-in: mobile number (one free trial per number) and the mode that fits the person. */
export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const { normalizePhone } = await import('@/lib/phone');
  const phone = normalizePhone(String(formData.get('country') ?? '91'), String(formData.get('phone') ?? ''));
  const mode = String(formData.get('mode') ?? '');
  const level = String(formData.get('level') ?? 'college') === 'school' ? 'school' : 'college';
  const back = (e: string) => `/welcome?error=${e}&phone=${encodeURIComponent(String(formData.get('phone') ?? ''))}&mode=${encodeURIComponent(mode)}`;
  if (!phone) redirect(back('phone'));
  if (!['personal', 'work', 'student'].includes(mode)) redirect(back('mode'));
  let result = 'no_trial';
  try {
    result = await withUser(user.id, async c => (await c.query<{ r: string }>(`select complete_onboarding($1, $2, $3, $4) as r`, [user.id, phone, mode, level])).rows[0].r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    redirect(back(msg.includes('PHONE_TAKEN') ? 'taken' : 'failed'));
  }
  revalidatePath('/', 'layout');
  redirect(`/today?welcome=${result}`);
}

/* ---------- Today: done ticks for meetings, classes, reminders and notes ---------- */

export async function toggleDayCheck(formData: FormData) {
  const user = await requireUser();
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '');
  const day = String(formData.get('day') ?? '');
  const done = formData.get('done') === 'true';
  if (!['meeting', 'class', 'reminder', 'note'].includes(kind) || !isUuid(id) || !isDateKey(day)) return;
  await withUser(user.id, async c => {
    if (done) await c.query(`insert into day_checks (user_id, kind, ref_id, day) values ($1, $2, $3, $4) on conflict do nothing`, [user.id, kind, id, day]);
    else await c.query(`delete from day_checks where user_id = $1 and kind = $2 and ref_id = $3 and day = $4`, [user.id, kind, id, day]);
  });
  revalidatePath('/today');
  revalidatePath('/week');
}

/* ---------- Calendar feed ---------- */

/** Creates (or replaces) the secret token in the private calendar URL. Replacing it breaks the old link. */
export async function resetCalendarFeed() {
  const user = await requireUser();
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(24).toString('base64url');
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, calendar_token) values ($1, $2)
       on conflict (user_id) do update set calendar_token = excluded.calendar_token, updated_at = now()`, [user.id, token]);
  });
  revalidatePath('/settings');
}

export async function disableCalendarFeed() {
  const user = await requireUser();
  await withUser(user.id, async c => { await c.query(`update user_settings set calendar_token = null, updated_at = now() where user_id = $1`, [user.id]); });
  revalidatePath('/settings');
}

/* ---------- Notes ---------- */
/** Shared by create and update: title, body, tag (or a new tag), pin and optional reminder. */
async function saveNoteFields(userId: string, id: string, formData: FormData, isNew: boolean) {
  const title = text(formData.get('title'), 200);
  const body = String(formData.get('body') ?? '').slice(0, 20000);
  const pinned = formData.get('pinned') === 'on';
  await withUser(userId, async c => {
    const { getSettings } = await import('@/lib/settings');
    const settings = await getSettings(c, userId);
    const tag = await resolveTag(c, userId, 'note', text(formData.get('tag'), 20), text(formData.get('newTag'), 20), 'Personal');
    const reminderRaw = String(formData.get('reminderAt') ?? '');
    const reminderMs = reminderRaw ? zonedToUtc(reminderRaw, settings.timezone) : NaN;
    const reminder = Number.isNaN(reminderMs) ? null : new Date(reminderMs).toISOString();
    if (isNew) {
      const ws = await personalWorkspaceId(c, userId);
      await c.query(
        `insert into notes (id, workspace_id, title, body, tag, pinned, reminder_at, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, ws, title, body, tag, pinned, reminder, userId]);
    } else {
      await c.query(
        `update notes set title = $2, body = $3, tag = $4, pinned = $5, reminder_at = $6 where id = $1`,
        [id, title, body, tag, pinned, reminder]);
    }
  });
}


export async function createNote(formData: FormData) {
  const user = await requireUser();
  const id = randomUUID();
  await saveNoteFields(user.id, id, formData, true);
  revalidatePath('/notes');
  redirect(`/notes?id=${id}`);
}

export async function updateNote(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await saveNoteFields(user.id, id, formData, false);
  revalidatePath('/notes');
  revalidatePath(`/notes?id=${id}`);
}

export async function deleteNote(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update notes set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/notes');
  redirect('/notes');
}

/* ---------- Quick reminders (Focus page) ----------
   A quick reminder is a note with a reminder time, so it shows on Today, in Notes, in the calendar
   feed and on the mobile app like any other note reminder. */

const QUICK_REMINDER = 'web-quick-reminder';

export async function addQuickReminder(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const title = text(formData.get('title'), 200);
  if (!title) return { ok: false, error: 'Write what to remind you about.' };
  const inMin = Number(formData.get('inMin'));
  const atRaw = String(formData.get('at') ?? '');
  return withUser(user.id, async c => {
    const settings = await getSettings(c, user.id);
    const atMs = Number.isInteger(inMin) && inMin > 0 && inMin <= 7 * 24 * 60 ? Date.now() + inMin * 60_000 : atRaw ? zonedToUtc(atRaw, settings.timezone) : NaN;
    if (Number.isNaN(atMs)) return { ok: false, error: 'Pick a time.' };
    if (atMs < Date.now() - 60_000) return { ok: false, error: 'That time has already passed.' };
    if (atMs > Date.now() + 366 * 86_400_000) return { ok: false, error: 'Pick a time within the next year.' };
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(
      `insert into notes (id, workspace_id, title, body, tag, pinned, reminder_at, created_by, device_id) values ($1, $2, $3, '', 'Personal', false, $4, $5, $6)`,
      [randomUUID(), ws, title, new Date(atMs).toISOString(), user.id, QUICK_REMINDER]);
    revalidatePath('/focus'); revalidatePath('/today'); revalidatePath('/notes');
    return { ok: true };
  });
}

/** Removes a reminder. A quick reminder note that was never given text goes; any other note just loses its reminder time. */
export async function removeReminder(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update notes set deleted_at = case when body = '' and device_id = $2 then now() else deleted_at end, reminder_at = null, updated_at = now() where id = $1 and deleted_at is null`, [id, QUICK_REMINDER]);
  });
  revalidatePath('/focus'); revalidatePath('/today'); revalidatePath('/notes');
}

/* ---------- Routines ---------- */

const COLOR = /^#[0-9a-f]{6}$/i;

async function workspaceFor(c: import('pg').PoolClient, userId: string) {
  return personalWorkspaceId(c, userId);
}

export async function createRoutine(formData: FormData) {
  const user = await requireUser();
  const name = text(formData.get('name'), 60);
  const color = String(formData.get('color') ?? '');
  if (!name) return;
  await withUser(user.id, async c => {
    const ws = await workspaceFor(c, user.id);
    await c.query(
      `insert into routines (id, workspace_id, name, color, sort_order, created_by)
       values ($1, $2, $3, $4, (select coalesce(max(sort_order), -1) + 1 from routines where workspace_id = $2), $5)`,
      [randomUUID(), ws, name, COLOR.test(color) ? color : '#4B5BE8', user.id]);
  });
  revalidatePath('/routines');
}

export async function updateRoutine(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const name = text(formData.get('name'), 60);
  const color = String(formData.get('color') ?? '');
  if (!isUuid(id) || !name) return;
  await withUser(user.id, async c => {
    await c.query(`update routines set name = $2, color = $3 where id = $1`, [id, name, COLOR.test(color) ? color : '#4B5BE8']);
  });
  revalidatePath('/routines');
  revalidatePath('/today');
}

/** Gives one weekday to a routine. A weekday always belongs to exactly one routine. */
export async function setRoutineDay(formData: FormData) {
  const user = await requireUser();
  const routineId = String(formData.get('routineId') ?? '');
  const weekday = Number(formData.get('weekday'));
  if (!isUuid(routineId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
  await withUser(user.id, async c => {
    const ws = await workspaceFor(c, user.id);
    const current = await c.query<{ routine_id: string }>(
      `select routine_id from routine_days where workspace_id = $1 and weekday = $2 and deleted_at is null`, [ws, weekday]);
    if (current.rows[0]?.routine_id === routineId) {
      // Already this routine: clicking again moves the day to the first other routine, so no day is left empty.
      const other = await c.query<{ id: string }>(
        `select id from routines where workspace_id = $1 and id <> $2 and deleted_at is null order by sort_order limit 1`, [ws, routineId]);
      if (!other.rows[0]) return;
      await c.query(`update routine_days set routine_id = $3 where workspace_id = $1 and weekday = $2`, [ws, weekday, other.rows[0].id]);
      return;
    }
    await c.query(
      `insert into routine_days (workspace_id, weekday, routine_id) values ($1, $2, $3)
       on conflict (workspace_id, weekday) do update set routine_id = excluded.routine_id, deleted_at = null`,
      [ws, weekday, routineId]);
  });
  revalidatePath('/routines');
  revalidatePath('/today');
}

/** Deletes a routine and its activities. Its weekdays move to the first remaining routine. */
export async function deleteRoutine(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    const ws = await workspaceFor(c, user.id);
    const other = await c.query<{ id: string }>(
      `select id from routines where workspace_id = $1 and id <> $2 and deleted_at is null order by sort_order limit 1`, [ws, id]);
    if (!other.rows[0]) return; // keep at least one routine
    await c.query(`update routine_days set routine_id = $3 where workspace_id = $1 and routine_id = $2`, [ws, id, other.rows[0].id]);
    await c.query(`update events set deleted_at = now() where routine_id = $1`, [id]);
    await c.query(`update routines set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/routines');
  revalidatePath('/today');
}

export async function addActivity(formData: FormData) {
  const user = await requireUser();
  const routineId = String(formData.get('routineId') ?? '');
  const title = text(formData.get('title'), 120);
  const emoji = text(formData.get('emoji'), 8) || '📌';
  const start = parseHM(formData.get('start'));
  const end = parseHM(formData.get('end'));
  const category = text(formData.get('category'), 20) || 'personal';
  if (!isUuid(routineId) || !title || start === null || end === null || end <= start) return;
  await withUser(user.id, async c => {
    const ws = await workspaceFor(c, user.id);
    await c.query(
      `insert into events (id, workspace_id, routine_id, title, emoji, start_min, end_min, category, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), ws, routineId, title, emoji, start, end, category, user.id]);
  });
  revalidatePath('/routines');
  revalidatePath('/today');
}

export async function updateActivity(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const title = text(formData.get('title'), 120);
  const emoji = text(formData.get('emoji'), 8) || '📌';
  const start = parseHM(formData.get('start'));
  const end = parseHM(formData.get('end'));
  if (!isUuid(id) || !title || start === null || end === null || end <= start) return;
  await withUser(user.id, async c => {
    await c.query(`update events set title = $2, emoji = $3, start_min = $4, end_min = $5 where id = $1`, [id, title, emoji, start, end]);
  });
  revalidatePath('/routines');
  revalidatePath('/today');
}

export async function deleteActivity(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update events set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/routines');
  revalidatePath('/today');
}

/* ---------- Focus ---------- */

/** Records a focus session that finished in the browser. */
export async function recordFocusSession(formData: FormData): Promise<boolean> {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return false; // premium only
  const title = text(formData.get('title'), 60);
  const minutes = Number(formData.get('minutes'));
  const taskId = String(formData.get('taskId') ?? '');
  const completeTask = formData.get('completeTask') === 'true';
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) return false;
  await withUser(user.id, async c => {
    const ws = await workspaceFor(c, user.id);
    const linked = isUuid(taskId) ? taskId : null;
    await c.query(
      `insert into focus_sessions (id, workspace_id, user_id, title, minutes, task_id) values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), ws, user.id, title, minutes, linked]);
    if (linked && completeTask) {
      const { timezone } = await getSettings(c, user.id);
      await setTaskDoneIn(c, linked, true, dateKeyIn(timezone));
    }
  });
  revalidatePath('/stats');
  revalidatePath('/today');
  revalidatePath('/tasks');
  return true;
}

/* ---------- Settings ---------- */

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const name = text(formData.get('name'), 80);
  if (!name) return;
  await withUser(user.id, async c => {
    await c.query(`update "user" set name = $2, "updatedAt" = now() where id = $1`, [user.id, name]);
  });
  revalidatePath('/settings');
}

export async function updateSettings(formData: FormData) {
  const user = await requireUser();
  const tz = text(formData.get('timezone'), 60);
  const currency = text(formData.get('currency'), 3);
  const { isValidTimezone, CURRENCIES } = await import('@/lib/settings');
  if (!isValidTimezone(tz) || !(CURRENCIES as readonly string[]).includes(currency)) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, timezone, currency) values ($1, $2, $3)
       on conflict (user_id) do update set timezone = excluded.timezone, currency = excluded.currency, updated_at = now()`,
      [user.id, tz, currency]);
  });
  revalidatePath('/settings');
  revalidatePath('/today');
  revalidatePath('/stats');
}

/* ---------- Checklists ---------- */

export async function addChecklistItem(formData: FormData) {
  const user = await requireUser();
  const noteId = String(formData.get('noteId') ?? '');
  const itemText = text(formData.get('text'), 200);
  if (!isUuid(noteId) || !itemText) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into note_items (id, note_id, text, sort_order)
       values ($1, $2, $3, (select coalesce(max(sort_order), -1) + 1 from note_items where note_id = $2))`,
      [randomUUID(), noteId, itemText]);
  });
  revalidatePath('/notes');
}

export async function toggleChecklistItem(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update note_items set done = not done where id = $1`, [id]);
  });
  revalidatePath('/notes');
}

export async function deleteChecklistItem(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`delete from note_items where id = $1`, [id]);
  });
  revalidatePath('/notes');
}

export async function clearCompletedTasks() {
  const user = await requireUser();
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(`update tasks set deleted_at = now() where workspace_id = $1 and done and deleted_at is null`, [ws]);
  });
  revalidatePath('/tasks');
  revalidatePath('/today');
}

/* ---------- Spending ---------- */

export async function addExpense(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const amount = parseMoney(formData.get('amount'));
  const day = String(formData.get('day') ?? '');
  const note = text(formData.get('note'), 120);
  if (amount === null || !isDateKey(day)) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const category = await resolveTag(c, user.id, 'spend', text(formData.get('category'), 20), text(formData.get('newCategory'), 20), 'other');
    await c.query(
      `insert into expenses (id, workspace_id, user_id, spent_on, amount_minor, category, note) values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), ws, user.id, day, amount, category, note]);
  });
  revalidatePath('/spend');
  revalidatePath('/stats');
}

export async function deleteExpense(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update expenses set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/spend');
  revalidatePath('/stats');
}

export async function setMonthlyBudget(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const raw = String(formData.get('budget') ?? '').trim();
  const minor = raw === '' ? null : parseMoney(raw);
  if (raw !== '' && minor === null) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, monthly_budget_minor) values ($1, $2)
       on conflict (user_id) do update set monthly_budget_minor = excluded.monthly_budget_minor, updated_at = now()`,
      [user.id, minor]);
  });
  revalidatePath('/spend');
}

/* ---------- Spending: bills, category budgets, CSV import ---------- */

export async function addBill(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const name = text(formData.get('name'), 80);
  const amount = parseMoney(formData.get('amount'));
  const dayOfMonth = Number(formData.get('dayOfMonth'));
  const category = text(formData.get('category'), 20) || 'bills';
  if (!name || amount === null || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const { timezone } = await getSettings(c, user.id);
    const today = dateKeyIn(timezone);
    // A bill added after its day this month starts next month, so nothing is posted by surprise.
    const startsNextMonth = dayOfMonth < Number(today.slice(8, 10));
    await c.query(
      `insert into recurring_expenses (id, workspace_id, user_id, name, amount_minor, category, day_of_month, last_posted_month)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), ws, user.id, name, amount, category, dayOfMonth, startsNextMonth ? today.slice(0, 7) : null]);
  });
  revalidatePath('/spend');
}

export async function deleteBill(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => { await c.query(`update recurring_expenses set deleted_at = now() where id = $1`, [id]); });
  revalidatePath('/spend');
}

export async function setCategoryBudget(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const category = text(formData.get('category'), 20);
  const raw = String(formData.get('amount') ?? '').trim();
  const minor = raw === '' ? null : parseMoney(raw);
  if (!category || (raw !== '' && minor === null)) return;
  await withUser(user.id, async c => {
    if (minor === null) await c.query(`delete from category_budgets where user_id = $1 and category = $2`, [user.id, category]);
    else await c.query(
      `insert into category_budgets (user_id, category, amount_minor) values ($1, $2, $3)
       on conflict (user_id, category) do update set amount_minor = excluded.amount_minor, updated_at = now()`, [user.id, category, minor]);
  });
  revalidatePath('/spend');
}

/** Imports money going out from a bank statement CSV. Rows already imported are skipped. */
export async function importBankCsv(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) redirect('/spend?import=empty');
  if (file.size > 2_000_000) redirect('/spend?import=big');
  const { parseBankCsv } = await import('@/lib/spending');
  const parsed = parseBankCsv(await file.text());
  if (parsed.error) redirect(`/spend?import=error&msg=${encodeURIComponent(parsed.error)}`);
  let added = 0, dupes = 0;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const existing = new Set((await c.query<{ source_ref: string }>(
      `select source_ref from expenses where user_id = $1 and source_ref = any($2) and deleted_at is null`, [user.id, parsed.rows.map(r => r.ref)])).rows.map(r => r.source_ref));
    for (const r of parsed.rows.slice(0, 2000)) {
      if (existing.has(r.ref)) { dupes++; continue; }
      existing.add(r.ref);
      await c.query(
        `insert into expenses (id, workspace_id, user_id, spent_on, amount_minor, category, note, source, source_ref)
         values ($1, $2, $3, $4, $5, $6, $7, 'csv', $8)`,
        [randomUUID(), ws, user.id, r.day, r.amountMinor, r.category, r.note, r.ref]);
      added++;
    }
  });
  revalidatePath('/spend');
  revalidatePath('/stats');
  redirect(`/spend?import=done&added=${added}&dupes=${dupes}&skipped=${parsed.skipped}`);
}

/* ---------- Settings: preferences ---------- */

export async function updateAppearance(formData: FormData) {
  const user = await requireUser();
  const theme = String(formData.get('theme') ?? '');
  if (!['system', 'light', 'dark'].includes(theme)) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, theme) values ($1, $2)
       on conflict (user_id) do update set theme = excluded.theme, updated_at = now()`,
      [user.id, theme]);
  });
  (await cookies()).set('theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/settings');
}

export async function updateMode(formData: FormData) {
  const user = await requireUser();
  const mode = String(formData.get('mode') ?? '');
  if (mode !== 'personal' && !(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // Student and Work are premium
  if (!['student', 'personal', 'work'].includes(mode)) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, mode, student_enabled) values ($1, $2, $3)
       on conflict (user_id) do update set mode = excluded.mode, student_enabled = excluded.student_enabled, updated_at = now()`,
      [user.id, mode, mode === 'student']);
  });
  revalidatePath('/settings');
}

export async function updateStudentTools(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const enabled = formData.get('enabled') === 'on';
  const level = String(formData.get('level') ?? '') === 'school' ? 'school' : 'college';
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, student_enabled, student_level) values ($1, $2, $3)
       on conflict (user_id) do update set student_enabled = excluded.student_enabled, student_level = excluded.student_level, updated_at = now()`,
      [user.id, enabled, level]);
  });
  revalidatePath('/settings');
  revalidatePath('/today');
}

export async function deleteCustomTag(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`delete from custom_tags where id = $1 and user_id = $2`, [id, user.id]);
  });
  revalidatePath('/settings');
}

/* ---------- Routines: copy and resets ---------- */

export async function copyRoutine(formData: FormData) {
  const user = await requireUser();
  const routineId = String(formData.get('routineId') ?? '');
  if (!isUuid(routineId)) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const src = await c.query<{ name: string; color: string }>(`select name, color from routines where id = $1 and workspace_id = $2`, [routineId, ws]);
    if (!src.rows[0]) return;
    const newId = randomUUID();
    await c.query(
      `insert into routines (id, workspace_id, name, color, sort_order, created_by)
       values ($1, $2, $3, $4, (select coalesce(max(sort_order), -1) + 1 from routines where workspace_id = $2), $5)`,
      [newId, ws, `${src.rows[0].name} (copy)`.slice(0, 60), src.rows[0].color, user.id]);
    await c.query(
      `insert into events (id, workspace_id, routine_id, title, emoji, start_min, end_min, category, remind_min, created_by)
       select gen_random_uuid(), workspace_id, $2, title, emoji, start_min, end_min, category, remind_min, $3
         from events where routine_id = $1 and deleted_at is null`,
      [routineId, newId, user.id]);
  });
  revalidatePath('/routines');
}

export async function resetTodayProgress(formData: FormData) {
  const user = await requireUser();
  const day = String(formData.get('day') ?? '');
  if (!isDateKey(day)) return;
  await withUser(user.id, async c => {
    await c.query(`update completions set deleted_at = now() where user_id = $1 and day = $2 and deleted_at is null`, [user.id, day]);
  });
  revalidatePath('/today');
  revalidatePath('/stats');
}

/** Removes all routines, activities, tasks, notes, spending and focus history so the account starts fresh. */
export async function resetAllData(formData: FormData) {
  const user = await requireUser();
  if (formData.get('confirm') !== 'RESET') return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(`delete from completions where user_id = $1`, [user.id]);
    await c.query(`delete from focus_sessions where user_id = $1`, [user.id]);
    await c.query(`delete from expenses where user_id = $1`, [user.id]);
    await c.query(`delete from custom_tags where user_id = $1`, [user.id]);
    await c.query(`delete from notes where workspace_id = $1`, [ws]);
    await c.query(`delete from tasks where workspace_id = $1`, [ws]);
    await c.query(`delete from routine_days where workspace_id = $1`, [ws]);
    await c.query(`delete from events where workspace_id = $1`, [ws]);
    await c.query(`delete from routines where workspace_id = $1`, [ws]);
    // Tells the phone app to clear its copy and download again (the rows above are gone for good).
    await c.query(`update user_settings set data_reset_at = now() where user_id = $1`, [user.id]);
  });
  revalidatePath('/', 'layout');
}

/* ---------- Student: subjects, marks, classes, deadlines ---------- */

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? '').trim());
  return String(v ?? '').trim() === '' || !Number.isFinite(n) ? null : n;
};
const optionalUuid = (v: FormDataEntryValue | null) => (isUuid(String(v ?? '')) ? String(v) : null);

export async function addSubject(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const name = text(formData.get('name'), 60);
  const credits = num(formData.get('credits')) ?? 0;
  const gp = num(formData.get('gradePoint'));
  if (!name || credits < 0 || credits > 30 || (gp !== null && (gp < 0 || gp > 10))) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(`insert into subjects (id, workspace_id, name, credits, grade_point, created_by) values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), ws, name, credits, gp, user.id]);
  });
  revalidatePath('/student');
}

export async function updateSubject(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  const name = text(formData.get('name'), 60);
  const credits = num(formData.get('credits')) ?? 0;
  const gp = num(formData.get('gradePoint'));
  if (!isUuid(id) || !name || credits < 0 || credits > 30 || (gp !== null && (gp < 0 || gp > 10))) return;
  await withUser(user.id, async c => {
    await c.query(`update subjects set name = $2, credits = $3, grade_point = $4, updated_at = now() where id = $1`, [id, name, credits, gp]);
  });
  revalidatePath('/student');
  revalidatePath(`/student/subjects/${id}`);
}

export async function deleteSubject(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update subjects set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/student');
  redirect('/student?tab=subjects');
}

export async function addMark(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const subjectId = String(formData.get('subjectId') ?? '');
  const title = text(formData.get('title'), 80);
  const score = num(formData.get('score'));
  const max = num(formData.get('maxScore'));
  if (!isUuid(subjectId) || !title || score === null || max === null || max <= 0 || score < 0 || score > max) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(`insert into assessments (id, workspace_id, subject_id, title, score, max_score) values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), ws, subjectId, title, score, max]);
  });
  revalidatePath(`/student/subjects/${subjectId}`);
  revalidatePath('/student');
}

export async function deleteMark(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  const subjectId = String(formData.get('subjectId') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update assessments set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath(`/student/subjects/${subjectId}`);
  revalidatePath('/student');
}

export async function addClass(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const title = text(formData.get('title'), 60);
  const kind = String(formData.get('kind') ?? 'lecture');
  const weekday = Number(formData.get('weekday'));
  const start = parseHM(formData.get('start'));
  const end = parseHM(formData.get('end'));
  const room = text(formData.get('room'), 20);
  if (!title || !['lecture', 'lab', 'tutorial'].includes(kind) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || start === null || end === null || end <= start) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(
      `insert into classes (id, workspace_id, subject_id, title, kind, weekday, start_min, end_min, room) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), ws, optionalUuid(formData.get('subjectId')), title, kind, weekday, start, end, room]);
  });
  revalidatePath('/student');
  revalidatePath('/today');
}

export async function deleteClass(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update classes set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/student');
  revalidatePath('/today');
}

export async function addDeadline(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const title = text(formData.get('title'), 120);
  const kind = String(formData.get('kind') ?? 'assignment');
  const dueDate = String(formData.get('dueDate') ?? '');
  const dueTime = formData.get('dueTime') ? parseHM(formData.get('dueTime')) : null;
  if (!title || !['assignment', 'exam'].includes(kind) || !isDateKey(dueDate)) return;
  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(
      `insert into deadlines (id, workspace_id, subject_id, title, kind, due_date, due_time, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), ws, optionalUuid(formData.get('subjectId')), title, kind, dueDate, dueTime, user.id]);
  });
  revalidatePath('/student');
  revalidatePath('/today');
}

export async function toggleDeadline(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  const done = formData.get('done') === 'true';
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update deadlines set done = $2, updated_at = now() where id = $1`, [id, done]);
  });
  revalidatePath('/student');
  revalidatePath('/today');
}

export async function deleteDeadline(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update deadlines set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/student');
  revalidatePath('/today');
}

/* ---------- Work: clients, projects, timesheet, meetings, invoices ---------- */

export async function addClient(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const name = text(formData.get('name'), 80);
  if (!name) return;
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    await c.query(`insert into clients (id, workspace_id, name) values ($1, $2, $3)`, [randomUUID(), ws, name]);
  });
  revalidatePath('/work');
}

export async function deleteClient(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => { await c.query(`update clients set deleted_at = now() where id = $1`, [id]); });
  revalidatePath('/work');
}

export async function addProject(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const name = text(formData.get('name'), 80);
  const clientId = optionalUuid(formData.get('clientId'));
  const rateRaw = String(formData.get('rate') ?? '').trim();
  const rate = rateRaw === '' ? 0 : parseMoney(rateRaw);
  if (!name || rate === null) return;
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    await c.query(`insert into projects (id, workspace_id, client_id, name, hourly_rate_minor) values ($1, $2, $3, $4, $5)`,
      [randomUUID(), ws, clientId, name, rate]);
  });
  revalidatePath('/work');
}

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => { await c.query(`update projects set deleted_at = now() where id = $1`, [id]); });
  revalidatePath('/work');
}

export async function startTimer(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const projectId = String(formData.get('projectId') ?? '');
  const note = text(formData.get('note'), 160);
  if (!isUuid(projectId)) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into user_settings (user_id, work_timer) values ($1, $2)
       on conflict (user_id) do update set work_timer = excluded.work_timer, updated_at = now()`,
      [user.id, JSON.stringify({ projectId, note, startedAt: new Date().toISOString() })]);
  });
  revalidatePath('/work');
}

/** Stops the running timer and saves it as a time entry on the day it started (in the person's time zone). */
export async function stopTimer() {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  await withUser(user.id, async c => {
    const settings = await getSettings(c, user.id);
    const row = (await c.query<{ work_timer: { projectId: string; note: string; startedAt: string } | null }>(
      `select work_timer from user_settings where user_id = $1`, [user.id])).rows[0];
    const t = row?.work_timer;
    if (!t) return;
    const ws = await activeWorkspaceId(c, user.id);
    const startMs = Date.parse(t.startedAt);
    const endMs = Date.now();
    const local = (ms: number) => {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
      const g = (k: string) => Number(p.find(x => x.type === k)?.value);
      return { day: `${g('year')}-${String(g('month')).padStart(2, '0')}-${String(g('day')).padStart(2, '0')}`, min: g('hour') * 60 + g('minute') };
    };
    const s = local(startMs);
    const startMin = s.min;
    const minutes = Math.max(1, Math.min(1440 - startMin, Math.round((endMs - startMs) / 60000)));
    await c.query(
      `insert into time_entries (id, workspace_id, user_id, project_id, spent_on, start_min, end_min, billable, note)
       values ($1, $2, $3, $4, $5, $6, $7, true, $8)`,
      [randomUUID(), ws, user.id, t.projectId, s.day, startMin, startMin + minutes, t.note]);
    await c.query(`update user_settings set work_timer = null, updated_at = now() where user_id = $1`, [user.id]);
  });
  revalidatePath('/work');
  revalidatePath('/stats');
  revalidatePath('/today');
}

export async function addTimeEntry(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const projectId = String(formData.get('projectId') ?? '');
  const day = String(formData.get('day') ?? '');
  const start = parseHM(formData.get('start'));
  const end = parseHM(formData.get('end'));
  const note = text(formData.get('note'), 160);
  const billable = formData.get('billable') === 'on';
  if (!isUuid(projectId) || !isDateKey(day) || start === null || end === null || end <= start) return;
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    if (await weekIsApproved(c, ws, user.id, day)) return;
    await c.query(
      `insert into time_entries (id, workspace_id, user_id, project_id, spent_on, start_min, end_min, billable, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), ws, user.id, projectId, day, start, end, billable, note]);
  });
  revalidatePath('/work');
  revalidatePath('/stats');
}

export async function deleteTimeEntry(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    const row = (await c.query<{ spent_on: string; workspace_id: string }>(`select spent_on::text as spent_on, workspace_id from time_entries where id = $1 and user_id = $2`, [id, user.id])).rows[0];
    if (!row || await weekIsApproved(c, row.workspace_id, user.id, row.spent_on)) return;
    await c.query(`update time_entries set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/work');
}

export async function addMeeting(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const title = text(formData.get('title'), 120);
  const meetingOn = String(formData.get('meetingOn') ?? '');
  const start = formData.get('start') ? parseHM(formData.get('start')) : null;
  const end = formData.get('end') ? parseHM(formData.get('end')) : null;
  if (!title || !isDateKey(meetingOn) || (end !== null && start !== null && end <= start)) return;
  const { normalizeMeetUrl } = await import('@/lib/meeting-link');
  const meetUrl = normalizeMeetUrl(formData.get('meetUrl'));
  const id = randomUUID();
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    await c.query(
      `insert into meetings (id, workspace_id, title, meeting_on, start_min, end_min, attendees, agenda, notes, meet_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, ws, title, meetingOn, start, end, text(formData.get('attendees'), 300), String(formData.get('agenda') ?? '').slice(0, 5000), String(formData.get('notes') ?? '').slice(0, 20000), meetUrl || null]);
  });
  revalidatePath('/work');
  redirect(`/work?tab=meetings&meeting=${id}${meetUrl === null ? '&link=bad' : ''}`);
}

export async function updateMeeting(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  const title = text(formData.get('title'), 120);
  const meetingOn = String(formData.get('meetingOn') ?? '');
  const start = formData.get('start') ? parseHM(formData.get('start')) : null;
  const end = formData.get('end') ? parseHM(formData.get('end')) : null;
  if (!isUuid(id) || !title || !isDateKey(meetingOn)) return;
  const { normalizeMeetUrl } = await import('@/lib/meeting-link');
  const meetUrl = normalizeMeetUrl(formData.get('meetUrl'));
  await withUser(user.id, async c => {
    // A link that is not usable keeps the saved one; the page says so.
    await c.query(
      `update meetings set title = $2, meeting_on = $3, start_min = $4, end_min = $5, attendees = $6, agenda = $7, notes = $8,
              meet_url = case when $9::boolean then meet_url else $10 end, updated_at = now() where id = $1`,
      [id, title, meetingOn, start, end, text(formData.get('attendees'), 300), String(formData.get('agenda') ?? '').slice(0, 5000), String(formData.get('notes') ?? '').slice(0, 20000), meetUrl === null, meetUrl || null]);
  });
  revalidatePath('/work');
  redirect(`/work?tab=meetings&meeting=${id}${meetUrl === null ? '&link=bad' : '&saved=1'}`);
}

/**
 * Emails a calendar invite for the meeting, with the Google Meet (or other) link, to the addresses
 * given. Replies go to the person who sent it. Sending again updates the invite in people's calendars.
 */
export async function sendMeetingInvite(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  const back = `/work?tab=meetings&meeting=${id}`;
  const raw = String(formData.get('to') ?? '');
  const to = [...new Set((raw.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) ?? []).map(e => e.toLowerCase()))].filter(e => e !== user.email.toLowerCase()).slice(0, 25);
  const copyMe = formData.get('copyMe') === 'on';
  if (!to.length) redirect(`${back}&invite=none`);
  const m = await withUser(user.id, async c => {
    const row = (await c.query<{ title: string; meeting_on: string; start_min: number | null; end_min: number | null; agenda: string; meet_url: string | null; invite_seq: number }>(
      `update meetings set invite_seq = invite_seq + 1, invite_sent_at = now() where id = $1 and deleted_at is null
       returning title, meeting_on::text as meeting_on, start_min, end_min, agenda, meet_url, invite_seq`, [id])).rows[0];
    return row ? { ...row, tz: (await getSettings(c, user.id)).timezone } : null;
  });
  if (!m) return;
  const { buildInviteIcs, inviteText, whenText } = await import('@/lib/meeting-invite');
  const input = { id, seq: m.invite_seq, title: m.title, day: m.meeting_on, startMin: m.start_min, endMin: m.end_min, tz: m.tz, meetUrl: m.meet_url, agenda: m.agenda, organizer: { name: user.name, email: user.email }, attendees: to };
  const attachment = { filename: 'invite.ics', content: Buffer.from(buildInviteIcs(input)).toString('base64'), contentType: 'text/calendar; method=REQUEST; charset=UTF-8' };
  const subject = `${m.invite_seq > 1 ? 'Updated invitation' : 'Invitation'}: ${m.title} · ${whenText(input)}`;
  const body = inviteText(input);
  const { sendMail } = await import('@/lib/mail');
  let sent = 0, failed = false, off = false;
  for (const addr of copyMe ? [...to, user.email.toLowerCase()] : to) {
    const r = await sendMail(addr, subject, body, { replyTo: user.email, attachments: [attachment] });
    if (r.sent) { if (addr !== user.email.toLowerCase()) sent++; } else if (r.error) failed = true; else off = true;
  }
  revalidatePath('/work');
  redirect(`${back}&invite=${off && !sent ? 'off' : failed ? 'partial' : 'sent'}&n=${sent}`);
}

export async function deleteMeeting(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => { await c.query(`update meetings set deleted_at = now() where id = $1`, [id]); });
  revalidatePath('/work');
  redirect('/work?tab=meetings');
}

export async function addMeetingAction(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const meetingId = String(formData.get('meetingId') ?? '');
  const t = text(formData.get('text'), 200);
  if (!isUuid(meetingId) || !t) return;
  await withUser(user.id, async c => {
    await c.query(
      `insert into meeting_actions (id, meeting_id, text, sort_order)
       values ($1, $2, $3, (select coalesce(max(sort_order), -1) + 1 from meeting_actions where meeting_id = $2))`,
      [randomUUID(), meetingId, t]);
  });
  revalidatePath('/work');
}

export async function toggleMeetingAction(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => { await c.query(`update meeting_actions set done = not done where id = $1`, [id]); });
  revalidatePath('/work');
}

/** Copies an action item into the To-Do list, tagged Work. */
/** Turns a meeting action item into a to-do: for yourself (personal list) or for a teammate in the team workspace. */
export async function actionToTask(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  const assignee = String(formData.get('assignee') ?? '');
  const dueRaw = String(formData.get('dueDate') ?? '');
  const dueDate = isDateKey(dueRaw) ? dueRaw : null;
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    const forOther = assignee && assignee !== user.id
      ? (await c.query(`select 1 from workspace_members where workspace_id = $1 and user_id = $2`, [ws, assignee])).rowCount === 1
      : false;
    const target = forOther ? ws : await personalWorkspaceId(c, user.id);
    await c.query(
      `insert into tasks (id, workspace_id, title, tag, due_date, assignee_id, created_by)
       select gen_random_uuid(), $2, a.text, 'Work', $4, $5, $3 from meeting_actions a where a.id = $1`,
      [id, target, user.id, dueDate, forOther ? assignee : null]);
  });
  revalidatePath('/tasks');
  revalidatePath('/today');
  revalidatePath('/work');
}

/** Emails the meeting's agenda, notes and action items to the addresses given. */
export async function emailMeetingNotes(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  const raw = String(formData.get('to') ?? '');
  const to = [...new Set((raw.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) ?? []).map(e => e.toLowerCase()))].slice(0, 25);
  if (formData.get('copyMe') === 'on' && !to.includes(user.email.toLowerCase())) to.push(user.email.toLowerCase());
  const back = `/work?tab=meetings&meeting=${id}`;
  if (!to.length) redirect(`${back}&mail=none`);
  const m = await withUser(user.id, async c => {
    const meeting = (await c.query<{ title: string; meeting_on: string; start_min: number | null; end_min: number | null; attendees: string; agenda: string; notes: string; meet_url: string | null }>(
      `select title, meeting_on::text as meeting_on, start_min, end_min, attendees, agenda, notes, meet_url from meetings where id = $1 and deleted_at is null`, [id])).rows[0];
    const actions = (await c.query<{ text: string; done: boolean }>(`select text, done from meeting_actions where meeting_id = $1 order by sort_order`, [id])).rows;
    return meeting ? { ...meeting, actions } : null;
  });
  if (!m) return;
  const { fmtMinutes } = await import('@/lib/time');
  const when = `${m.meeting_on}${m.start_min !== null ? ` · ${fmtMinutes(m.start_min)}${m.end_min !== null ? `–${fmtMinutes(m.end_min)}` : ''}` : ''}`;
  const body = [
    m.title, when, m.attendees ? `Attendees: ${m.attendees}` : '', m.meet_url ? `Call link: ${m.meet_url}` : '', '',
    m.agenda ? `AGENDA\n${m.agenda}\n` : '',
    m.notes ? `NOTES\n${m.notes}\n` : '',
    m.actions.length ? `ACTION ITEMS\n${m.actions.map(a => `${a.done ? '[x]' : '[ ]'} ${a.text}`).join('\n')}\n` : '',
    `Sent by ${user.name || user.email} from My Buddy.`,
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
  const { sendMail } = await import('@/lib/mail');
  let sent = 0, failed = false, off = false;
  for (const addr of to) {
    const r = await sendMail(addr, `Meeting notes: ${m.title} (${m.meeting_on})`, body);
    if (r.sent) sent++; else if (r.error) failed = true; else off = true;
  }
  redirect(`${back}&mail=${off && !sent ? 'off' : failed ? 'partial' : 'sent'}&n=${sent}`);
}

export async function deleteMeetingAction(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => { await c.query(`delete from meeting_actions where id = $1`, [id]); });
  revalidatePath('/work');
}

/** Creates an invoice for one client and period. The lines are saved with it, so later edits don't change it. */
export async function createInvoice(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const clientId = String(formData.get('clientId') ?? '');
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!isUuid(clientId) || !isDateKey(from) || !isDateKey(to) || to < from) return;
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    const settings = await getSettings(c, user.id);
    const client = (await c.query<{ name: string }>(`select name from clients where id = $1 and workspace_id = $2`, [clientId, ws])).rows[0];
    if (!client) return;
    const entries = await c.query<{ project_id: string; project_name: string; client_name: string | null; hourly_rate_minor: number; start_min: number; end_min: number; billable: boolean }>(
      `select e.project_id, p.name as project_name, cl.name as client_name, p.hourly_rate_minor, e.start_min, e.end_min, e.billable
         from time_entries e join projects p on p.id = e.project_id left join clients cl on cl.id = p.client_id
        where e.workspace_id = $1 and p.client_id = $2 and e.billable and e.deleted_at is null
          and e.spent_on >= $3 and e.spent_on <= $4`, [ws, clientId, from, to]);
    const lines = reportLines(entries.rows);
    const total = lines.reduce((s, l) => s + l.amountMinor, 0);
    const year = new Date().getFullYear();
    const count = await c.query<{ n: number }>(`select count(*)::int as n from invoices where workspace_id = $1 and number like $2`, [ws, `INV-${year}-%`]);
    const number = `INV-${year}-${String(count.rows[0].n + 1).padStart(3, '0')}`;
    await c.query(
      `insert into invoices (id, workspace_id, number, client_id, client_name, period_start, period_end, currency, total_minor, lines)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [randomUUID(), ws, number, clientId, client.name, from, to, settings.currency, total, JSON.stringify(lines)]);
  });
  revalidatePath('/work');
}

/* ---------- Organisations ---------- */

const ROLES = ['owner', 'admin', 'member'] as const;
type OrgRole = (typeof ROLES)[number];

async function orgRoleOf(c: import('pg').PoolClient, orgId: string, userId: string): Promise<OrgRole | null> {
  const { rows } = await c.query<{ role: OrgRole }>(
    `select role from organisation_members where organisation_id = $1 and user_id = $2`, [orgId, userId]);
  return rows[0]?.role ?? null;
}

export async function createOrganisation(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  if (!(await withUser(user.id, async c => (await getSettings(c, user.id)).mode !== 'personal'))) return; // Team is for Work and Student
  const name = text(formData.get('name'), 120);
  if (!name) return;
  const orgId = await withUser(user.id, async c =>
    (await c.query<{ id: string }>(`select create_organisation($1, $2) as id`, [user.id, name])).rows[0].id);
  revalidatePath('/teams');
  redirect(`/teams?team=${orgId}&created=1`);
}

export async function inviteMember(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  if (!(await withUser(user.id, async c => (await getSettings(c, user.id)).mode !== 'personal'))) return; // Team is for Work and Student
  const orgId = String(formData.get('orgId') ?? '');
  const email = text(formData.get('email'), 254).toLowerCase();
  const role = String(formData.get('role') ?? 'member') as OrgRole;
  if (!isUuid(orgId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.includes(role)) return;
  const { newInviteToken, INVITE_DAYS, inviteUrl } = await import('@/lib/invite');
  const { token, hash } = newInviteToken();
  let link = '';
  let orgName = '';
  let inviter = user.name || user.email;
  await withUser(user.id, async c => {
    const mine = await orgRoleOf(c, orgId, user.id);
    if (!mine || mine === 'member') return;
    if (role === 'owner' && mine !== 'owner') return;
    await c.query(
      `insert into invitations (id, organisation_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval)`,
      [randomUUID(), orgId, email, role, hash, user.id, String(INVITE_DAYS)]);
    orgName = (await c.query<{ name: string }>(`select name from organisations where id = $1`, [orgId])).rows[0]?.name ?? 'your team';
    link = inviteUrl(token);
  });
  if (!link) return;
  const { sendMail } = await import('@/lib/mail');
  const result = await sendMail(email, `${inviter} invited you to ${orgName} on My Buddy`,
    `${inviter} invited you to join ${orgName} on My Buddy.\n\nOpen this link and log in with ${email} to accept:\n${link}\n\nThe link works once and expires in ${INVITE_DAYS} days.`);
  revalidatePath('/teams');
  if (result.sent) redirect(`/teams?team=${orgId}&sent=${encodeURIComponent(email)}`);
  redirect(`/teams?team=${orgId}&invited=${encodeURIComponent(link)}${result.error ? `&mailError=${encodeURIComponent(result.error)}` : ''}`);
}

export async function revokeInvite(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`delete from invitations where id = $1`, [id]);
  });
  revalidatePath('/teams');
}

export async function acceptInvitation(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const { hashToken } = await import('@/lib/invite');
  const token = String(formData.get('token') ?? '');
  if (!token) redirect('/teams');
  let orgId = '';
  try {
    orgId = await withUser(user.id, async c =>
      (await c.query<{ id: string }>(`select accept_invitation($1, $2) as id`, [user.id, hashToken(token)])).rows[0]?.id ?? '');
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^error: /i, '') : 'The invitation could not be accepted.';
    redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/teams');
  redirect(orgId ? `/teams?team=${orgId}` : '/teams');
}

/** Database errors raised by the team functions carry a message for people; anything else gets a generic one. */
function teamError(error: unknown) {
  const m = error instanceof Error ? error.message.replace(/^error: /i, '') : '';
  return /^[A-Z][^\n]{3,120}\.$/.test(m) ? m : 'That did not work. Please try again.';
}
async function teamCall(userId: string, orgId: string, sql: string, params: unknown[]): Promise<string | null> {
  try { await withUser(userId, async c => { await c.query(sql, params); }); return null; } catch (e) { return teamError(e); }
}
const teamUrl = (orgId: string, extra = '') => `/teams?team=${orgId}${extra}`;

/** Changes someone's role. Admins manage members and admins; only owners change owners or make owners. */
export async function changeMemberRole(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const orgId = String(formData.get('orgId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as OrgRole;
  if (!isUuid(orgId) || !userId || !ROLES.includes(role)) return;
  const error = await teamCall(user.id, orgId, `select set_org_member_role($1, $2, $3, $4)`, [user.id, orgId, userId, role]);
  revalidatePath('/teams');
  if (error) redirect(teamUrl(orgId, `&error=${encodeURIComponent(error)}`));
}

/** Removes someone from the team, including their access to its shared workspace. */
export async function removeMember(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const orgId = String(formData.get('orgId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  if (!isUuid(orgId) || !userId || userId === user.id) return;
  const error = await teamCall(user.id, orgId, `select remove_org_member($1, $2, $3)`, [user.id, orgId, userId]);
  revalidatePath('/teams');
  if (error) redirect(teamUrl(orgId, `&error=${encodeURIComponent(error)}`));
}

export async function renameTeam(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const orgId = String(formData.get('orgId') ?? '');
  const name = text(formData.get('name'), 120);
  if (!isUuid(orgId) || !name) return;
  const error = await teamCall(user.id, orgId, `select rename_organisation($1, $2, $3)`, [user.id, orgId, name]);
  revalidatePath('/teams'); revalidatePath('/work');
  redirect(teamUrl(orgId, error ? `&error=${encodeURIComponent(error)}` : ''));
}

/** Leaves a team. The last person to leave deletes it. A sole owner hands over ownership first. */
export async function leaveTeam(formData: FormData) {
  const user = await requireUser();
  const orgId = String(formData.get('orgId') ?? '');
  if (!isUuid(orgId)) return;
  let result = '';
  try {
    result = await withUser(user.id, async c => (await c.query<{ r: string }>(`select leave_organisation($1, $2) as r`, [user.id, orgId])).rows[0].r);
  } catch (e) {
    redirect(teamUrl(orgId, `&error=${encodeURIComponent(teamError(e))}`));
  }
  revalidatePath('/teams'); revalidatePath('/work');
  redirect(`/teams?${result === 'deleted' ? 'deleted' : 'left'}=1`);
}

/** Deletes a team and everything in its shared workspace. Owners only, after typing the team name. */
export async function deleteTeam(formData: FormData) {
  const user = await requireUser();
  const orgId = String(formData.get('orgId') ?? '');
  const confirm = text(formData.get('confirm'), 120);
  if (!isUuid(orgId)) return;
  const name = await withUser(user.id, async c => (await c.query<{ name: string }>(`select name from organisations where id = $1`, [orgId])).rows[0]?.name ?? '');
  if (!name || confirm.toLowerCase() !== name.toLowerCase()) redirect(teamUrl(orgId, `&error=${encodeURIComponent('Type the team name exactly to delete it.')}`));
  const error = await teamCall(user.id, orgId, `select delete_organisation($1, $2)`, [user.id, orgId]);
  if (error) redirect(teamUrl(orgId, `&error=${encodeURIComponent(error)}`));
  revalidatePath('/teams'); revalidatePath('/work');
  redirect('/teams?deleted=1');
}

/** Opens the Work page in a team's workspace. */
export async function workInTeam(formData: FormData) {
  const user = await requireUser();
  const orgId = String(formData.get('orgId') ?? '');
  if (!isUuid(orgId)) return;
  const ws = await withUser(user.id, async c => (await c.query<{ id: string }>(
    `select w.id from workspaces w join workspace_members m on m.workspace_id = w.id and m.user_id = $2 where w.organisation_id = $1`, [orgId, user.id])).rows[0]?.id);
  if (ws) (await cookies()).set(WORKSPACE_COOKIE, ws, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  redirect('/work');
}

async function weekIsApproved(c: import('pg').PoolClient, ws: string, userId: string, day: string) {
  const { rows } = await c.query(
    `select 1 from timesheets where workspace_id = $1 and user_id = $2 and week_start = $3 and status = 'approved'`,
    [ws, userId, weekStartOf(day)]);
  return rows.length > 0;
}

/* ---------- Workspace choice and timesheets ---------- */

export async function setActiveWorkspace(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const ws = String(formData.get('ws') ?? '');
  if (!isUuid(ws)) return;
  const allowed = await withUser(user.id, async c => {
    const { rows } = await c.query(`select 1 from workspace_members where workspace_id = $1 and user_id = $2`, [ws, user.id]);
    return rows.length > 0;
  });
  if (allowed) (await cookies()).set(WORKSPACE_COOKIE, ws, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  revalidatePath('/work');
}

/** Sends a week for approval. Only organisation workspaces have approvals. */
export async function submitTimesheet(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const weekStart = String(formData.get('weekStart') ?? '');
  if (!isDateKey(weekStart)) return;
  await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    const kind = (await c.query<{ kind: string }>(`select kind from workspaces where id = $1`, [ws])).rows[0]?.kind;
    if (kind !== 'organisation') return;
    await c.query(
      `insert into timesheets (workspace_id, user_id, week_start, status, submitted_at) values ($1, $2, $3, 'submitted', now())
       on conflict (workspace_id, user_id, week_start) do update set status = 'submitted', submitted_at = now(), decision_note = ''`,
      [ws, user.id, weekStart]);
  });
  revalidatePath('/work');
}

/** Approve or reject a submitted week. Only owners and admins of the organisation can do this. */
export async function decideTimesheet(formData: FormData) {
  const user = await requireUser();
  if (!(await withUser(user.id, async c => userHasPremium(c, user.id)))) return; // premium only
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const note = text(formData.get('note'), 300);
  if (!isUuid(id) || !['approved', 'rejected'].includes(decision)) return;
  await withUser(user.id, async c => {
    await c.query(
      `update timesheets set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1 and status = 'submitted'`,
      [id, decision, user.id, note]);
  });
  revalidatePath('/work');
}

/* ---------- Free trial ---------- */

/** Starts the 15-day premium trial. Once per account, and only for people on the free plan. */
export async function startFreeTrial() {
  const user = await requireUser();
  await withUser(user.id, async c => {
    await c.query(`select start_free_trial($1)`, [user.id]);
  });
  revalidatePath('/', 'layout');
}
