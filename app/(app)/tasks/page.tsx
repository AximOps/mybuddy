import { addTask, deleteTask, setTaskDone } from '@/app/actions';
import { withUser } from '@/lib/db';
import { listTasks, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { APP_TZ, dateKeyIn, fmtMinutes } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const user = await getCurrentUser();
  const tasks = await withUser(user!.id, async c => listTasks(c, await personalWorkspaceId(c, user!.id)));
  const today = dateKeyIn(APP_TZ);
  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  const row = (t: (typeof tasks)[number]) => {
    const overdue = !t.done && t.dueDate !== null && t.dueDate < today;
    return (
      <li key={t.id} className={t.done ? 'done' : ''}>
        <form action={setTaskDone}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="done" value={String(!t.done)} />
          <button type="submit" className="check" aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}>{t.done ? '✓' : ''}</button>
        </form>
        <div className="body">
          <strong>{t.title}</strong>
          <span className="muted">
            <span className="pill">{t.tag}</span>
            {t.dueDate ? <span className={overdue ? 'danger' : ''}> · {overdue ? 'Overdue · ' : ''}{t.dueDate}{t.dueTime !== null ? ` ${fmtMinutes(t.dueTime)}` : ''}</span> : null}
          </span>
        </div>
        <form action={deleteTask}>
          <input type="hidden" name="id" value={t.id} />
          <button type="submit" className="ghost" aria-label={`Delete ${t.title}`}>Delete</button>
        </form>
      </li>
    );
  };

  return (
    <>
      <h1>To-Do</h1>
      <p className="muted">{open.length} open{open.some(t => t.dueDate && t.dueDate < today) ? ' · some overdue' : ''}</p>

      <details className="card" open={tasks.length === 0}>
        <summary><strong>+ New task</strong></summary>
        <form action={addTask} className="grid-form">
          <label className="wide-field">Task<input name="title" required maxLength={120} placeholder="e.g. Renew passport" /></label>
          <label>Due date<input name="dueDate" type="date" /></label>
          <label>Time<input name="dueTime" type="time" /></label>
          <label>Tag
            <select name="tag" defaultValue="Personal">
              <option>Personal</option><option>Work</option><option>Others</option>
            </select>
          </label>
          <button className="primary" type="submit">Add task</button>
        </form>
      </details>

      <ul className="list">{open.map(row)}</ul>
      {done.length ? (
        <>
          <h2>Done</h2>
          <ul className="list">{done.map(row)}</ul>
        </>
      ) : null}
    </>
  );
}
