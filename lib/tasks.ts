import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { shiftDateKey, weekdayOf } from './time';

export const REPEATS = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
] as const;
export type Repeat = typeof REPEATS[number]['id'];
export const isRepeat = (v: unknown): v is Repeat => REPEATS.some(r => r.id === v);
export const repeatLabel = (r: string) => ({ daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' } as Record<string, string>)[r] ?? '';

/** The next due date after `day` for a repeat rule. Monthly keeps the day of the month, or the month's last day. */
export function nextDue(day: string, repeat: Repeat): string {
  if (repeat === 'daily') return shiftDateKey(day, 1);
  if (repeat === 'weekly') return shiftDateKey(day, 7);
  if (repeat === 'weekdays') {
    let d = shiftDateKey(day, 1);
    while (weekdayOf(d) === 0 || weekdayOf(d) === 6) d = shiftDateKey(d, 1);
    return d;
  }
  if (repeat === 'monthly') {
    const [y, m, dd] = day.split('-').map(Number);
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
  }
  return day;
}

/**
 * Ticks a task off or reopens it. Ticking off a repeating task creates the next one
 * (on the first matching date from today on) and moves the repeat rule onto it.
 */
export async function setTaskDoneIn(c: PoolClient, id: string, done: boolean, today: string): Promise<void> {
  const row = (await c.query<{ id: string; workspace_id: string; title: string; due_date: string | null; due_time: number | null; tag: string; repeat: Repeat; assignee_id: string | null; created_by: string | null; done: boolean }>(
    `select id, workspace_id, title, due_date::text as due_date, due_time, tag, repeat, assignee_id, created_by, done from tasks where id = $1 and deleted_at is null`, [id])).rows[0];
  if (!row) return;
  await c.query(`update tasks set done = $2, completed_at = case when $2 then now() else null end where id = $1`, [id, done]);
  if (done && !row.done && row.repeat !== 'none') {
    let next = nextDue(row.due_date ?? today, row.repeat);
    while (next < today) next = nextDue(next, row.repeat);
    await c.query(
      `insert into tasks (id, workspace_id, title, due_date, due_time, tag, repeat, assignee_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), row.workspace_id, row.title, next, row.due_time, row.tag, row.repeat, row.assignee_id, row.created_by]);
    await c.query(`update tasks set repeat = 'none' where id = $1`, [id]);
  }
}
