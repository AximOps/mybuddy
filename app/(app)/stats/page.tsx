import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings, money } from '@/lib/settings';
import { SPEND_CATEGORIES } from '@/lib/tags';
import { dateKeyIn, shiftDateKey, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

const STREAK_TARGET = 60;
const STREAK_LOOKBACK = 90;

interface DayStat { key: string; done: number; total: number; percent: number }

export default async function StatsPage() {
  const user = await getCurrentUser();

  // Five queries in total, whatever the number of days. Everything else is worked out in memory.
  const data = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const today = dateKeyIn(settings.timezone);
    const from = shiftDateKey(today, -(STREAK_LOOKBACK - 1));

    const routineDays = await c.query<{ weekday: number; routine_id: string }>(
      `select weekday, routine_id from routine_days where workspace_id = $1 and deleted_at is null`, [ws]);
    const events = await c.query<{ id: string; routine_id: string }>(
      `select id, routine_id from events where workspace_id = $1 and deleted_at is null`, [ws]);
    const completions = await c.query<{ event_id: string; day: string }>(
      `select event_id, day::text as day from completions
        where user_id = $1 and deleted_at is null and day >= $2 and day <= $3`, [user!.id, from, today]);
    const focus = await c.query<{ minutes: number; sessions: number }>(
      `select coalesce(sum(minutes), 0)::int as minutes, count(*)::int as sessions
         from focus_sessions where user_id = $1 and completed_at >= now() - interval '7 days'`, [user!.id]);
    const tasks = await c.query<{ n: number }>(
      `select count(*)::int as n from tasks
        where workspace_id = $1 and done and deleted_at is null and completed_at >= now() - interval '7 days'`, [ws]);
    const routines = await c.query<{ n: number }>(
      `select count(*)::int as n from routines where workspace_id = $1 and deleted_at is null`, [ws]);

    const routineForWeekday = new Map(routineDays.rows.map(r => [r.weekday, r.routine_id]));
    const eventsByRoutine = new Map<string, string[]>();
    for (const e of events.rows) eventsByRoutine.set(e.routine_id, [...(eventsByRoutine.get(e.routine_id) ?? []), e.id]);
    const doneSet = new Set(completions.rows.map(r => `${r.event_id}|${r.day}`));

    const dayStat = (key: string): DayStat => {
      const ids = eventsByRoutine.get(routineForWeekday.get(weekdayOf(key)) ?? '') ?? [];
      const done = ids.filter(id => doneSet.has(`${id}|${key}`)).length;
      return { key, done, total: ids.length, percent: ids.length ? Math.round((done / ids.length) * 100) : 0 };
    };

    const week: DayStat[] = [];
    for (let i = 6; i >= 0; i--) week.push(dayStat(shiftDateKey(today, -i)));

    // Streak: consecutive days at or above the target, counting back from today. Today is not
    // counted against you while it is still in progress.
    let streak = 0;
    for (let i = 0; i < STREAK_LOOKBACK; i++) {
      const day = dayStat(shiftDateKey(today, -i));
      if (day.total === 0) break;
      if (day.percent >= STREAK_TARGET) streak++;
      else if (i > 0) break;
    }

    const monthStart = `${today.slice(0, 8)}01`;
    const spend = await c.query<{ category: string; total: number }>(
      `select category, sum(amount_minor)::int as total from expenses
        where user_id = $1 and spent_on >= $2 and spent_on <= $3 and deleted_at is null
        group by category order by total desc`, [user!.id, monthStart, today]);
    const todo = await c.query<{ open: number; overdue: number }>(
      `select count(*) filter (where not done)::int as open,
              count(*) filter (where not done and due_date < $2)::int as overdue
         from tasks where workspace_id = $1 and deleted_at is null`, [ws, today]);
    const notes = await c.query<{ total: number; pinned: number }>(
      `select count(*)::int as total, count(*) filter (where pinned)::int as pinned
         from notes where workspace_id = $1 and deleted_at is null`, [ws]);
    const noteTags = await c.query<{ tag: string; n: number }>(
      `select tag, count(*)::int as n from notes where workspace_id = $1 and deleted_at is null group by tag order by n desc`, [ws]);

    return {
      week, streak, currency: settings.currency,
      focus: focus.rows[0], tasksDone: tasks.rows[0].n, routines: routines.rows[0].n,
      spend: spend.rows, todo: todo.rows[0], notes: notes.rows[0], noteTags: noteTags.rows,
    };
  });

  const weekAverage = Math.round(data.week.reduce((s, d) => s + d.percent, 0) / data.week.length);
  const label = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Stats</h1>
          <p>Your routine completion, focus time and tasks over the last week.</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Streak</div><div className="value num">{data.streak} {data.streak === 1 ? 'day' : 'days'}</div><div className="small muted">Days at {STREAK_TARGET}% or more</div></div>
        <div className="card stat"><div className="label">7-day average</div><div className="value num">{weekAverage}%</div><div className="small muted">Routine completion</div></div>
        <div className="card stat"><div className="label">Focus this week</div><div className="value num">{data.focus.minutes} min</div><div className="small muted">{data.focus.sessions} sessions</div></div>
        <div className="card stat"><div className="label">Tasks done</div><div className="value num">{data.tasksDone}</div><div className="small muted">In the last 7 days</div></div>
      </div>

      <section className="card card-body" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 16 }}>Routine completion, last 7 days</h2>
        <div className="bars" role="img" aria-label="Bar chart of routine completion for the last 7 days">
          {data.week.map(d => (
            <div key={d.key} className="bar-col">
              <div className="bar"><span style={{ height: `${d.total ? Math.max(d.percent, 4) : 0}%` }} /></div>
              <div className="small num">{d.percent}%</div>
              <div className="small muted">{label(d.key)}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="layout-2" style={{ marginBottom: 20 }}>
        <section className="card card-body">
          <h2 style={{ marginBottom: 12 }}>Spending this month</h2>
          {data.spend.length === 0 ? <p className="muted small">No spending recorded this month.</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {data.spend.map(r => {
                const label = SPEND_CATEGORIES.find(c => c.id === r.category)?.label ?? `🏷️ ${r.category}`;
                const max = data.spend[0].total;
                return (
                  <li key={r.category} style={{ padding: '8px 0' }}>
                    <div className="actions" style={{ justifyContent: 'space-between' }}><span>{label}</span><span className="num">{money(r.total, data.currency)}</span></div>
                    <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${Math.round((r.total / max) * 100)}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <div className="stack">
          <section className="card card-body">
            <h2 style={{ marginBottom: 10 }}>To-do</h2>
            <div className="small muted">Open tasks</div><div className="value num" style={{ fontSize: 22, fontWeight: 650 }}>{data.todo.open}</div>
            <div className="small muted" style={{ marginTop: 10 }}>Overdue</div><div className="value num" style={{ fontSize: 22, fontWeight: 650, color: data.todo.overdue ? 'var(--danger)' : undefined }}>{data.todo.overdue}</div>
          </section>
          <section className="card card-body">
            <h2 style={{ marginBottom: 10 }}>Notes</h2>
            <div className="small muted">Total notes</div><div className="value num" style={{ fontSize: 22, fontWeight: 650 }}>{data.notes.total}</div>
            <div className="small muted" style={{ marginTop: 10 }}>Pinned</div><div className="value num" style={{ fontSize: 22, fontWeight: 650 }}>{data.notes.pinned}</div>
            <div className="actions" style={{ marginTop: 10 }}>{data.noteTags.map(t => <span key={t.tag} className="badge">{t.tag} · {t.n}</span>)}</div>
          </section>
        </div>
      </div>

      <section className="card flush">
        <div className="card-head"><h2>Day by day</h2><span className="muted small">{data.routines} routines</span></div>
        <table className="table">
          <thead><tr><th>Day</th><th>Done</th><th>Completion</th></tr></thead>
          <tbody>
            {data.week.slice().reverse().map(d => (
              <tr key={d.key}>
                <td>{label(d.key)} <span className="muted small">{d.key}</span></td>
                <td className="num">{d.total ? `${d.done} of ${d.total}` : 'No activities'}</td>
                <td style={{ width: '40%' }}><div className="progress" style={{ marginTop: 0 }}><span style={{ width: `${d.percent}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
