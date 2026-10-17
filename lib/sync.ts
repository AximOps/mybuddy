import type { PoolClient } from 'pg';

/*
 * Two-way sync with the My Buddy phone app (personal workspace only).
 *
 * The phone sends the rows it changed (or deleted) with the time of each change. The server saves a
 * change only when it is at least as new as the server's copy ("last change wins"), and only for rows
 * in the person's own workspace. Then it returns everything that changed since the phone's cursor for
 * each table, in pages. Rows travel in the phone's column names; the specs below map them.
 */

type Kind = 'text' | 'int' | 'num' | 'bool' | 'date' | 'ms' | 'uuid';
/** [phone column, server column, type, nullable] */
type Col = [string, string, Kind, boolean?];

export interface TableSpec {
  /** Phone table name (also the name used in requests). */
  name: string;
  /** Server table. */
  table: string;
  /** How rows are identified. */
  key: 'id' | 'weekday' | 'completion';
  cols: Col[];
  /** Server table has user_id (set to the signed-in person). Pulls are limited to their rows. */
  user?: boolean;
  /** Server table has created_by (set on insert). */
  createdBy?: boolean;
  /** Child rows that travel inside the parent row. */
  child?: 'items' | 'actions';
}

/** Order matters: parents before children, so foreign keys hold when rows are saved. */
export const SPECS: TableSpec[] = [
  { name: 'routines', table: 'routines', key: 'id', createdBy: true, cols: [['name', 'name', 'text'], ['color', 'color', 'text'], ['sort_order', 'sort_order', 'int']] },
  { name: 'routine_days', table: 'routine_days', key: 'weekday', cols: [['routine_id', 'routine_id', 'uuid']] },
  { name: 'events', table: 'events', key: 'id', createdBy: true, cols: [
    ['routine_id', 'routine_id', 'uuid'], ['title', 'title', 'text'], ['emoji', 'emoji', 'text'], ['start_min', 'start_min', 'int'],
    ['end_min', 'end_min', 'int'], ['category', 'category', 'text'], ['remind_min', 'remind_min', 'int']] },
  { name: 'completions', table: 'completions', key: 'completion', user: true, cols: [['completed_at', 'completed_at', 'ms']] },
  { name: 'subjects', table: 'subjects', key: 'id', createdBy: true, cols: [
    ['name', 'name', 'text'], ['credits', 'credits', 'num'], ['grade_point', 'grade_point', 'num', true], ['created_at', 'created_at', 'ms']] },
  { name: 'classes', table: 'classes', key: 'id', cols: [
    ['subject_id', 'subject_id', 'uuid', true], ['title', 'title', 'text'], ['kind', 'kind', 'text'], ['weekday', 'weekday', 'int'],
    ['start_min', 'start_min', 'int'], ['end_min', 'end_min', 'int'], ['room', 'room', 'text']] },
  { name: 'deadlines', table: 'deadlines', key: 'id', createdBy: true, cols: [
    ['title', 'title', 'text'], ['kind', 'kind', 'text'], ['subject_id', 'subject_id', 'uuid', true], ['due_date', 'due_date', 'date'],
    ['due_time', 'due_time', 'int', true], ['done', 'done', 'bool'], ['created_at', 'created_at', 'ms']] },
  { name: 'assessments', table: 'assessments', key: 'id', cols: [
    ['subject_id', 'subject_id', 'uuid'], ['title', 'title', 'text'], ['score', 'score', 'num'], ['max_score', 'max_score', 'num'], ['created_at', 'created_at', 'ms']] },
  { name: 'notes', table: 'notes', key: 'id', createdBy: true, child: 'items', cols: [
    ['title', 'title', 'text'], ['body', 'body', 'text'], ['tag', 'tag', 'text'], ['pinned', 'pinned', 'bool'], ['reminder_at', 'reminder_at', 'ms', true],
    ['subject_id', 'subject_id', 'uuid', true], ['class_id', 'class_id', 'uuid', true], ['deadline_id', 'deadline_id', 'uuid', true]] },
  { name: 'tasks', table: 'tasks', key: 'id', createdBy: true, cols: [
    ['title', 'title', 'text'], ['due_date', 'due_date', 'date', true], ['due_time', 'due_time', 'int', true], ['done', 'done', 'bool'],
    ['completed_at', 'completed_at', 'ms', true], ['tag', 'tag', 'text']] },
  { name: 'expenses', table: 'expenses', key: 'id', user: true, cols: [
    ['date', 'spent_on', 'date'], ['amount_minor', 'amount_minor', 'int'], ['category', 'category', 'text'], ['note', 'note', 'text'], ['created_at', 'created_at', 'ms']] },
  { name: 'clients', table: 'clients', key: 'id', cols: [['name', 'name', 'text'], ['created_at', 'created_at', 'ms']] },
  { name: 'projects', table: 'projects', key: 'id', cols: [
    ['name', 'name', 'text'], ['client_id', 'client_id', 'uuid', true], ['rate_minor', 'hourly_rate_minor', 'int'], ['created_at', 'created_at', 'ms']] },
  { name: 'time_entries', table: 'time_entries', key: 'id', user: true, cols: [
    ['project_id', 'project_id', 'uuid'], ['date', 'spent_on', 'date'], ['start_min', 'start_min', 'int'], ['end_min', 'end_min', 'int'],
    ['billable', 'billable', 'bool'], ['note', 'note', 'text'], ['created_at', 'created_at', 'ms']] },
  { name: 'meetings', table: 'meetings', key: 'id', child: 'actions', cols: [
    ['title', 'title', 'text'], ['date', 'meeting_on', 'date'], ['start_min', 'start_min', 'int', true], ['end_min', 'end_min', 'int', true],
    ['attendees', 'attendees', 'text'], ['agenda', 'agenda', 'text'], ['notes', 'notes', 'text'], ['meet_url', 'meet_url', 'text', true],
    ['invite_seq', 'invite_seq', 'int'], ['created_at', 'created_at', 'ms']] },
];
export const SPEC = new Map(SPECS.map(s => [s.name, s]));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A change the server refuses. retry: it may succeed later (e.g. the row it refers to has not arrived yet). */
class Bad extends Error { constructor(message: string, public retry = false) { super(message); } }

/** Columns that point at another row, and that row's table. Foreign keys ignore row-level security, so these are checked by hand. */
const LINKS: Record<string, string> = {
  routine_id: 'routines', event_id: 'events', subject_id: 'subjects', class_id: 'classes', deadline_id: 'deadlines', client_id: 'clients', project_id: 'projects',
};
async function checkLinks(ctx: Ctx, pairs: [string, unknown][]) {
  for (const [col, v] of pairs) {
    const table = LINKS[col];
    if (!table || v === null || v === undefined) continue;
    const r = await ctx.c.query(`select 1 from ${table} where id = $1 and workspace_id = $2`, [v, ctx.ws]);
    if (!r.rowCount) throw new Bad('refers to something that is missing', true);
  }
}

/** Phone value -> server parameter, checked. */
function toServer(kind: Kind, v: unknown, nullable: boolean | undefined, col: string): unknown {
  if (v === null || v === undefined || (kind === 'text' && nullable && v === '')) {
    if (nullable) return null;
    if (kind === 'text') return '';
    throw new Bad(`${col} is required`);
  }
  switch (kind) {
    case 'text': return String(v);
    case 'int': { const n = Number(v); if (!Number.isFinite(n)) throw new Bad(`${col} is not a number`); return Math.round(n); }
    case 'num': { const n = Number(v); if (!Number.isFinite(n)) throw new Bad(`${col} is not a number`); return n; }
    case 'bool': return v === true || v === 1 || v === '1';
    case 'date': if (typeof v !== 'string' || !DATE.test(v)) throw new Bad(`${col} is not a date`); return v;
    case 'ms': { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Bad(`${col} is not a time`); return new Date(n).toISOString(); }
    case 'uuid': if (typeof v !== 'string' || !UUID.test(v)) throw new Bad(`${col} is not an id`); return v;
  }
}

/** Server value -> phone value. */
function toPhone(kind: Kind, v: unknown): unknown {
  if (v === null || v === undefined) return kind === 'text' ? '' : null;
  switch (kind) {
    case 'bool': return v ? 1 : 0;
    case 'num': case 'int': return Number(v);
    case 'ms': return v instanceof Date ? v.getTime() : Date.parse(String(v));
    default: return v;
  }
}

/** Server column expression for SELECT (dates as text, so no time zone shifts). */
const sel = ([, server, kind]: Col) => (kind === 'date' ? `${server}::text as ${server}` : server);

export interface Change { table: string; key: string; deleted?: boolean; at: number; row?: Record<string, unknown> }
/** skew: server clock minus phone clock (ms), so change times from a phone with a wrong clock compare fairly. */
export interface Ctx { c: PoolClient; ws: string; userId: string; skew?: number }

/** Saves one change. Returns 'ok', 'stale' (the server copy is newer; the phone gets it on pull) or throws Bad. */
export async function applyChange(ctx: Ctx, ch: Change): Promise<'ok' | 'stale'> {
  const spec = SPEC.get(ch.table);
  if (!spec) throw new Bad('unknown table');
  // Change time on the server's clock. A change dated in the future counts as now.
  const at = new Date(Math.min((Number(ch.at) || Date.now()) + (ctx.skew ?? 0), Date.now())).toISOString();
  const { c, ws, userId } = ctx;
  // Rows saved from here record the phone's change time as changed_at (see touch_changed_at()).
  await c.query(`select set_config('app.change_at', $1, true)`, [at]);
  try { return await save(ctx, spec, ch, at); }
  finally { await c.query(`select set_config('app.change_at', '', true)`).catch(() => undefined); }
}

async function save(ctx: Ctx, spec: TableSpec, ch: Change, at: string): Promise<'ok' | 'stale'> {
  const { c, ws, userId } = ctx;

  if (spec.key === 'completion') {
    const [day, eventId] = String(ch.key).split('|');
    if (!DATE.test(day ?? '') || !UUID.test(eventId ?? '')) throw new Bad('bad completion key');
    if (ch.deleted) {
      const r = await c.query(`update completions set deleted_at = now() where user_id = $1 and event_id = $2 and day = $3 and workspace_id = $4 and deleted_at is null and changed_at <= $5`,
        [userId, eventId, day, ws, at]);
      if (r.rowCount) return 'ok';
      const live = await c.query(`select 1 from completions where user_id = $1 and event_id = $2 and day = $3 and workspace_id = $4 and deleted_at is null`, [userId, eventId, day, ws]);
      return live.rowCount ? 'stale' : 'ok';
    }
    await checkLinks(ctx, [['event_id', eventId]]);
    const completed = toServer('ms', ch.row?.completed_at ?? Date.now(), false, 'completed_at');
    const r = await c.query(
      `insert into completions (id, workspace_id, user_id, event_id, day, completed_at) values (gen_random_uuid(), $1, $2, $3, $4, $5)
       on conflict (user_id, event_id, day) do update set completed_at = excluded.completed_at, deleted_at = null
       where completions.workspace_id = $1 and completions.changed_at <= $6 returning 1`, [ws, userId, eventId, day, completed, at]);
    return r.rowCount ? 'ok' : 'stale';
  }

  if (spec.key === 'weekday') {
    const weekday = Number(ch.key);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Bad('bad weekday');
    if (ch.deleted) {
      const r = await c.query(`update routine_days set deleted_at = now() where workspace_id = $1 and weekday = $2 and deleted_at is null and changed_at <= $3`, [ws, weekday, at]);
      if (r.rowCount) return 'ok';
      const live = await c.query(`select 1 from routine_days where workspace_id = $1 and weekday = $2 and deleted_at is null`, [ws, weekday]);
      return live.rowCount ? 'stale' : 'ok';
    }
    const routineId = toServer('uuid', ch.row?.routine_id, false, 'routine_id');
    await checkLinks(ctx, [['routine_id', routineId]]);
    const r = await c.query(
      `insert into routine_days (workspace_id, weekday, routine_id) values ($1, $2, $3)
       on conflict (workspace_id, weekday) do update set routine_id = excluded.routine_id, deleted_at = null
       where routine_days.changed_at <= $4 returning 1`, [ws, weekday, routineId, at]);
    return r.rowCount ? 'ok' : 'stale';
  }

  const id = String(ch.key);
  if (!UUID.test(id)) throw new Bad('bad id');
  if (ch.deleted) {
    const r = await c.query(`update ${spec.table} set deleted_at = now() where id = $1 and workspace_id = $2 and deleted_at is null and changed_at <= $3`, [id, ws, at]);
    if (r.rowCount) return 'ok';
    const live = await c.query(`select 1 from ${spec.table} where id = $1 and workspace_id = $2 and deleted_at is null`, [id, ws]);
    return live.rowCount ? 'stale' : 'ok';
  }
  const row = ch.row ?? {};
  const names = ['id', 'workspace_id'];
  const values: unknown[] = [id, ws];
  if (spec.user) { names.push('user_id'); values.push(userId); }
  if (spec.createdBy) { names.push('created_by'); values.push(userId); }
  for (const col of spec.cols) {
    const [phone, server, kind, nullable] = col;
    if (spec.name === 'meetings' && phone === 'invite_seq') continue; // handled below
    names.push(server);
    values.push(toServer(kind, row[phone], nullable, phone));
  }
  await checkLinks(ctx, names.map((n, i) => [n, values[i]] as [string, unknown]).filter(([n]) => n in LINKS));
  if (spec.name === 'meetings') { names.push('invite_seq'); values.push(Math.max(0, Math.round(Number(row.invite_seq) || 0))); }
  const ph = values.map((_, i) => `$${i + 1}`);
  const updates = names.filter(n => !['id', 'workspace_id', 'user_id', 'created_by', 'created_at'].includes(n))
    .map(n => (n === 'invite_seq' ? `invite_seq = greatest(${spec.table}.invite_seq, excluded.invite_seq)` : `${n} = excluded.${n}`));
  values.push(at);
  const r = await c.query(
    `insert into ${spec.table} (${names.join(', ')}) values (${ph.join(', ')})
     on conflict (id) do update set ${[...updates, 'deleted_at = null'].join(', ')}
     where ${spec.table}.workspace_id = $2 and ${spec.table}.changed_at <= $${values.length} returning 1`, values);
  if (!r.rowCount) {
    const mine = await c.query(`select 1 from ${spec.table} where id = $1 and workspace_id = $2`, [id, ws]);
    if (!mine.rowCount) throw new Bad('belongs to another workspace');
    return 'stale';
  }

  // Child rows travel inside the parent: replace the set.
  if (spec.child === 'items') {
    const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]).slice(0, 200) : [];
    await c.query(`delete from note_items where note_id = $1`, [id]);
    for (const [i, it] of items.entries()) {
      const text = String(it.text ?? '').trim().slice(0, 200);
      if (!text || !UUID.test(String(it.id))) continue;
      // An item id that belongs to another note (possibly someone else's) is never taken over.
      await c.query(`insert into note_items (id, note_id, text, done, sort_order) values ($1, $2, $3, $4, $5) on conflict (id) do update set text = excluded.text, done = excluded.done, sort_order = excluded.sort_order where note_items.note_id = excluded.note_id`,
        [it.id, id, text, !!it.done, Number.isFinite(Number(it.sort_order)) ? Number(it.sort_order) : i]);
    }
  } else if (spec.child === 'actions') {
    let actions: Record<string, unknown>[] = [];
    try { actions = typeof row.actions === 'string' ? JSON.parse(row.actions) : Array.isArray(row.actions) ? row.actions as Record<string, unknown>[] : []; } catch { actions = []; }
    await c.query(`delete from meeting_actions where meeting_id = $1`, [id]);
    for (const [i, a] of actions.slice(0, 100).entries()) {
      const text = String(a.text ?? '').trim().slice(0, 200);
      if (!text || !UUID.test(String(a.id))) continue;
      await c.query(`insert into meeting_actions (id, meeting_id, text, done, sort_order) values ($1, $2, $3, $4, $5) on conflict (id) do update set text = excluded.text, done = excluded.done, sort_order = excluded.sort_order where meeting_actions.meeting_id = excluded.meeting_id`,
        [a.id, id, text, !!a.done, i]);
    }
  }
  return 'ok';
}

export function isBad(e: unknown): e is Bad { return e instanceof Bad; }

export interface Cursor { t: string; id: string }
export interface PulledRow { key: string; deleted: boolean; at: number; row?: Record<string, unknown> }

const keyExprOf = (spec: TableSpec) =>
  spec.key === 'weekday' ? `weekday::text` : spec.key === 'completion' ? `(day::text || '|' || event_id::text)` : `id::text`;

/** Selects rows of one table (the person's own) with a condition, and turns them into phone rows with their children. */
async function selectRows(ctx: Ctx, spec: TableSpec, cond: string, condParams: unknown[], tail: string) {
  const { c, ws, userId } = ctx;
  const keyExpr = keyExprOf(spec);
  const extra = spec.key === 'completion' ? ', day::text as day, event_id' : spec.key === 'weekday' ? ', weekday' : '';
  const params: unknown[] = [ws];
  const where = [`workspace_id = $1`];
  if (spec.user) { params.push(userId); where.push(`user_id = $${params.length}`); }
  // Condition placeholders are written as ?1, ?2 … and numbered here.
  const base = params.length;
  where.push(cond.replace(/\?(\d+)/g, (_, n) => `$${base + Number(n)}`));
  params.push(...condParams);
  const { rows } = await c.query(
    `select ${keyExpr} as _key, updated_at, updated_at::text as _t, deleted_at${extra}${spec.cols.map(col => `, ${sel(col)}`).join('')}
       from ${spec.table} where ${where.join(' and ')} ${tail.replace(/\?(\d+)/g, (_, n) => `$${base + Number(n)}`)}`, params);
  const out: PulledRow[] = rows.map(r => {
    const deleted = r.deleted_at !== null;
    const row: Record<string, unknown> = {};
    if (!deleted) {
      for (const [phone, server, kind] of spec.cols) row[phone] = toPhone(kind, r[server]);
      if (spec.key === 'completion') { row.date = r.day; row.event_id = r.event_id; }
      if (spec.key === 'weekday') row.weekday = r.weekday;
    }
    return { key: r._key, deleted, at: (r.updated_at as Date).getTime(), row: deleted ? undefined : row };
  });
  // Children of the live rows.
  const liveIds = out.filter(r => !r.deleted).map(r => r.key);
  if (spec.child && liveIds.length) {
    const childTable = spec.child === 'items' ? 'note_items' : 'meeting_actions';
    const fk = spec.child === 'items' ? 'note_id' : 'meeting_id';
    const kids = (await c.query(`select id, ${fk} as parent, text, done, sort_order from ${childTable} where ${fk} = any($1::uuid[]) order by sort_order, id`, [liveIds])).rows;
    const by = new Map<string, Record<string, unknown>[]>();
    for (const k of kids) { const list = by.get(k.parent) ?? []; list.push({ id: k.id, text: k.text, done: k.done ? 1 : 0, sort_order: k.sort_order }); by.set(k.parent, list); }
    for (const r of out) if (r.row) {
      if (spec.child === 'items') r.row.items = by.get(r.key) ?? [];
      else r.row.actions = JSON.stringify((by.get(r.key) ?? []).map(a => ({ id: a.id, text: a.text, done: a.done === 1 })));
    }
  }
  return { out, raw: rows as { _key: string; _t: string }[] };
}

/** Overlap when a pull finishes, so a change saved in a transaction that committed late is still picked up next time. */
const OVERLAP_MS = 2 * 60_000;

/**
 * Rows of one table changed after the cursor, oldest first, at most `limit`. Ordered by (updated_at, key)
 * so paging never skips rows that share a time. The cursor keeps Postgres's full precision (microseconds).
 */
export async function pullTable(ctx: Ctx, spec: TableSpec, cursor: Cursor | null, limit: number): Promise<{ rows: PulledRow[]; next: Cursor | null; settled: Cursor | null; more: boolean }> {
  const keyExpr = keyExprOf(spec);
  const { out, raw } = cursor
    ? await selectRows(ctx, spec, `(updated_at, ${keyExpr}) > (?1::timestamptz, ?2)`, [cursor.t, cursor.id], `order by updated_at, _key limit ?3`.replace('?3', `${Math.floor(limit)}`))
    : await selectRows(ctx, spec, `true`, [], `order by updated_at, _key limit ${Math.floor(limit)}`);
  const more = raw.length === limit;
  const last = raw[raw.length - 1];
  const next: Cursor | null = last ? { t: last._t, id: last._key } : cursor;
  // Last page: the cursor to keep for the next sync steps back a little, so changes in transactions that
  // committed late are not missed. Paging within this sync continues from the exact cursor.
  const settled = !more && last ? { t: new Date(Date.parse(last._t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')) - OVERLAP_MS).toISOString(), id: '' } : null;
  return { rows: out, next, settled, more };
}

/** The server's current copy of some rows (after the phone's change lost to a newer one). */
export async function fetchRows(ctx: Ctx, spec: TableSpec, keys: string[]): Promise<PulledRow[]> {
  if (!keys.length) return [];
  return (await selectRows(ctx, spec, `${keyExprOf(spec)} = any(?1::text[])`, [keys], '')).out;
}
