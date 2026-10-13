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
  redirect(`/notes/${id}`);
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
