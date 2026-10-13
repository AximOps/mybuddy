import Link from 'next/link';
import { addEvent, toggleEvent } from '@/app/actions';
import { withUser } from '@/lib/db';
import { routineForDay, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { APP_TZ, dateKeyIn, fmtMinutes, isDateKey, longDate, shiftDateKey, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const user = await getCurrentUser();
  const { day: requested } = await searchParams;
  const today = dateKeyIn(APP_TZ);
  const day = isDateKey(requested) ? requested : today;

  const { routineName, events } = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    return routineForDay(c, ws, user!.id, weekdayOf(day), day);
  });

  const doneCount = events.filter(e => e.done).length;
  const percent = events.length ? Math.round((doneCount / events.length) * 100) : 0;
  const firstOpen = events.find(e => !e.done);

  return (
    <>
      <div className="daybar">
        <Link href={`/today?day=${shiftDateKey(day, -1)}`} aria-label="Previous day">‹</Link>
        <div className="center">
          <strong>{day === today ? 'Today' : longDate(day)}</strong>
          <span className="muted"> · {longDate(day)}</span>
        </div>
        <Link href={`/today?day=${shiftDateKey(day, 1)}`} aria-label="Next day">›</Link>
      </div>

      <section className="hero">
        <div>
          <p className="kicker">{routineName ? `Routine: ${routineName}` : 'No routine for this day'}</p>
          <h1>{events.length ? `${doneCount} of ${events.length} done` : 'Nothing planned'}</h1>
          {firstOpen ? <p className="muted">Next up: {firstOpen.emoji} {firstOpen.title} at {fmtMinutes(firstOpen.startMin)}</p> : null}
        </div>
        <div className="ring" aria-label={`${percent} percent done`}>{percent}%</div>
      </section>

      <ol className="timeline">
        {events.map(e => (
          <li key={e.id} className={e.done ? 'done' : ''}>
            <span className="time">{fmtMinutes(e.startMin)}</span>
            <form action={toggleEvent} className="event">
              <input type="hidden" name="eventId" value={e.id} />
              <input type="hidden" name="day" value={day} />
              <button type="submit" className="check" aria-label={e.done ? `Undo ${e.title}` : `Mark ${e.title} done`}>{e.done ? '✓' : ''}</button>
              <span className="emoji">{e.emoji}</span>
              <span className="body">
                <strong>{e.title}</strong>
                <span className="muted">{fmtMinutes(e.startMin)} – {fmtMinutes(e.endMin)} · {e.category}</span>
              </span>
            </form>
          </li>
        ))}
      </ol>

      <details className="card">
        <summary><strong>+ Add an event to this day&apos;s routine</strong></summary>
        <form action={addEvent} className="grid-form">
          <input type="hidden" name="day" value={day} />
          <label>Title<input name="title" required maxLength={120} placeholder="e.g. Evening walk" /></label>
          <label>Icon<input name="emoji" maxLength={8} placeholder="📌" /></label>
          <label>Starts<input name="start" type="time" required /></label>
          <label>Ends<input name="end" type="time" required /></label>
          <button className="primary" type="submit">Add event</button>
        </form>
      </details>
    </>
  );
}
