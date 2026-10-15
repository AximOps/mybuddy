import { headers } from 'next/headers';
import { auth } from './auth';
import { pool } from './db';

/** The signed-in user on the server, or null. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const { rows } = await pool.query<{ s: boolean }>(`select is_user_suspended($1) as s`, [session.user.id]);
  return rows[0]?.s ? null : session.user;
}
