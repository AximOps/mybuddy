import { withUser } from '@/lib/db';
import { listRoutines, personalWorkspaceId, routineForDay } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { APP_TZ, dateKeyIn, shiftDateKey, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

const STREAK_TARGET = 60;

export default async function StatsPage() {
  const user = await getCurrentUser();
  const today = dateKeyIn(APP_TZ);

  const stats = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const dayPercent = async (key: string) => {
      const r = await routineForDay(c, ws, user!.id, weekdayOf(key), key);
      const total = r.events.length;
      const done = r.events.filter(e => e.done).length;
      return { key, done, total, percent: total ? Math.round((done / total) * 100) : 0 };
    };

    const week = [];
    for (let i = 6; i >= 0; i--) week.push(await dayPercent(shiftDateKey(today, -i)));

    // Streak: consecutive days at or above the target, counting back from today. Today is not
    // counted against you while it is still in progress.
    let streak = 0;
    for (let i = 0; i < 90; i++) {
      const day = await dayPercent(shiftDateKey(today, -i));
      if (day.total === 0) break;
      if (day.percent >= STREAK_TARGET) streak++;
      else if (i > 0) break;
    }

    const focus = await c.query<{ minutes: number; sessions: number }>(
      `select coalesce(sum(minutes), 0)::int as minutes, count(*)::int as sessions
         from focus_sessions where user_id = $1 and completed_at >= now() - interval '7 days'`, [user!.id]);
    const tasks = await c.query<{ n: number }>(
      `select count(*)::int as n from tasks
        where workspace_id = $1 and done and deleted_at is null and completed_at >= now() - interval '7 days'`, [ws]);
    const routines = (await listRoutines(c, ws)).length;

    return { week, streak, focus: focus.rows[0], tasksDone: tasks.rows[0].n, routines };
  });

  const weekAverage = Math.round(stats.week.reduce((s, d) => s + d.percent, 0) / stats.week.length);
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
        <div className="card stat"><div className="label">Streak</div><div className="value num">{stats.streak} {stats.streak === 1 ? 'day' : 'days'}</div><div className="small muted">Days at {STREAK_TARGET}% or more</div></div>
        <div className="card stat"><div className="label">7-day average</div><div className="value num">{weekAverage}%</div><div className="small muted">Routine completion</div></div>
        <div className="card stat"><div className="label">Focus this week</div><div className="value num">{stats.focus.minutes} min</div><div className="small muted">{stats.focus.sessions} sessions</div></div>
        <div className="card stat"><div className="label">Tasks done</div><div className="value num">{stats.tasksDone}</div><div className="small muted">In the last 7 days</div></div>
      </div>

      <section className="card card-body" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 16 }}>Routine completion, last 7 days</h2>
        <div className="bars" role="img" aria-label="Bar chart of routine completion for the last 7 days">
          {stats.week.map(d => (
            <div key={d.key} className="bar-col">
              <div className="bar"><span style={{ height: `${Math.max(d.percent, d.total ? 4 : 0)}%` }} /></div>
              <div className="small num">{d.percent}%</div>
              <div className="small muted">{label(d.key)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card flush">
        <div className="card-head"><h2>Day by day</h2><span className="muted small">{stats.routines} routines</span></div>
        <table className="table">
          <thead><tr><th>Day</th><th>Done</th><th>Completion</th></tr></thead>
          <tbody>
            {stats.week.slice().reverse().map(d => (
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
