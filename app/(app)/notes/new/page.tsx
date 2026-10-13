import { createNote } from '@/app/actions';
import { NoteForm } from '@/components/NoteForm';

export default function NewNotePage() {
  return (
    <>
      <h1>New note</h1>
      <NoteForm action={createNote} submitLabel="Create note" />
    </>
  );
}
