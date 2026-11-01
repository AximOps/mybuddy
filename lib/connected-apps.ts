import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from './db';

/**
 * Connected apps. Today only Autopilot by Opseros (timesheets in Teamwork), which reads a person's
 * work day after they approve it on /connect/autopilot.
 *
 * Environment:
 *   AUTOPILOT_REDIRECT_URI   where approvals return, e.g. https://autopilot.opseros.com/mybuddy.php
 *   AUTOPILOT_CLIENT_SECRET  shared secret (32+ characters) that Autopilot sends when it swaps a code
 * Without both, the connection is turned off.
 */
export const AUTOPILOT = 'autopilot';

export function autopilotConfig(): { redirect: string; secret: string } | null {
  const redirect = (process.env.AUTOPILOT_REDIRECT_URI ?? '').trim();
  const secret = (process.env.AUTOPILOT_CLIENT_SECRET ?? '').trim();
  return /^https?:\/\/\S+$/.test(redirect) && secret.length >= 32 ? { redirect, secret } : null;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A random secret with a recognisable prefix (codes: mbac_, tokens: mbat_). */
export const newSecret = (prefix: string) => prefix + randomBytes(32).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const TOKEN_RE = /^mbat_[A-Za-z0-9_-]{43}$/;
export const CODE_RE = /^mbac_[A-Za-z0-9_-]{43}$/;
export const STATE_RE = /^[A-Za-z0-9_-]{16,200}$/;

export interface AppUser { id: string; name: string; email: string }

/** The person an Autopilot request is for, from "Authorization: Bearer mbat_…"; null when not valid. */
export async function userFromBearer(req: Request): Promise<AppUser | null> {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m || !TOKEN_RE.test(m[1])) return null;
  const owner = (await pool.query<{ u: string | null }>(`select app_token_owner($1, $2) as u`, [sha256(m[1]), AUTOPILOT])).rows[0]?.u;
  if (!owner) return null;
  const u = (await pool.query<AppUser>(`select id, name, email from "user" where id = $1`, [owner])).rows[0];
  return u ?? null;
}

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });
