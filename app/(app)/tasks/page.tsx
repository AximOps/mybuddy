import Link from 'next/link';
import { addTask, clearCompletedTasks, deleteTask, setTaskDone } from '@/app/actions';
import { withUser } from '@/lib/db';
import { listTasks, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { tagOptions } from '@/lib/tags';
import { dateKeyIn, fmtMinutes } from '@/lib/time';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

type Status = 'open' | 'done' | 'all';


export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; tag?: string }> }) {
  const user = await getCurrentUser();
  const { status: requested, tag: tagFilter = '' } = await searchParams;
  const status: Status = requested === 'done' || requested === 'all' ? requested : 'open';
  const { tasks, today, tags } = await withUser(user!.id, async c => {
    const { timezone } = await getSettings(c, user!.id);
    return { tasks: await listTasks(c, await personalWorkspaceId(c, user!.id)), today: dateKeyIn(timezone), tags: await tagOptions(c, user!.id, 'task') };
  });

  const open = tasks.filter(t => !t.done);
  const overdue = open.filter(t => t.dueDate !== null && t.dueDate < today).length;
  const byStatus = status === 'open' ? open : status === 'done' ? tasks.filter(t => t.done) : tasks;
  const shown = tagFilter ? byStatus.filter(t => t.tag === tagFilter) : byStatus;
  const hasDone = tasks.some(t => t.done);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>To-Do</h1>
          <p>{open.length} open{overdue ? ` · ${overdue} overdue` : ''}</p>
        </div>
        <div className="seg" role="tablist" aria-label="Filter tasks">
          <Link href={`/tasks?status=open${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`} aria-current={status === 'open' ? 'true' : undefined}>Open</Link>
          <Link href={`/tasks?status=done${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`} aria-current={status === 'done' ? 'true' : undefined}>Done</Link>
          <Link href={`/tasks?status=all${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`} aria-current={status === 'all' ? 'true' : undefined}>All</Link>
        </div>
      </div>

      <details className="card panel" open={tasks.length === 0} style={{ marginBottom: 20 }}>
        <summary className="card-body"><strong>+ New task</strong></summary>
        <form action={addTask} className="form-grid" style={{ padding: '0 18px 18px' }}>
          <label className="field span-6">Task<input className="input" name="title" required maxLength={120} placeholder="e.g. Renew passport" /></label>
          <label className="field span-2">Due date<input className="input" type="date" name="dueDate" /></label>
          <label className="field span-2">Time<input className="input" type="time" name="dueTime" /></label>
          <label className="field span-2">Tag
            <select className="select" name="tag" defaultValue="Personal">
              {tags.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field span-2">New tag (optional)<input className="input" name="newTag" maxLength={20} placeholder="e.g. Errands" /></label>
          <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn primary" type="submit">Add task</button>
          </div>
        </form>
      </details>

      <div className="actions" style={{ marginBottom: 12 }}>
        <span className="small muted">Filter by tag:</span>
        <Link className={`badge ${tagFilter === '' ? 'accent' : ''}`} href={`/tasks?status=${status}`}>All</Link>
        {tags.map(t => (
          <Link key={t} className={`badge ${tagFilter === t ? 'accent' : ''}`} href={`/tasks?status=${status}&tag=${encodeURIComponent(t)}`}>{t}</Link>
        ))}
        {hasDone ? (
          <form action={clearCompletedTasks} style={{ marginLeft: 'auto' }}>
            <button type="submit" className="btn ghost sm danger">Clear completed</button>
          </form>
        ) : null}
      </div>

      <section className="card flush">
        {shown.length === 0 ? (
          <div className="empty">{status === 'done' ? 'Nothing completed yet.' : 'No tasks here yet.'}</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th className="check-col" aria-label="Done" /><th>Task</th><th>Tag</th><th>Due</th><th className="action-col" aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {shown.map(t => {
                const late = !t.done && t.dueDate !== null && t.dueDate < today;
                return (
                  <tr key={t.id} className={t.done ? 'done' : ''}>
                    <td className="check-col">
                      <form action={setTaskDone}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="done" value={String(!t.done)} />
                        <button type="submit" className={`check ${t.done ? 'on' : ''}`} aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}>
                          {t.done ? '✓' : ''}
                        </button>
                      </form>
                    </td>
                    <td><span className="title">{t.title}</span></td>
                    <td><span className="badge">{t.tag}</span></td>
                    <td>
                      {t.dueDate ? (
                        <span className={`badge ${late ? 'danger' : ''}`}>
                          {late ? 'Overdue · ' : ''}{t.dueDate}{t.dueTime !== null ? ` ${fmtMinutes(t.dueTime)}` : ''}
                        </span>
                      ) : <span className="muted small">No date</span>}
                    </td>
                    <td className="action-col">
                      <form action={deleteTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="btn ghost sm danger" aria-label={`Delete ${t.title}`}>Delete</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
