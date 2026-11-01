import type { PoolClient } from 'pg';
import { AUTOPILOT } from './connected-apps';

/**
 * Timesheet link with Autopilot by Opseros. Autopilot sends the Teamwork projects and tasks a person
 * can log time to (the catalog) and how much they logged each day. My Buddy stores a Teamwork task on
 * each time entry, so Autopilot fills the timesheet without asking. Everything here is only shown to
 * people who have connected Autopilot (Settings → Connected apps).
 */

export interface TwTask { id: number; name: string; tasklist: string }
export interface TwProject { id: number; name: string; tasks: TwTask[] }
export interface TwCatalog { projects: TwProject[]; targetMinutes: number | null; site: string | null; updatedAt: Date }
export interface TwPick { taskId: number; task: string; tasklist: string; projectId: number; project: string }

const MAX_PROJECTS = 60, MAX_TASKS = 600;
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const posInt = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

/** True when the person has a live Autopilot connection. */
export async function autopilotLinked(c: PoolClient, userId: string): Promise<boolean> {
  return (await c.query<{ x: boolean }>(
    `select exists (select 1 from app_grants where user_id = $1 and client = $2 and revoked_at is null) as x`, [userId, AUTOPILOT])).rows[0].x;
}

export async function loadCatalog(c: PoolClient, userId: string): Promise<TwCatalog | null> {
  const r = (await c.query<{ projects: TwProject[]; target_minutes: number | null; site: string | null; updated_at: Date }>(
    `select projects, target_minutes, site, updated_at from timesheet_catalog where user_id = $1`, [userId])).rows[0];
  return r ? { projects: r.projects ?? [], targetMinutes: r.target_minutes, site: r.site, updatedAt: r.updated_at } : null;
}

/** Cleans a catalog sent by Autopilot. Returns null when it is not usable. */
export function parseCatalog(input: unknown): TwProject[] | null {
  if (!Array.isArray(input)) return null;
  const out: TwProject[] = [];
  const seenP = new Set<number>();
  for (const p of input.slice(0, MAX_PROJECTS)) {
    const id = posInt(p?.id), name = str(p?.name, 200);
    if (!id || !name || seenP.has(id)) continue;
    seenP.add(id);
    const seenT = new Set<number>();
    const tasks: TwTask[] = [];
    for (const t of Array.isArray(p.tasks) ? p.tasks.slice(0, MAX_TASKS) : []) {
      const tid = posInt(t?.id), tname = str(t?.name, 200);
      if (!tid || !tname || seenT.has(tid)) continue;
      seenT.add(tid);
      tasks.push({ id: tid, name: tname, tasklist: str(t?.tasklist, 200) });
    }
    out.push({ id, name, tasks });
  }
  return out;
}

/** The task with this id in the catalog, with its project. */
export function findTask(cat: TwCatalog | null, taskId: number | null): TwPick | null {
  if (!cat || !taskId) return null;
  for (const p of cat.projects) {
    const t = p.tasks.find(x => x.id === taskId);
    if (t) return { taskId: t.id, task: t.name, tasklist: t.tasklist, projectId: p.id, project: p.name };
  }
  return null;
}

/**
 * The Teamwork task chosen in a form (field twTaskId), checked against the person's catalog.
 * When the My Buddy project has no Teamwork project yet, it is linked to this task's project,
 * so the next entry for it starts with the right list.
 */
export async function pickFromForm(c: PoolClient, userId: string, projectId: string, raw: FormDataEntryValue | null): Promise<TwPick | null> {
  const id = posInt(String(raw ?? ''));
  if (!id) return null;
  const pick = findTask(await loadCatalog(c, userId), id);
  if (!pick) return null;
  await c.query(`update projects set tw_project_id = $2, tw_project = $3 where id = $1 and tw_project_id is null`, [projectId, pick.projectId, pick.project]);
  return pick;
}

/** Where people open Autopilot (from AUTOPILOT_REDIRECT_URI), or null. */
export function autopilotHome(): string | null {
  try { return new URL(process.env.AUTOPILOT_REDIRECT_URI ?? '').origin; } catch { return null; }
}
