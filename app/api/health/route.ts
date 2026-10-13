import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Diagnostics for deployment. Reports which settings are present and whether the database
 * answers. Never returns secret values. Open /api/health after each deploy.
 */
export async function GET() {
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: (process.env.BETTER_AUTH_SECRET ?? '').length >= 32,
    BETTER_AUTH_URL: !!process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    APPLE_CLIENT_ID: !!process.env.APPLE_CLIENT_ID,
  };

  let database: { ok: boolean; error?: string; schemaReady?: boolean } = { ok: false };
  try {
    const ping = await pool.query<{ tables: number }>(
      `select count(*)::int as tables from information_schema.tables
        where table_schema = 'public' and table_name in ('user', 'workspaces', 'routines', 'notes')`);
    database = { ok: true, schemaReady: ping.rows[0].tables === 4 };
  } catch (error) {
    database = { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown error' };
  }

  const healthy = Object.values(env).every(Boolean) && database.ok && database.schemaReady === true;
  return Response.json({ healthy, env, database }, { status: healthy ? 200 : 503 });
}
