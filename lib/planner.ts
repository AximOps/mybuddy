import type { PoolClient } from 'pg';

/** The signed-in person's personal workspace. Every account has exactly one. */
export async function personalWorkspaceId(c: PoolClient, userId: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `select id from workspaces where kind = 'personal' and owner_id = $1`, [userId]);
  if (!rows[0]) throw new Error('No personal workspace was found for this account.');
  return rows[0].id;
}

export interface PlannerEvent {
  id: string; title: string; emoji: string; startMin: number; endMin: number; category: string; done: boolean;
}

/** The routine for a weekday, its events, and which of them are checked off on the given day. */
export async function routineForDay(c: PoolClient, ws: string, userId: string, weekday: number, day: string) {
  const routine = await c.query<{ id: string; name: string }>(
    `select r.id, r.name
       from routine_days d join routines r on r.id = d.routine_id
      where d.workspace_id = $1 and d.weekday = $2 and d.deleted_at is null and r.deleted_at is null`,
    [ws, weekday]);
  if (!routine.rows[0]) return { routineId: null, routineName: null, events: [] as PlannerEvent[] };

  const events = await c.query<{ id: string; title: string; emoji: string; start_min: number; end_min: number; category: string }>(
    `select id, title, emoji, start_min, end_min, category
       from events where routine_id = $1 and deleted_at is null order by start_min`,
    [routine.rows[0].id]);
  const done = await c.query<{ event_id: string }>(
    `select event_id from completions where user_id = $1 and day = $2 and deleted_at is null`, [userId, day]);
  const doneSet = new Set(done.rows.map(r => r.event_id));

  return {
    routineId: routine.rows[0].id,
    routineName: routine.rows[0].name,
    events: events.rows.map(e => ({
      id: e.id, title: e.title, emoji: e.emoji, startMin: e.start_min, endMin: e.end_min, category: e.category, done: doneSet.has(e.id),
    })),
  };
}

export interface PlannerTask {
  id: string; title: string; dueDate: string | null; dueTime: number | null; tag: string; done: boolean;
}

export async function listTasks(c: PoolClient, ws: string): Promise<PlannerTask[]> {
  const { rows } = await c.query<{ id: string; title: string; due_date: string | null; due_time: number | null; tag: string; done: boolean }>(
    `select id, title, due_date::text as due_date, due_time, tag, done
       from tasks where workspace_id = $1 and deleted_at is null
      order by done asc, due_date asc nulls last, due_time asc nulls last, updated_at desc`,
    [ws]);
  return rows.map(r => ({ id: r.id, title: r.title, dueDate: r.due_date, dueTime: r.due_time, tag: r.tag, done: r.done }));
}

export interface PlannerNote {
  id: string; title: string; body: string; tag: string; pinned: boolean; updatedAt: string;
}

export async function listNotes(c: PoolClient, ws: string, q: string): Promise<PlannerNote[]> {
  const pattern = `%${q.replace(/[%_]/g, s => `\\${s}`)}%`;
  const { rows } = await c.query<{ id: string; title: string; body: string; tag: string; pinned: boolean; updated_at: Date }>(
    `select id, title, body, tag, pinned, updated_at
       from notes
      where workspace_id = $1 and deleted_at is null
        and ($2 = '' or title ilike $3 or body ilike $3)
      order by pinned desc, updated_at desc`,
    [ws, q, pattern]);
  return rows.map(r => ({ id: r.id, title: r.title, body: r.body, tag: r.tag, pinned: r.pinned, updatedAt: r.updated_at.toISOString() }));
}

export async function getNote(c: PoolClient, ws: string, id: string): Promise<PlannerNote | null> {
  const { rows } = await c.query<{ id: string; title: string; body: string; tag: string; pinned: boolean; updated_at: Date }>(
    `select id, title, body, tag, pinned, updated_at from notes where workspace_id = $1 and id = $2 and deleted_at is null`, [ws, id]);
  const r = rows[0];
  return r ? { id: r.id, title: r.title, body: r.body, tag: r.tag, pinned: r.pinned, updatedAt: r.updated_at.toISOString() } : null;
}

export const TAGS = ['Personal', 'Work', 'Ideas', 'Health'] as const;
