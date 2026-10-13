import { redirect } from 'next/navigation';

export default function NewNoteRedirect() {
  redirect('/notes?new=1');
}
