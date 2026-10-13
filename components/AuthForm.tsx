'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

type Mode = 'login' | 'signup';

export function AuthForm({ mode, googleEnabled, appleEnabled }: { mode: Mode; googleEnabled: boolean; appleEnabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const result = signup
      ? await authClient.signUp.email({ name, email, password, callbackURL: '/today' })
      : await authClient.signIn.email({ email, password, callbackURL: '/today' });
    setBusy(false);
    if (result.error) { setError(result.error.message ?? 'Something went wrong. Please try again.'); return; }
    router.push('/today');
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    const result = await authClient.signIn.social({ provider, callbackURL: '/today' });
    if (result?.error) setError(result.error.message ?? 'Sign-in did not finish.');
  };

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" style={{ background: '#fff', color: 'var(--accent)' }} aria-hidden="true">🙂</span>
          My Buddy
        </div>
        <div>
          <h2>Plan your day, buddy.</h2>
          <p style={{ marginTop: 14 }}>Routines, tasks, notes and focus time in one place, with the same data on every device you sign in on.</p>
        </div>
        <p className="small">Your plans are private. Only you can see them.</p>
      </aside>

      <div className="auth-form">
        <div className="auth-card">
          <div>
            <h1>{signup ? 'Create your account' : 'Log in'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{signup ? 'Your personal workspace is created for you.' : 'Welcome back.'}</p>
          </div>

          <form onSubmit={submit} className="auth-card" style={{ gap: 14 }}>
            {signup ? (
              <label className="field">Name
                <input className="input" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
              </label>
            ) : null}
            <label className="field">Email
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="field">Password{signup ? ' (8 or more characters)' : ''}
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                autoComplete={signup ? 'new-password' : 'current-password'} />
            </label>
            <button className="btn primary block" type="submit" disabled={busy} style={{ height: 40 }}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
            </button>
          </form>

          {googleEnabled || appleEnabled ? <div className="divider">or</div> : null}
          {googleEnabled ? <button type="button" className="btn block" style={{ height: 40 }} onClick={() => void social('google')}>Continue with Google</button> : null}
          {appleEnabled ? <button type="button" className="btn block" style={{ height: 40 }} onClick={() => void social('apple')}>Continue with Apple</button> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}

          <p className="muted small">
            {signup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New here? <Link href="/signup">Create an account</Link></>}
          </p>
        </div>
      </div>
    </div>
  );
}
