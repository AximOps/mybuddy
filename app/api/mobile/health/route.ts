import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Lets the phone app check that an address is an Amiroon website, and whether sync is ready
 * (the sync migration has run). No personal data.
 */
export async function GET() {
  let sync = false;
  try {
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = 'tasks' and column_name = 'changed_at'`);
    sync = (rows[0]?.n ?? 0) > 0;
  } catch { /* database unavailable */ }
  return Response.json({ app: 'amiroon', api: 1, sync }, { headers: { 'Cache-Control': 'no-store' } });
}
