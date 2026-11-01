import { json, userFromBearer } from '@/lib/connected-apps';
import { withUser } from '@/lib/db';
import { isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Autopilot reports which My Buddy time entries it has logged to Teamwork, so they show
 * "In timesheet" and are not offered again. POST {entries:[{id, logId}]} (logId = Teamwork time log id).
 * {unlog:[logId]} clears the mark again when that Teamwork time log was deleted.
 */
export async function POST(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return json({ error: 'invalid_token' }, 401);
  let body: { entries?: unknown; unlog?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const marks = (Array.isArray(body.entries) ? body.entries : []).slice(0, 300).flatMap((e: { id?: unknown; logId?: unknown }) => {
    const logId = Number(e?.logId);
    return isUuid(e?.id) ? [{ id: e.id as string, logId: Number.isSafeInteger(logId) && logId > 0 ? logId : null }] : [];
  });
  const unlog = (Array.isArray(body.unlog) ? body.unlog : []).slice(0, 300).map(Number).filter(x => Number.isSafeInteger(x) && x > 0);
  const n = await withUser(user.id, async c => {
    let count = 0;
    for (const m of marks) {
      count += (await c.query(`update time_entries set tw_logged_at = now(), tw_log_id = $3 where id = $1 and user_id = $2 and deleted_at is null`, [m.id, user.id, m.logId])).rowCount ?? 0;
    }
    if (unlog.length) count += (await c.query(`update time_entries set tw_logged_at = null, tw_log_id = null where tw_log_id = any($1::bigint[]) and user_id = $2`, [unlog, user.id])).rowCount ?? 0;
    return count;
  });
  return json({ ok: true, updated: n });
}
