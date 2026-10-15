import type { PoolClient } from 'pg';

/** True when the person is a platform admin. The database checks this again for every admin call. */
export async function isPlatformAdmin(c: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await c.query<{ a: boolean }>(`select is_platform_admin($1) as a`, [userId]);
  return rows[0]?.a === true;
}
