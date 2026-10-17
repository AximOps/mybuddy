import { IconPicker } from '@/components/IconPicker';
import { AddDialog } from '@/components/AddDialog';
import { addActivity, copyRoutine, createRoutine, deleteActivity, deleteRoutine, setRoutineDay, updateActivity, updateRoutine } from '@/app/actions';
import { withUser } from '@/lib/db';
import { listRoutines, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLORS = ['#4B5BE8', '#8B5CF6', '#2FA67B', '#E8590C', '#0CA5C9', '#D6336C', '#5F8B00', '#F59F00'];
const CATEGORIES = ['personal', 'health', 'meal', 'work'];

export default async function RoutinesPage() {
  const user = await getCurrentUser();
  const routines = await withUser(user!.id, async c => listRoutines(c, await personalWorkspaceId(c, user!.id)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Routines</h1>
          <p>Each weekday follows one routine. Pick the days below, then add the activities.</p>
        </div>
      </div>

      <details className="card panel" style={{ marginBottom: 20 }}>
        <summary className="card-body"><strong>+ New routine</strong></summary>
        <form action={createRoutine} className="form-grid" style={{ padding: '0 18px 18px' }}>
          <label className="field span-6">Name<input className="input" name="name" required maxLength={60} placeholder="e.g. Travel day" /></label>
          <label className="field span-3">Colour
            <select className="select" name="color" defaultValue={COLORS[routines.length % COLORS.length]}>
              {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn primary" type="submit">Create routine</button>
          </div>
        </form>
      </details>

      <div className="stack">
        {routines.map(r => (
          <section key={r.id} id={`routine-${r.id}`} className="card flush" style={{ scrollMarginTop: 80 }}>
            <div className="card-head">
              <form action={updateRoutine} style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                <input type="hidden" name="id" value={r.id} />
                <span style={{ width: 12, height: 12, borderRadius: 6, background: r.color, flex: 'none' }} />
                <input className="input" name="name" defaultValue={r.name} maxLength={60} aria-label="Routine name" style={{ maxWidth: 260, fontWeight: 600 }} />
                <select className="select" name="color" defaultValue={r.color} aria-label="Colour" style={{ width: 110 }}>
                  {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn sm" type="submit">Save</button>
              </form>
              <div className="actions">
                <form action={copyRoutine}>
                  <input type="hidden" name="routineId" value={r.id} />
                  <button className="btn ghost sm" type="submit">Copy</button>
                </form>
                <form action={deleteRoutine}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn ghost sm danger" type="submit" disabled={routines.length < 2}>Delete routine</button>
                </form>
              </div>
            </div>

            <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="small muted" style={{ marginBottom: 8 }}>Weekdays</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {DAYS.map((label, weekday) => {
                  const on = r.days.includes(weekday);
                  return (
                    <form key={weekday} action={setRoutineDay}>
                      <input type="hidden" name="routineId" value={r.id} />
                      <input type="hidden" name="weekday" value={weekday} />
                      <button type="submit" className={`btn sm ${on ? 'primary' : ''}`} aria-pressed={on} aria-label={`${label}: ${on ? 'on' : 'off'}`} style={{ width: 52 }}>
                        {label}
                      </button>
                    </form>
                  );
                })}
              </div>
            </div>

            {r.events.length === 0 ? (
              <AddDialog title={`Add an activity to ${r.name}`} label={`Add an activity to ${r.name}`} text="No activities yet. Tap + to add one.">
              <form action={addActivity} className="form-grid">
                <input type="hidden" name="routineId" value={r.id} />
                <label className="field span-4">Activity<input className="input" name="title" required maxLength={120} /></label>
                <div className="span-12"><IconPicker /></div>
                <label className="field span-2">Starts<input className="input" type="time" name="start" required /></label>
                <label className="field span-2">Ends<input className="input" type="time" name="end" required /></label>
                <label className="field span-2">Category
                  <select className="select" name="category" defaultValue="personal">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <div className="span-1" style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="btn primary" type="submit">Add</button>
                </div>
              </form>
              </AddDialog>
            ) : (
              <table className="table">
                <thead><tr><th>Edit activities</th></tr></thead>
                <tbody>
                  {r.events.map(e => (
                    <tr key={e.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 18px' }}>
                          <form action={updateActivity} className="routine-edit-row" style={{ display: 'grid', flex: 1, gridTemplateColumns: '60px 1fr 150px 150px auto', gap: 8, alignItems: 'center' }}>
                            <input type="hidden" name="id" value={e.id} />
                            <input className="input" name="emoji" defaultValue={e.emoji} maxLength={8} aria-label="Icon" />
                            <input className="input" name="title" defaultValue={e.title} maxLength={120} required aria-label="Activity" />
                            <input className="input" type="time" name="start" defaultValue={toHM(e.startMin)} required aria-label="Starts" />
                            <input className="input" type="time" name="end" defaultValue={toHM(e.endMin)} required aria-label="Ends" />
                            <button className="btn sm" type="submit">Save</button>
                          </form>
                          <form action={deleteActivity}>
                            <input type="hidden" name="id" value={e.id} />
                            <button className="btn ghost sm danger" type="submit" aria-label={`Delete ${e.title}`}>Delete</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <details className="panel" style={{ borderTop: '1px solid var(--line)' }}>
              <summary className="card-body small"><strong>+ Add activity to {r.name}</strong></summary>
              <form action={addActivity} className="form-grid" style={{ padding: '0 18px 18px' }}>
                <input type="hidden" name="routineId" value={r.id} />
                <label className="field span-4">Activity<input className="input" name="title" required maxLength={120} /></label>
                <div className="span-12"><IconPicker /></div>
                <label className="field span-2">Starts<input className="input" type="time" name="start" required /></label>
                <label className="field span-2">Ends<input className="input" type="time" name="end" required /></label>
                <label className="field span-2">Category
                  <select className="select" name="category" defaultValue="personal">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <div className="span-1" style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button className="btn primary" type="submit">Add</button>
                </div>
              </form>
            </details>
          </section>
        ))}
      </div>
    </>
  );
}

function toHM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
