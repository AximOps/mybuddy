'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { isDateKey, isUuid, parseHM, weekdayOf } from '@/lib/time';

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
    if (!routine.rows[0]) return;
    await c.query(
      `insert into events (id, workspace_id, routine_id, title, emoji, start_min, end_min, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), ws, routine.rows[0].routine_id, title, emoji, start, end, user.id]);
  });
  revalidatePath('/today');
}

/* ---------- Tasks ---------- */

export async function addTask(formData: FormData) {
  const user = await requireUser();
  const title = text(formData.get('title'), 120);
  const dueRaw = String(formData.get('dueDate') ?? '');
  const dueDate = isDateKey(dueRaw) ? dueRaw : null;
  const dueTime = dueDate ? parseHM(formData.get('dueTime')) : null;
  const tag = text(formData.get('tag'), 20) || 'Personal';
  if (!title) return;

  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(
      `insert into tasks (id, workspace_id, title, due_date, due_time, tag, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), ws, title, dueDate, dueTime, tag, user.id]);
  });
  revalidatePath('/tasks');
}

export async function setTaskDone(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const done = formData.get('done') === 'true';
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(
      `update tasks set done = $2, completed_at = case when $2 then now() else null end where id = $1`,
      [id, done]);
  });
  revalidatePath('/tasks');
  revalidatePath('/today');
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

/* ---------- Notes ---------- */

export async function createNote(formData: FormData) {
  const user = await requireUser();
  const title = text(formData.get('title'), 200);
  const body = String(formData.get('body') ?? '').slice(0, 20000);
  const tag = text(formData.get('tag'), 20) || 'Personal';
  const pinned = formData.get('pinned') === 'on';
  const id = randomUUID();

  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    await c.query(
      `insert into notes (id, workspace_id, title, body, tag, pinned, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ws, title, body, tag, pinned, user.id]);
  });
  revalidatePath('/notes');
  redirect(`/notes?id=${id}`);
}

export async function updateNote(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  const title = text(formData.get('title'), 200);
  const body = String(formData.get('body') ?? '').slice(0, 20000);
  const tag = text(formData.get('tag'), 20) || 'Personal';
  const pinned = formData.get('pinned') === 'on';

  await withUser(user.id, async c => {
    await c.query(
      `update notes set title = $2, body = $3, tag = $4, pinned = $5 where id = $1`,
      [id, title, body, tag, pinned]);
  });
  revalidatePath('/notes');
  revalidatePath(`/notes/${id}`);
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
export async function recordFocusSession(formData: FormData) {
  const user = await requireUser();
  const title = text(formData.get('title'), 60);
  const minutes = Number(formData.get('minutes'));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) return;
  await withUser(user.id, async c => {
    const ws = await workspaceFor(c, user.id);
    await c.query(
      `insert into focus_sessions (id, workspace_id, user_id, title, minutes) values ($1, $2, $3, $4, $5)`,
      [randomUUID(), ws, user.id, title, minutes]);
  });
  revalidatePath('/stats');
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
