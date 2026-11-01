'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AUTOPILOT, CODE_RE, STATE_RE, autopilotConfig, newSecret, sha256 } from '@/lib/connected-apps';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { isUuid } from '@/lib/time';

/** "Allow": makes a one-time code (5 minutes) and sends the person back to Autopilot with it. */
export async function approveAutopilot(formData: FormData) {
  const cfg = autopilotConfig();
  const state = String(formData.get('state') ?? '');
  if (!cfg || !STATE_RE.test(state)) redirect('/settings#connected-apps');
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const code = newSecret('mbac_');
  if (!CODE_RE.test(code)) throw new Error('Could not make a code.');
  await withUser(user.id, async c => {
    await c.query(
      `insert into app_grant_codes (code_hash, user_id, client, redirect_uri, expires_at) values ($1, $2, $3, $4, now() + interval '5 minutes')`,
      [sha256(code), user.id, AUTOPILOT, cfg.redirect]);
  });
  redirect(`${cfg.redirect}${cfg.redirect.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
}

/** "Cancel": back to Autopilot without access. */
export async function denyAutopilot(formData: FormData) {
  const cfg = autopilotConfig();
  const state = String(formData.get('state') ?? '');
  if (!cfg || !STATE_RE.test(state)) redirect('/today');
  redirect(`${cfg.redirect}${cfg.redirect.includes('?') ? '&' : '?'}error=access_denied&state=${encodeURIComponent(state)}`);
}

/** Settings → Connected apps → Disconnect. */
export async function disconnectApp(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const user = await getCurrentUser();
  if (!user || !isUuid(id)) return;
  await withUser(user.id, async c => {
    const r = await c.query<{ client: string }>(
      `update app_grants set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning client`, [id, user.id]);
    // Disconnecting Autopilot also removes the Teamwork task list and hours it sent.
    if (r.rows[0]?.client === AUTOPILOT) {
      const still = (await c.query(`select 1 from app_grants where user_id = $1 and client = $2 and revoked_at is null`, [user.id, AUTOPILOT])).rowCount;
      if (!still) {
        await c.query(`delete from timesheet_catalog where user_id = $1`, [user.id]);
        await c.query(`delete from timesheet_days where user_id = $1`, [user.id]);
      }
    }
  });
  revalidatePath('/settings');
}
