import Link from 'next/link';
import { createNote, deleteNote, updateNote } from '@/app/actions';
import { NoteForm } from '@/components/NoteForm';
import { withUser } from '@/lib/db';
import { getNote, listNotes, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; id?: string; new?: string }> }) {
  const user = await getCurrentUser();
  const { q = '', id, new: creating } = await searchParams;
  const query = q.trim().slice(0, 100);
  const { notes, selected } = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    return {
      notes: await listNotes(c, ws, query),
      selected: id && isUuid(id) ? await getNote(c, ws, id) : null,
    };
  });
  const keep = query ? `&q=${encodeURIComponent(query)}` : '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notes</h1>
          <p>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</p>
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
          {notes.length === 0 ? (
            <div className="empty">{query ? 'No notes match your search.' : 'No notes yet.'}</div>
          ) : notes.map(n => (
            <Link key={n.id} href={`/notes?id=${n.id}${keep}`} className="note-item" aria-current={selected?.id === n.id ? 'true' : undefined}>
              <strong>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled'}</strong>
              <div className="snip">{n.body || 'No text'}</div>
              <div className="small muted" style={{ marginTop: 6 }}><span className="badge">{n.tag}</span></div>
            </Link>
          ))}
        </div>
        <div className="editor-pane">
          {creating ? (
            <NoteForm action={createNote} submitLabel="Create note" />
          ) : selected ? (
            <>
              <NoteForm action={updateNote} submitLabel="Save changes" note={selected} />
              <form action={deleteNote} style={{ padding: '0 28px 24px' }}>
                <input type="hidden" name="id" value={selected.id} />
                <button type="submit" className="btn danger">Delete note</button>
              </form>
            </>
          ) : (
            <div className="empty" style={{ paddingTop: 120 }}>Select a note on the left, or create a new one.</div>
          )}
        </div>
      </section>
    </>
  );
}
