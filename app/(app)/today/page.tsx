import Link from 'next/link';
import { addEvent, toggleEvent } from '@/app/actions';
import { withUser } from '@/lib/db';
import { listRoutines, listTasks, personalWorkspaceId, routineForDay } from '@/lib/planner';
import { Hero } from '@/components/Hero';
import { getCurrentUser } from '@/lib/session';
import { fmtMinutes, dateKeyIn, isDateKey, longDate, shiftDateKey, weekdayOf } from '@/lib/time';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const user = await getCurrentUser();
  const { day: requested } = await searchParams;
  const { routineName, events, dueTasks, today, day, student, routines, greeting, emoji } = await withUser(user!.id, async c => {
    const { timezone } = await getSettings(c, user!.id);
    const todayKey = dateKeyIn(timezone);
    const dayKey = isDateKey(requested) ? requested : todayKey;
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const routine = await routineForDay(c, ws, user!.id, weekdayOf(dayKey), dayKey);
    const tasks = (await listTasks(c, ws)).filter(t =>
      !t.done && t.dueDate !== null && (t.dueDate === dayKey || (dayKey === todayKey && t.dueDate < todayKey)));
    let student = { classes: [] as { title: string; kind: string; start_min: number; end_min: number; room: string }[], deadlines: [] as { title: string; kind: string; due_date: string; due_time: number | null }[], exams: [] as { title: string; due_date: string }[] };
    if (settings.studentEnabled) {
      student.classes = (await c.query(`select title, kind, start_min, end_min, room from classes where workspace_id = $1 and weekday = $2 and deleted_at is null order by start_min`, [ws, weekdayOf(dayKey)])).rows;
      student.deadlines = (await c.query(`select title, kind, due_date::text as due_date, due_time from deadlines where workspace_id = $1 and done = false and deleted_at is null and (due_date = $2 or ($3 and due_date < $2)) order by due_date, coalesce(due_time, 1440)`, [ws, dayKey, dayKey === todayKey])).rows;
      student.exams = (await c.query(`select title, due_date::text as due_date from deadlines where workspace_id = $1 and kind = 'exam' and done = false and deleted_at is null and due_date > $2 and due_date <= ($2::date + 14) order by due_date`, [ws, dayKey])).rows;
    }
    const routines = await listRoutines(c, ws);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const period = hour >= 5 && hour < 12 ? ['🌅', 'Good morning'] : hour < 17 ? ['☀️', 'Good afternoon'] : hour < 21 ? ['🌇', 'Good evening'] : ['🌙', 'Good night'];
    return { ...routine, dueTasks: tasks, today: todayKey, day: dayKey, student, routines, greeting: `${period[1]}, ${(user!.name || 'buddy').split(' ')[0]}`, emoji: period[0] };
  });

  const done = events.filter(e => e.done).length;
  const percent = events.length ? Math.round((done / events.length) * 100) : 0;
  const next = events.find(e => !e.done);

  return (
    <>
      <div className="page-head">
        <div>
          {day === today ? <Hero emoji={emoji} greeting={greeting} /> : <h1>{longDate(day)}</h1>}
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

          {student.classes.length || student.deadlines.length || student.exams.length ? (
            <section className="card flush">
              <div className="card-head"><h2>Student</h2><Link className="small muted" href="/student">Open</Link></div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {student.classes.map((c, i) => <li key={`c${i}`} className="card-body" style={{ borderTop: '1px solid var(--line)' }}><div style={{ fontWeight: 550 }}>📚 {c.title}</div><div className="small muted">{c.kind} · {fmtMinutes(c.start_min)} – {fmtMinutes(c.end_min)}{c.room ? ` · ${c.room}` : ''}</div></li>)}
                {student.deadlines.map((d, i) => <li key={`d${i}`} className="card-body" style={{ borderTop: '1px solid var(--line)' }}><div style={{ fontWeight: 550 }}>{d.kind === 'exam' ? '📝' : '📌'} {d.title}</div><div className="small muted">{d.kind} · due {d.due_date}{d.due_time !== null ? ` ${fmtMinutes(d.due_time)}` : ''}</div></li>)}
                {student.exams.map((x, i) => <li key={`x${i}`} className="card-body" style={{ borderTop: '1px solid var(--line)' }}><div style={{ fontWeight: 550 }}>⏳ {x.title}</div><div className="small muted">Exam on {x.due_date}</div></li>)}
              </ul>
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

      <section className="card flush" style={{ marginTop: 20 }}>
        <div className="card-head">
          <h2>Routines</h2>
          <Link className="small muted" href="/routines">Manage ›</Link>
        </div>
        {routines.length === 0 ? <div className="empty">No routines yet.</div> : (
          <ul className="routine-list">
            {routines.map(r => (
              <li key={r.id} className="routine-row">
                <span className="routine-dot" style={{ background: r.color }} aria-hidden="true" />
                <div className="routine-name">
                  <strong>{r.name}</strong>
                  <span className="small muted">{r.events.length} activities</span>
                </div>
                <div className="routine-days" aria-label="Weekdays">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className={r.days.includes(i) ? 'on' : ''}>{d}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
