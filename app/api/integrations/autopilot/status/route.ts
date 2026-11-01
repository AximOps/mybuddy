import { json, userFromBearer } from '@/lib/connected-apps';
import { withUser } from '@/lib/db';
import { isDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Autopilot sends how much time is logged in Teamwork per day, for the Timesheet card on Today.
 * POST {days:[{date, minutes, entries}], targetMinutes?} — up to 62 days.
 */
export async function POST(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return json({ error: 'invalid_token' }, 401);
  let body: { days?: unknown; targetMinutes?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!Array.isArray(body.days)) return json({ error: 'days must be a list' }, 400);
  const t = Number(body.targetMinutes);
  const target = Number.isInteger(t) && t >= 0 && t <= 1440 ? t : null;
  const days = body.days.slice(0, 62).flatMap((d: { date?: unknown; minutes?: unknown; entries?: unknown }) => {
    const m = Math.round(Number(d?.minutes)), n = Math.round(Number(d?.entries ?? 0));
    return isDateKey(d?.date) && Number.isFinite(m) && m >= 0 && m <= 2880 ? [{ date: d.date, minutes: m, entries: Number.isFinite(n) ? Math.min(500, Math.max(0, n)) : 0 }] : [];
  });
  await withUser(user.id, async c => {
    for (const d of days) {
      await c.query(
        `insert into timesheet_days (user_id, day, logged_minutes, entries, target_minutes, updated_at) values ($1, $2, $3, $4, $5, now())
         on conflict (user_id, day) do update set logged_minutes = excluded.logged_minutes, entries = excluded.entries, target_minutes = excluded.target_minutes, updated_at = now()`,
        [user.id, d.date, d.minutes, d.entries, target]);
    }
  });
  return json({ ok: true, days: days.length });
}
