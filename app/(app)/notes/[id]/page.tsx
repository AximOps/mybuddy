import { redirect } from 'next/navigation';
import { isUuid } from '@/lib/time';

export default async function NoteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(isUuid(id) ? `/notes?id=${id}` : '/notes');
}
