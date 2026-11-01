import { AUTOPILOT, CODE_RE, autopilotConfig, json, newSecret, safeEqual, sha256 } from '@/lib/connected-apps';
import { pool, withUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Autopilot swaps the one-time code for an access token (server to server).
 * Body (JSON): { code, client_secret, redirect_uri }. Reply: { access_token, user, organisations }.
 */
export async function POST(req: Request) {
  const cfg = autopilotConfig();
  if (!cfg) return json({ error: 'not_configured' }, 503);
  let b: { code?: unknown; client_secret?: unknown; redirect_uri?: unknown };
  try { b = await req.json(); } catch { return json({ error: 'invalid_request' }, 400); }
  if (typeof b.client_secret !== 'string' || !safeEqual(b.client_secret, cfg.secret)) return json({ error: 'invalid_client' }, 401);
  if (typeof b.code !== 'string' || !CODE_RE.test(b.code) || b.redirect_uri !== cfg.redirect) return json({ error: 'invalid_grant' }, 400);

  const token = newSecret('mbat_');
  const owner = (await pool.query<{ u: string | null }>(`select app_redeem_code($1, $2, $3, $4) as u`,
    [sha256(b.code), AUTOPILOT, cfg.redirect, sha256(token)])).rows[0]?.u;
  if (!owner) return json({ error: 'invalid_grant' }, 400);

  const user = (await pool.query<{ id: string; name: string; email: string }>(`select id, name, email from "user" where id = $1`, [owner])).rows[0];
  // Organisations the person belongs to (Autopilot can use these to decide who may sign in).
  const orgs = await withUser(owner, async c => (await c.query<{ id: string; name: string; role: string }>(
    `select o.id, o.name, m.role::text as role from organisation_members m join organisations o on o.id = m.organisation_id where m.user_id = $1`, [owner])).rows);
  return json({ access_token: token, token_type: 'Bearer', user, organisations: orgs });
}
