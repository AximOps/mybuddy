import { json, userFromBearer } from '@/lib/connected-apps';
import { withUser } from '@/lib/db';
import { parseCatalog } from '@/lib/timesheet';

export const dynamic = 'force-dynamic';

/**
 * Autopilot sends the Teamwork projects and tasks this person logs time to, so My Buddy can offer
 * them on time entries, the timer and planned work blocks.
 * POST {projects:[{id, name, tasks:[{id, name, tasklist}]}], targetMinutes?, site?} — replaces the list.
 */
export async function POST(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return json({ error: 'invalid_token' }, 401);
  const raw = await req.text();
  if (raw.length > 1_500_000) return json({ error: 'too_large' }, 413);
  let body: { projects?: unknown; targetMinutes?: unknown; site?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  const projects = parseCatalog(body.projects);
  if (!projects) return json({ error: 'projects must be a list' }, 400);
  const t = Number(body.targetMinutes);
  const target = Number.isInteger(t) && t >= 0 && t <= 1440 ? t : null;
  const site = typeof body.site === 'string' && /^https:\/\/[^\s/]+$/.test(body.site.trim()) ? body.site.trim().slice(0, 200) : null;
  await withUser(user.id, async c => {
    await c.query(
      `insert into timesheet_catalog (user_id, projects, target_minutes, site, updated_at) values ($1, $2, $3, $4, now())
       on conflict (user_id) do update set projects = excluded.projects, target_minutes = excluded.target_minutes, site = excluded.site, updated_at = now()`,
      [user.id, JSON.stringify(projects), target, site]);
  });
  return json({ ok: true, projects: projects.length, tasks: projects.reduce((a, p) => a + p.tasks.length, 0) });
}

/** "Remove from MyBuddy" in Autopilot: deletes the task list. Time entries keep their Teamwork task. */
export async function DELETE(req: Request) {
  const user = await userFromBearer(req);
  if (!user) return json({ error: 'invalid_token' }, 401);
  await withUser(user.id, async c => { await c.query(`delete from timesheet_catalog where user_id = $1`, [user.id]); });
  return json({ ok: true });
}
