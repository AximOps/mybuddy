import Link from 'next/link';
import { AddDialog } from '@/components/AddDialog';
import { createNote, deleteNote, updateNote } from '@/app/actions';
import { NoteForm } from '@/components/NoteForm';
import { withUser } from '@/lib/db';
import { getNote, listNotes, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { tagOptions } from '@/lib/tags';
import { inputInZone, isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string; new?: string }> }) {
  const user = await getCurrentUser();
  const { q = '', id, new: creating } = await searchParams;
  const query = q.trim().slice(0, 100);

  const data = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const selected = id && isUuid(id) ? await getNote(c, ws, id) : null;
    const items = selected
      ? (await c.query<{ id: string; text: string; done: boolean }>(
          `select id, text, done from note_items where note_id = $1 order by sort_order, created_at`, [selected.id])).rows
      : [];
    return {
      notes: await listNotes(c, ws, query),
      selected,
      items,
      tags: await tagOptions(c, user!.id, 'note'),
      timezone: settings.timezone,
    };
  });
  const keep = query ? `&q=${encodeURIComponent(query)}` : '';

  const quickNote = (
    <form action={createNote} className="form-grid">
      <label className="field span-12">Title<input className="input" name="title" maxLength={200} placeholder="e.g. Gift ideas" /></label>
      <label className="field span-12">Note<textarea name="body" rows={5} placeholder="Start writing…" /></label>
      <label className="field span-6">Tag
        <select className="select" name="tag" defaultValue="Personal">
          {data.tags.map(t => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="field span-6">Remind me at (optional)<input className="input" type="datetime-local" name="reminderAt" /></label>
      <label className="check-row span-6" style={{ alignSelf: 'center' }}><input type="checkbox" name="pinned" /> Pin to top</label>
      <div className="span-6" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Save note</button></div>
    </form>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notes</h1>
          <p>{data.notes.length} {data.notes.length === 1 ? 'note' : 'notes'}</p>
        </div>
        <div className="actions">
          <form method="get" style={{ display: 'flex' }}>
            <input className="input" name="q" defaultValue={query} placeholder="Search notes" aria-label="Search notes" style={{ width: 240 }} />
          </form>
          <Link className="btn primary" href="/notes?new=1">+ New note</Link>
        </div>
      </div>

      <section className="card split">
        <div className="list-pane">
          {data.notes.length === 0 ? (
            query ? <div className="empty">No notes match your search.</div>
              : <AddDialog title="New note" label="Add a note" text="No notes yet. Tap + to write one.">{quickNote}</AddDialog>
          ) : data.notes.map(n => (
            <Link key={n.id} href={`/notes?id=${n.id}${keep}`} className="note-item" aria-current={data.selected?.id === n.id ? 'true' : undefined}>
              <strong>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled'}</strong>
              <div className="snip">{n.body || 'No text'}</div>
              <div className="small muted" style={{ marginTop: 6 }}><span className="badge">{n.tag}</span></div>
            </Link>
          ))}
        </div>
        <div className="editor-pane">
          {creating ? (
            <NoteForm action={createNote} submitLabel="Create note" tags={data.tags} />
          ) : data.selected ? (
            <>
              <NoteForm action={updateNote} submitLabel="Save changes" note={data.selected} tags={data.tags} items={data.items}
                reminder={inputInZone(data.selected.reminderAt, data.timezone)} />
              <form action={deleteNote} style={{ padding: '0 28px 24px' }}>
                <input type="hidden" name="id" value={data.selected.id} />
                <button type="submit" className="btn danger">Delete note</button>
              </form>
            </>
          ) : (
            <AddDialog title="New note" label="Add a note" text="Select a note on the left, or tap + to write a new one." style={{ paddingTop: 120 }}>{quickNote}</AddDialog>
          )}
        </div>
      </section>
    </>
  );
}
