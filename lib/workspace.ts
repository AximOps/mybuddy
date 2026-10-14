import { cookies } from 'next/headers';
import type { PoolClient } from 'pg';
import { personalWorkspaceId } from './planner';
import { isUuid, shiftDateKey, weekdayOf } from './time';

export const WORKSPACE_COOKIE = 'ws';

/**
 * The workspace the person is working in: the one chosen in the Work page (personal or an
 * organisation they belong to), or their personal workspace by default.
 */
export async function activeWorkspaceId(c: PoolClient, userId: string): Promise<string> {
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (isUuid(chosen)) {
    const { rows } = await c.query<{ id: string }>(
      `select workspace_id as id from workspace_members where workspace_id = $1 and user_id = $2`, [chosen, userId]);
    if (rows[0]) return rows[0].id;
  }
  return personalWorkspaceId(c, userId);
}

/** Monday of the week containing a date key. */
export function weekStartOf(day: string): string {
  return shiftDateKey(day, -((weekdayOf(day) + 6) % 7));
}
