import Link from 'next/link';
import { addEvent, toggleEvent } from '@/app/actions';
import { withUser } from '@/lib/db';
import { listTasks, personalWorkspaceId, routineForDay } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { fmtMinutes, dateKeyIn, isDateKey, longDate, shiftDateKey, weekdayOf } from '@/lib/time';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const user = await getCurrentUser();
  const { day: requested } = await searchParams;
  const { routineName, events, dueTasks, today, day } = await withUser(user!.id, async c => {
    const { timezone } = await getSettings(c, user!.id);
    const todayKey = dateKeyIn(timezone);
    const dayKey = isDateKey(requested) ? requested : todayKey;
    const ws = await personalWorkspaceId(c, user!.id);
    const routine = await routineForDay(c, ws, user!.id, weekdayOf(dayKey), dayKey);
    const tasks = (await listTasks(c, ws)).filter(t =>
      !t.done && t.dueDate !== null && (t.dueDate === dayKey || (dayKey === todayKey && t.dueDate < todayKey)));
    return { ...routine, dueTasks: tasks, today: todayKey, day: dayKey };
  });

  const done = events.filter(e => e.done).length;
  const percent = events.length ? Math.round((done / events.length) * 100) : 0;
  const next = events.find(e => !e.done);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{day === today ? 'Today' : longDate(day)}</h1>
          <p>{routineName ? `Routine: ${routineName}` : 'No routine for this day'}</p>
        </div>
        <div className="actions">
          <Link className="btn" href={`/today?day=${shiftDateKey(day, -1)}`}>‹ Previous</Link>
          <Link className="btn" href="/today">Today</Link>
          <Link className="btn" href={`/today?day=${shiftDateKey(day, 1)}`}>Next ›</Link>
        </div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Completed</div>
          <div className="value num">{done} of {events.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Progress</div>
          <div className="value num">{percent}%</div>
          <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        </div>
        <div className="card stat">
          <div className="label">Tasks due</div>
          <div className="value num">{dueTasks.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Next up</div>
          <div className="value" style={{ fontSize: 18 }}>{next ? fmtMinutes(next.startMin) : '—'}</div>
          <div className="small muted">{next ? next.title : 'Everything is done'}</div>
        </div>
      </div>

      <div className="layout-2">
        <section className="card flush">
          <div className="card-head">
            <h2>Schedule</h2>
            <span className="muted small">{events.length} activities</span>
          </div>
          {events.length === 0 ? (
            <div className="empty">Nothing planned for this day. Add an activity to the routine.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th className="check-col" aria-label="Done" /><th>Time</th><th>Activity</th><th className="hide-sm">Category</th></tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id} className={e.done ? 'done' : ''}>
                    <td className="check-col">
                      <form action={toggleEvent}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="day" value={day} />
                        <button type="submit" className={`check ${e.done ? 'on' : ''}`} aria-label={e.done ? `Undo ${e.title}` : `Mark ${e.title} done`}>
                          {e.done ? '✓' : ''}
                        </button>
                      </form>
                    </td>
                    <td className="time">{fmtMinutes(e.startMin)} – {fmtMinutes(e.endMin)}</td>
                    <td><span className="title">{e.emoji} {e.title}</span></td>
                    <td className="hide-sm"><span className="badge">{e.category}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="stack">
          {next ? (
            <section className="card next-up card-body">
              <div className="small">Next up · {fmtMinutes(next.startMin)}</div>
              <div style={{ fontSize: 18, fontWeight: 650, marginTop: 4 }}>{next.emoji} {next.title}</div>
            </section>
          ) : null}

          <section className="card flush">
            <div className="card-head">
              <h2>Tasks due</h2>
              <Link className="small muted" href="/tasks">View all</Link>
            </div>
            {dueTasks.length === 0 ? (
              <div className="empty">No tasks due {day === today ? 'today' : 'on this day'}.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {dueTasks.map(t => (
                  <li key={t.id} className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 550 }}>{t.title}</div>
                    <div className="small muted">
                      <span className="badge">{t.tag}</span>{t.dueTime !== null ? ` · ${fmtMinutes(t.dueTime)}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="card panel">
            <summary className="card-body"><strong>+ Add an activity</strong></summary>
            <form action={addEvent} className="form-grid" style={{ padding: '0 18px 18px' }}>
              <input type="hidden" name="day" value={day} />
              <label className="field span-12">Title<input className="input" name="title" required maxLength={120} placeholder="e.g. Evening walk" /></label>
              <label className="field span-3">Icon<input className="input" name="emoji" maxLength={8} placeholder="📌" /></label>
              <label className="field span-4">Starts<input className="input" name="start" type="time" required /></label>
              <label className="field span-4">Ends<input className="input" name="end" type="time" required /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn primary" type="submit">Add activity</button>
              </div>
            </form>
          </details>
        </div>
      </div>
    </>
  );
}
