import { TAGS, type PlannerNote } from '@/lib/planner';

/** Shared form for creating and editing a note. Works with plain server actions, no client JavaScript. */
export function NoteForm({ action, submitLabel, note }: { action: (formData: FormData) => Promise<void>; submitLabel: string; note?: PlannerNote }) {
  return (
    <form action={action} className="stack">
      {note ? <input type="hidden" name="id" value={note.id} /> : null}
      <label>Title<input name="title" maxLength={200} defaultValue={note?.title ?? ''} /></label>
      <label>Tag
        <select name="tag" defaultValue={note?.tag ?? 'Personal'}>
          {TAGS.map(t => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label>Note<textarea name="body" rows={12} defaultValue={note?.body ?? ''} /></label>
      <label className="check-row"><input type="checkbox" name="pinned" defaultChecked={note?.pinned ?? false} /> Pin to top</label>
      <button className="primary" type="submit">{submitLabel}</button>
    </form>
  );
}
