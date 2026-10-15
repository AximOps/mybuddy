'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { FREE_FEATURES, PERIOD, PREMIUM_FEATURES, PRICE } from '@/lib/plans';
import { BrandLockup } from './BuddyLogo';

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
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      return;
    }
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
        <div className="auth-orb auth-orb-a" aria-hidden="true" />
        <div className="auth-orb auth-orb-b" aria-hidden="true" />
        <BrandLockup size={64} large onDark />

        <div className="auth-hero">
          <span className="eyebrow">Your daily companion</span>
          <h2>Plan your day, buddy.</h2>
          <p>Routines, tasks, notes and focus time in one place, on every device you sign in on.</p>
        </div>

        <div className="pricing">
          <div className="price-card featured">
            <div className="price-flag">15-day free trial</div>
            <div className="price-name">Premium</div>
            <div className="price-value">{PRICE}<span> {PERIOD}</span></div>
            <p className="price-lead">Everything on My Buddy: spending, student planner, work, invoices and teams.</p>
            <ul className="check-list">
              {PREMIUM_FEATURES.map(f => <li key={f.title}>{f.title}</li>)}
            </ul>
            <Link href="/signup" className="btn price-cta">Start your 15-day free trial <span aria-hidden="true">→</span></Link>
          </div>
          <div className="price-card">
            <div className="price-name">Free</div>
            <div className="price-value">$0</div>
            <ul className="check-list">
              <li>Daily routines and To-Do</li><li>Notes and focus timer</li><li>Stats and data download</li>
            </ul>
          </div>
        </div>

        <div className="tiles">
          <div className="tile-group-label">Premium features</div>
          {PREMIUM_FEATURES.map(f => (
            <div key={f.title} className="tile premium">
              <span className="tile-icon" aria-hidden="true">{f.icon}</span>
              <div><strong>{f.title}</strong><span>{f.detail}</span></div>
            </div>
          ))}
          <div className="tile-group-label">Free features</div>
          {FREE_FEATURES.map(f => (
            <div key={f.title} className="tile">
              <span className="tile-icon" aria-hidden="true">{f.icon}</span>
              <div><strong>{f.title}</strong><span>{f.detail}</span></div>
            </div>
          ))}
        </div>
      </aside>

      <section className="auth-form">
        <div className="auth-card">
          <div>
            <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="muted" style={{ marginTop: 6 }}>{signup ? 'Your personal workspace is created for you.' : 'Log in to pick up where you left off.'}</p>
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
            {!signup ? <Link href="/forgot-password" className="small muted forgot">Forgot password?</Link> : null}
            <button className="btn primary block auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
            </button>
          </form>

          {googleEnabled || appleEnabled ? <div className="divider">or continue with</div> : null}
          {googleEnabled ? <button type="button" className="btn block social" onClick={() => void social('google')}>Google</button> : null}
          {appleEnabled ? <button type="button" className="btn block social" onClick={() => void social('apple')}>Apple</button> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}

          <div className="cta-divider" />
          {signup ? (
            <Link href="/login" className="btn cta">Already have an account? <strong>Log in</strong></Link>
          ) : (
            <Link href="/signup" className="btn cta">New here? <strong>Create an account</strong> <span aria-hidden="true">→</span></Link>
          )}
        </div>
      </section>
    </div>
  );
}
