import Link from 'next/link';
import { acceptInvitation } from '@/app/actions';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();

  return (
    <div className="auth">
      <div className="auth-form">
        <div className="auth-card">
          <h1>Join the organisation</h1>
          {error ? <p className="error" role="alert">{error}</p> : null}
          {user ? (
            <>
              <p className="muted">Signed in as {user.email}. This invitation works only for the email address it was sent to.</p>
              <form action={acceptInvitation} className="stack" style={{ gap: 12 }}>
                <input type="hidden" name="token" value={token} />
                <button className="btn primary block" type="submit" style={{ height: 40 }}>Accept invitation</button>
              </form>
            </>
          ) : (
            <>
              <p className="muted">Log in or create an account with the invited email address, then open this link again.</p>
              <Link className="btn primary block" href="/login" style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Log in</Link>
              <Link className="btn block" href="/signup" style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Create an account</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
