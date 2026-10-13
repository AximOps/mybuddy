'use client';

import { useState, type FormEvent } from 'react';
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const result = mode === 'signup'
      ? await authClient.signUp.email({ name, email, password, callbackURL: '/dashboard' })
      : await authClient.signIn.email({ email, password, callbackURL: '/dashboard' });
    setBusy(false);
    if (result.error) { setError(result.error.message ?? 'Something went wrong. Please try again.'); return; }
    router.push('/dashboard');
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    const result = await authClient.signIn.social({ provider, callbackURL: '/dashboard' });
    if (result?.error) setError(result.error.message ?? 'Sign-in did not finish.');
  };

  return (
    <main>
      <h1>{mode === 'signup' ? 'Create your account' : 'Log in'}</h1>
      <p className="muted">{mode === 'signup' ? 'Your personal workspace is created for you.' : 'Welcome back, buddy.'}</p>
      <form onSubmit={submit}>
        {mode === 'signup' ? (
          <>
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
          </>
        ) : null}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <label htmlFor="password">Password (8 or more characters)</label>
        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
      </form>
      {googleEnabled ? <button type="button" onClick={() => void social('google')}>Continue with Google</button> : null}
      {appleEnabled ? <button type="button" onClick={() => void social('apple')}>Continue with Apple</button> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="muted" style={{ marginTop: 22 }}>
        {mode === 'signup' ? <>Already have an account? <a href="/login">Log in</a></> : <>New here? <a href="/signup">Create an account</a></>}
      </p>
    </main>
  );
}
