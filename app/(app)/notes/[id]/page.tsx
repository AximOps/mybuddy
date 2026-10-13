import { notFound } from 'next/navigation';
import { deleteNote, updateNote } from '@/app/actions';
import { NoteForm } from '@/components/NoteForm';
import { withUser } from '@/lib/db';
import { getNote, personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const note = await withUser(user!.id, async c => getNote(c, await personalWorkspaceId(c, user!.id), id));
  if (!note) notFound();

  return (
    <>
      <h1>Edit note</h1>
      <NoteForm action={updateNote} submitLabel="Save changes" note={note} />
      <form action={deleteNote} className="danger-zone">
        <input type="hidden" name="id" value={note.id} />
        <button type="submit" className="danger">Delete note</button>
      </form>
    </>
  );
}
