'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { BrandLockup } from './BuddyLogo';

/** Asks for the account email and sends a reset link. Always shows the same reply, so it does not reveal who has an account. */
export function ForgotForm({ mailConfigured }: { mailConfigured: boolean }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setBusy(false);
    if (result.error) { setError('Something went wrong. Please try again in a moment.'); return; }
    setSent(true);
  };

  return (
    <div className="auth auth-solo">
      <section className="auth-form">
        <div className="auth-card">
          <BrandLockup size={44} />
          <div>
            <h1>Forgot your password?</h1>
            <p className="muted" style={{ marginTop: 6 }}>Enter the email you signed up with and we will send you a link to choose a new password.</p>
          </div>
          {!mailConfigured ? <p className="small" style={{ color: 'var(--warn)' }}>Email sending is not set up yet. Please contact support to reset your password.</p> : null}
          {sent ? (
            <p role="status" className="small">If an account exists for <strong>{email}</strong>, a reset link is on its way. The link expires in one hour and works once. Check your spam folder if it does not arrive.</p>
          ) : (
            <form onSubmit={submit} className="auth-stack">
              <label className="field">Email
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </label>
              <button className="btn primary block auth-submit" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </form>
          )}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="cta-divider" />
          <Link href="/login" className="btn cta">Back to <strong>log in</strong></Link>
        </div>
      </section>
    </div>
  );
}
