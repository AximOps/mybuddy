'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { BrandLockup } from './BuddyLogo';

export function ResetForm({ token, linkError }: { token: string | null; linkError: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const invalid = !token || linkError;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    const result = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (result.error) { setError(result.error.message ?? 'This link is no longer valid. Request a new one.'); return; }
    setDone(true);
    setTimeout(() => router.push('/login'), 2500);
  };

  return (
    <div className="auth auth-solo">
      <section className="auth-form">
        <div className="auth-card">
          <BrandLockup size={44} />
          {invalid ? (
            <>
              <h1>This link has expired</h1>
              <p className="muted">Reset links work once and expire after one hour. Request a new one.</p>
              <Link href="/forgot-password" className="btn primary block auth-submit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Request a new link</Link>
            </>
          ) : done ? (
            <>
              <h1>Password updated</h1>
              <p className="muted">You can log in with your new password. Taking you to the login page…</p>
            </>
          ) : (
            <>
              <div>
                <h1>Choose a new password</h1>
                <p className="muted" style={{ marginTop: 6 }}>At least 8 characters. Every other signed-in device will be signed out.</p>
              </div>
              <form onSubmit={submit} className="auth-stack">
                <label className="field">New password
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                </label>
                <label className="field">Confirm new password
                  <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
                </label>
                <button className="btn primary block auth-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
              </form>
              {error ? <p className="error" role="alert">{error}</p> : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
