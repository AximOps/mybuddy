import { deleteChecklistItem, addChecklistItem, toggleChecklistItem } from '@/app/actions';
import type { PlannerNote } from '@/lib/planner';

export interface ChecklistItem { id: string; text: string; done: boolean }

/** Note editor for the Notes split view. Plain server-action forms, no client JavaScript needed. */
export function NoteForm({
  action, submitLabel, note, tags, items = [], reminder = '',
}: {
  action: (formData: FormData) => Promise<void>; submitLabel: string; note?: PlannerNote;
  tags: string[]; items?: ChecklistItem[]; reminder?: string;
}) {
  return (
    <>
      <form action={action} className="editor">
        {note ? <input type="hidden" name="id" value={note.id} /> : null}
        <input className="input title-input" name="title" maxLength={200} placeholder="Untitled" defaultValue={note?.title ?? ''} aria-label="Note title" />
        <div className="form-grid">
          <label className="field span-4">Tag
            <select className="select" name="tag" defaultValue={note?.tag ?? 'Personal'}>
              {tags.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field span-4">New tag (optional)<input className="input" name="newTag" maxLength={20} placeholder="e.g. Recipes" /></label>
          <label className="field span-4">Remind me at<input className="input" type="datetime-local" name="reminderAt" defaultValue={reminder} /></label>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <label className="check-row"><input type="checkbox" name="pinned" defaultChecked={note?.pinned ?? false} /> Pin to top</label>
          <button className="btn primary" type="submit">{submitLabel}</button>
        </div>
        <textarea name="body" placeholder="Start writing…" defaultValue={note?.body ?? ''} aria-label="Note text" />
      </form>

      {note ? (
        <section className="card" style={{ margin: '0 28px 24px' }}>
          <div className="card-head"><h2>Checklist</h2><span className="muted small">{items.filter(i => i.done).length} of {items.length} done</span></div>
          {items.length === 0 ? <div className="empty" style={{ padding: 16 }}>No items yet.</div> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map(i => (
                <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--line)' }}>
                  <form action={toggleChecklistItem}>
                    <input type="hidden" name="id" value={i.id} />
                    <button type="submit" className={`check ${i.done ? 'on' : ''}`} aria-label={i.done ? `Undo ${i.text}` : `Complete ${i.text}`}>{i.done ? '✓' : ''}</button>
                  </form>
                  <span style={{ flex: 1, textDecoration: i.done ? 'line-through' : 'none', color: i.done ? 'var(--muted)' : 'var(--ink)' }}>{i.text}</span>
                  <form action={deleteChecklistItem}>
                    <input type="hidden" name="id" value={i.id} />
                    <button type="submit" className="btn ghost sm danger" aria-label={`Remove ${i.text}`}>Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={addChecklistItem} className="actions" style={{ padding: 16 }}>
            <input type="hidden" name="noteId" value={note.id} />
            <input className="input" name="text" maxLength={200} placeholder="Add an item" aria-label="New checklist item" required style={{ flex: 1 }} />
            <button className="btn" type="submit">Add</button>
          </form>
        </section>
      ) : null}
    </>
  );
}
