import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getCurrentUser } from '@/lib/session';

/** ?next=/some/page returns there after logging in (pages on this site only, e.g. the Autopilot connect page). */
const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : undefined);

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next ?? '/today');
  return <AuthForm mode="login" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} appleEnabled={!!process.env.APPLE_CLIENT_ID} next={next} />;
}
