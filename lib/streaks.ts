import type { PoolClient } from 'pg';
import { shiftDateKey, weekdayOf } from './time';

export interface ActivityStreak { eventId: string; title: string; emoji: string; streak: number; best: number }

/**
 * Current streak per routine activity: how many of its scheduled days in a row it was ticked off,
 * counting back from `day`. A day that is still running (today, not yet ticked) does not break it.
 * Looks back 180 days. The weekdays come from the routine's current schedule.
 */
export async function activityStreaks(c: PoolClient, ws: string, userId: string, day: string, onlyIds?: string[]): Promise<Map<string, ActivityStreak>> {
  const events = (await c.query<{ id: string; title: string; emoji: string; routine_id: string }>(
    `select id, title, emoji, routine_id from events where workspace_id = $1 and deleted_at is null ${onlyIds ? 'and id = any($2)' : ''}`,
    onlyIds ? [ws, onlyIds] : [ws])).rows;
  const out = new Map<string, ActivityStreak>();
  if (!events.length) return out;
  const days = (await c.query<{ routine_id: string; weekday: number }>(
    `select routine_id, weekday from routine_days where workspace_id = $1 and deleted_at is null`, [ws])).rows;
  const from = shiftDateKey(day, -180);
  const done = (await c.query<{ event_id: string; day: string }>(
    `select event_id, day::text as day from completions
      where user_id = $1 and deleted_at is null and day between $2 and $3 and event_id = any($4)`,
    [userId, from, day, events.map(e => e.id)])).rows;
  const doneSet = new Set(done.map(d => `${d.event_id}|${d.day}`));

  for (const e of events) {
    const weekdays = new Set(days.filter(d => d.routine_id === e.routine_id).map(d => d.weekday));
    if (!weekdays.size) continue;
    let streak = 0, best = 0, run = 0, current = true;
    for (let i = 0; i <= 180; i++) {
      const d = shiftDateKey(day, -i);
      if (!weekdays.has(weekdayOf(d))) continue;
      const hit = doneSet.has(`${e.id}|${d}`);
      if (hit) { run++; if (current) streak++; }
      else if (i === 0) { /* today is not over yet */ }
      else { current = false; best = Math.max(best, run); run = 0; }
    }
    best = Math.max(best, run, streak);
    out.set(e.id, { eventId: e.id, title: e.title, emoji: e.emoji, streak, best });
  }
  return out;
}
