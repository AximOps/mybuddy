import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { applyChange, fetchRows, isBad, pullTable, SPEC, SPECS, type Change, type Cursor, type PulledRow } from '@/lib/sync';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_CHANGES = 500;
const PAGE = 500;
/** Rows returned in one response across all tables. */
const BUDGET = 2000;
/** A cursor time as Postgres writes it ("2026-10-17 09:22:07.40599+00") or ISO. */
const TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

interface Body {
  /** Per table: where the phone's last pull stopped. Missing = from the start. */
  cursors?: Record<string, Cursor | null>;
  /** The phone's changes, oldest first. */
  changes?: Change[];
  /** Tables to pull. Missing = all. */
  tables?: string[];
  /** Rows the phone could not save last time: sent again in "current". */
  refetch?: Record<string, string[]>;
  /** The phone's clock (ms) when it sent the request. */
  clientNow?: number;
}

/**
 * Two-way sync for the phone app.
 * 1. Saves the phone's changes (each one only if it is newer than the server copy).
 * 2. Returns what changed on the server since the phone's cursors, in pages ("more" = call again).
 * The phone sends its token as a bearer token. Only the personal workspace syncs.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Not signed in.' }, { status: 401, headers: NO_STORE });
  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Bad request.' }, { status: 400, headers: NO_STORE }); }
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES) return Response.json({ error: `Send at most ${MAX_CHANGES} changes at a time.` }, { status: 413, headers: NO_STORE });

  // Parents first, so a new event can refer to a new routine sent in the same request.
  const order = new Map(SPECS.map((s, i) => [s.name, i]));
  const sorted = changes.map((ch, i) => ({ ch, i })).sort((a, b) =>
    (order.get(a.ch?.table) ?? 99) - (order.get(b.ch?.table) ?? 99) || a.i - b.i);

  let result;
  try {
  result = await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    // Phone clock vs server clock; ignored when absurd (more than a day).
    const skew = Number.isFinite(Number(body.clientNow)) ? Date.now() - Number(body.clientNow) : 0;
    const ctx = { c, ws, userId: user.id, skew: Math.abs(skew) < 86_400_000 ? skew : 0 };
    const applied: number[] = [];
    const rejected: { i: number; reason: string; retry?: boolean }[] = [];
    const staleKeys = new Map<string, string[]>();

    for (const { ch, i } of sorted) {
      // A savepoint per change: one bad row does not undo the others.
      await c.query('savepoint ch');
      try {
        if (!ch || typeof ch !== 'object' || !SPEC.has(ch.table)) throw new Error('unknown table');
        const r = await applyChange(ctx, ch);
        await c.query('release savepoint ch');
        if (r === 'stale') { const list = staleKeys.get(ch.table) ?? []; list.push(String(ch.key)); staleKeys.set(ch.table, list); }
        applied.push(i);
      } catch (e) {
        await c.query('rollback to savepoint ch');
        const code = (e as { code?: string }).code;
        const reason = isBad(e) ? e.message : code === '23503' ? 'refers to something that is missing'
          : code === '23514' || code === '22001' || code === '22003' ? 'a value is out of range' : 'could not be saved';
        // Worth trying again later: a missing parent (may arrive in a later batch) or a temporary server error.
        const retry = isBad(e) ? e.retry : !(code === '23514' || code === '22001' || code === '22003' || code === '23502' || code === '22P02');
        if (!isBad(e) && !code) console.error('sync change failed', e);
        rejected.push({ i, reason, retry });
      }
    }

    // Changes that lost to a newer server copy: send that copy back, so the phone matches.
    const current: Record<string, PulledRow[]> = {};
    for (const [table, keys] of Object.entries(body.refetch ?? {})) {
      if (!SPEC.has(table) || !Array.isArray(keys)) continue;
      const list = staleKeys.get(table) ?? [];
      list.push(...keys.slice(0, 200).map(String));
      staleKeys.set(table, list);
    }
    for (const [table, keys] of staleKeys) current[table] = await fetchRows(ctx, SPEC.get(table)!, keys);

    // Pull.
    const wanted = Array.isArray(body.tables) ? SPECS.filter(s => body.tables!.includes(s.name)) : SPECS;
    const pulled: Record<string, PulledRow[]> = {};
    const cursors: Record<string, Cursor | null> = {};
    /** Per table, when its last page was reached: the cursor to keep for the next sync (a little earlier). */
    const settled: Record<string, Cursor> = {};
    let more = false;
    let budget = BUDGET;
    for (const spec of wanted) {
      const from = body.cursors?.[spec.name] ?? null;
      const valid = from && typeof from.t === 'string' && TIME.test(from.t) ? { t: from.t, id: String(from.id ?? '') } : null;
      if (budget <= 0) { cursors[spec.name] = valid; more = true; continue; }
      const page = await pullTable(ctx, spec, valid, Math.min(PAGE, budget));
      budget -= page.rows.length;
      if (page.rows.length) pulled[spec.name] = page.rows;
      cursors[spec.name] = page.next;
      if (page.settled) settled[spec.name] = page.settled;
      if (page.more) more = true;
    }

    const reset = await c.query<{ data_reset_at: Date | null }>(`select data_reset_at from user_settings where user_id = $1`, [user.id]);
    return {
      applied, rejected, current, pulled, cursors, settled, more,
      dataResetAt: reset.rows[0]?.data_reset_at?.getTime() ?? null,
      serverNow: Date.now(),
      userId: user.id,
    };
  });
  } catch (e) {
    const code = (e as { code?: string }).code;
    // Missing column or table: the sync migration (0021_sync.sql) has not been run on this database.
    if (code === '42703' || code === '42P01' || code === '42883') {
      console.error('sync: database is missing the sync migration', e);
      return Response.json({ error: 'The Amiroon server needs a database update before it can sync (migration 0021_sync.sql). Please try again later.' }, { status: 503, headers: NO_STORE });
    }
    console.error('sync failed', e);
    return Response.json({ error: 'The Amiroon server could not sync right now. Please try again later.' }, { status: 500, headers: NO_STORE });
  }
  return Response.json(result, { headers: NO_STORE });
}
