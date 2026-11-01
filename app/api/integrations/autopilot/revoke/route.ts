import { AUTOPILOT, TOKEN_RE, json, sha256 } from '@/lib/connected-apps';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Autopilot → Settings → Disconnect MyBuddy: turns the token off. */
export async function POST(req: Request) {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m || !TOKEN_RE.test(m[1])) return json({ error: 'invalid_token' }, 401);
  await pool.query(`select app_revoke_token($1, $2)`, [sha256(m[1]), AUTOPILOT]);
  return json({ ok: true });
}
