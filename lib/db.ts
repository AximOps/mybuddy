import { Pool, type PoolClient } from 'pg';

const globalForPg = globalThis as unknown as { pool?: Pool };

/** One pool per server process. The connection string comes from DATABASE_URL. */
export const pool: Pool = globalForPg.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
if (process.env.NODE_ENV !== 'production') globalForPg.pool = pool;

/**
 * Runs fn in one transaction as the given user. The user id is set with set_config, so the
 * row-level security policies in the database only show that user's workspaces.
 * Every query that touches workspace data must go through this function.
 */
export async function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
