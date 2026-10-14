'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { resolveTag } from '@/lib/tags';
import { parseMoney, zonedToUtc } from '@/lib/time';
import { cookies } from 'next/headers';
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
  if (!title) return;

  await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const tag = await resolveTag(c, user.id, 'task', text(formData.get('tag'), 20), text(formData.get('newTag'), 20), 'Personal');
    await c.query(
      `insert into tasks (id, workspace_id, title, due_date, due_time, tag, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), ws, title, dueDate, dueTime, tag, user.id]);
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
  if (!['student', 'personal'].includes(mode)) return; // work arrives in a later phase
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

/** Removes all routines, activities, tasks, notes, spending and focus history, then restores the defaults. */
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
    await c.query(`select seed_default_routines($1, $2)`, [ws, user.id]);
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
  const id = String(formData.get('id') ?? '');
  if (!isUuid(id)) return;
  await withUser(user.id, async c => {
    await c.query(`update deadlines set deleted_at = now() where id = $1`, [id]);
  });
  revalidatePath('/student');
  revalidatePath('/today');
}
