'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { BuddyLogo } from './BuddyLogo';
import { FREE_FEATURES, PERIOD, PREMIUM_FEATURES, PRICE } from '@/lib/plans';

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
          <BuddyLogo size={36} />
          <span className="brand-name">My Buddy</span>
        </div>

        <div className="auth-hero">
          <h2>Plan your day, buddy.</h2>
          <p>Routines, tasks, notes and focus time in one place, on every device you sign in on.</p>
        </div>

        <div className="feature-block">
          <div className="feature-title">Free</div>
          <ul className="feature-list">
            {FREE_FEATURES.map(f => (
              <li key={f.title}><span aria-hidden="true">{f.icon}</span><div><strong>{f.title}</strong><span>{f.detail}</span></div></li>
            ))}
          </ul>
        </div>

        <div className="feature-block">
          <div className="feature-title">Premium</div>
          <ul className="feature-list">
            {PREMIUM_FEATURES.map(f => (
              <li key={f.title}><span aria-hidden="true">{f.icon}</span><div><strong>{f.title}</strong><span>{f.detail}</span></div></li>
            ))}
          </ul>
        </div>

        <div className="pricing">
          <div className="price-card">
            <div className="price-name">Free</div>
            <div className="price-value">$0</div>
            <div className="price-note">The daily planner, for everyone.</div>
          </div>
          <div className="price-card featured">
            <div className="price-name">Premium</div>
            <div className="price-value">{PRICE}<span> {PERIOD}</span></div>
            <div className="price-note">Spending, student, work and teams.</div>
          </div>
        </div>
      </aside>

      <div className="auth-form">
        <div className="auth-card">
          <div>
            <h1>{signup ? 'Create your account' : 'Log in'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{signup ? 'Your personal workspace is created for you.' : 'Welcome back.'}</p>
          </div>

          <form onSubmit={submit} className="auth-stack">
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
