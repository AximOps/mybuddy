import { TAGS, type PlannerNote } from '@/lib/planner';

/** Note editor used in the Notes split view. Plain server-action form, no client JavaScript needed. */
export function NoteForm({ action, submitLabel, note }: { action: (formData: FormData) => Promise<void>; submitLabel: string; note?: PlannerNote }) {
  return (
    <form action={action} className="editor">
      {note ? <input type="hidden" name="id" value={note.id} /> : null}
      <input className="input title-input" name="title" maxLength={200} placeholder="Untitled" defaultValue={note?.title ?? ''} aria-label="Note title" />
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div className="actions">
          <label className="field">
            Tag
            <select className="select" name="tag" defaultValue={note?.tag ?? 'Personal'} style={{ width: 160 }}>
              {TAGS.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="check-row"><input type="checkbox" name="pinned" defaultChecked={note?.pinned ?? false} /> Pin to top</label>
        </div>
        <button className="btn primary" type="submit">{submitLabel}</button>
      </div>
      <textarea name="body" placeholder="Start writing…" defaultValue={note?.body ?? ''} aria-label="Note text" />
    </form>
  );
}
