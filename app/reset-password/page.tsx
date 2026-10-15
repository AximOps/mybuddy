import { ResetForm } from '@/components/ResetForm';

export const dynamic = 'force-dynamic';

/** Better Auth sends the person here with ?token=... after they open the emailed link. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetForm token={token ?? null} linkError={error === 'INVALID_TOKEN' || !!error} />;
}
