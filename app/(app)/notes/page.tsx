import Link from 'next/link';
import { withUser } from '@/lib/db';
import { listNotes, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  const { q = '' } = await searchParams;
  const query = q.trim().slice(0, 100);
  const notes = await withUser(user!.id, async c => listNotes(c, await personalWorkspaceId(c, user!.id), query));

  return (
    <>
      <div className="toolbar">
        <h1>Notes</h1>
        <Link href="/notes/new" className="button primary">+ New note</Link>
      </div>
      <form method="get" className="search">
        <input name="q" defaultValue={query} placeholder="Search notes" aria-label="Search notes" />
      </form>
      {notes.length === 0 ? <p className="muted">{query ? 'No notes match.' : 'No notes yet.'}</p> : null}
      <ul className="cards">
        {notes.map(n => (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} className="note">
              <strong>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled'}</strong>
              {n.body ? <span className="muted clamp">{n.body}</span> : null}
              <span className="pill">{n.tag}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
