import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/AuthForm';
import { getCurrentUser } from '@/lib/session';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/today');
  return <AuthForm mode="login" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} appleEnabled={!!process.env.APPLE_CLIENT_ID} />;
}
