'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, LockKeyhole, Mail, Smartphone, UserRound } from 'lucide-react';
import { COUNTRY_CODES, normalizePhone } from '@/lib/phone';
import { authClient } from '@/lib/auth-client';
import { FREE_FEATURES, PERIOD, PREMIUM_FEATURES, PRICE } from '@/lib/plans';
import { BrandLockup } from './BuddyLogo';

type Mode = 'login' | 'signup';

/** A small sample of the Today page. The items tick off one by one when the page opens. */
const PREVIEW = [
  { time: '07:00', title: 'Morning walk', tag: 'Health' },
  { time: '09:30', title: 'Deep work: project plan', tag: 'Focus' },
  { time: '13:00', title: 'Lunch with Sam', tag: 'Personal' },
  { time: '18:00', title: 'Read 20 pages', tag: 'Growth' },
];

function TodayPreview() {
  return (
    <div className="day-preview" aria-hidden="true">
      <div className="day-preview-head">
        <div>
          <div className="day-preview-title">Today</div>
          <div className="day-preview-sub">3 of 4 done</div>
        </div>
        <svg className="day-ring" viewBox="0 0 44 44" width="44" height="44">
          <circle cx="22" cy="22" r="18" className="day-ring-track" />
          <circle cx="22" cy="22" r="18" className="day-ring-fill" pathLength="100" />
        </svg>
      </div>
      <ul>
        {PREVIEW.map((item, i) => (
          <li key={item.title} className={i < 3 ? 'is-done' : undefined} style={{ ['--i' as string]: i }}>
            <span className="day-check"><Check size={13} strokeWidth={3} /></span>
            <span className="day-time">{item.time}</span>
            <span className="day-title">{item.title}</span>
            <span className="day-tag">{item.tag}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" />
    </svg>
  );
}

function Plans({ signup }: { signup: boolean }) {
  return (
    <div className="plans">
      <section className="plan" aria-label="Free plan">
        <div className="plan-head">
          <h3>Free</h3>
          <div className="plan-price">$0<span>forever</span></div>
        </div>
        <ul className="plan-list">
          {FREE_FEATURES.map(f => <li key={f.title} title={f.detail}><span aria-hidden="true">{f.icon}</span>{f.title}</li>)}
        </ul>
        {signup ? (
          <p className="plan-note">After your trial you can stay on Free, no card needed.</p>
        ) : (
          <Link href="/signup" className="plan-cta plan-cta-ghost">Sign up free</Link>
        )}
      </section>

      <section className="plan plan-premium" aria-label="Premium plan">
        <span className="plan-ribbon">15 days free</span>
        <div className="plan-head">
          <h3>Premium</h3>
          <div className="plan-price">{PRICE}<span>{PERIOD}</span></div>
        </div>
        <p className="plan-lead">Everything in Free, plus:</p>
        <ul className="plan-list">
          {PREMIUM_FEATURES.map(f => <li key={f.title} title={f.detail}><span aria-hidden="true">{f.icon}</span>{f.title}</li>)}
        </ul>
        {signup ? (
          <p className="plan-note">Included free for 15 days with every new account.</p>
        ) : (
          <Link href="/signup" className="plan-cta">Start 15-day free trial</Link>
        )}
      </section>
    </div>
  );
}

export function AuthForm({ mode, googleEnabled, appleEnabled }: { mode: Mode; googleEnabled: boolean; appleEnabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('91');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (signup && !normalizePhone(country, phone)) { setError('Enter a valid mobile number. Indian numbers have 10 digits and start with 6, 7, 8 or 9.'); return; }
    setBusy(true); setError(null);
    const result = signup
      ? await authClient.signUp.email({ name, email, password, callbackURL: '/today' })
      : await authClient.signIn.email({ email, password, callbackURL: '/today' });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      return;
    }
    router.push(signup ? `/welcome?phone=${encodeURIComponent(phone)}&country=${country}` : '/today');
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    const result = await authClient.signIn.social({ provider, callbackURL: '/today' });
    if (result?.error) setError(result.error.message ?? 'Sign-in did not finish.');
  };

  return (
    <div className="auth auth-split">
      <aside className="auth-brand">
        <div className="auth-glow" aria-hidden="true" />
        <BrandLockup size={52} large onDark />

        <div className="auth-hero">
          <h2>Life,<br />organized.</h2>
          <p>Routines, to-dos and notes in one calm place, synced on every device you sign in on.</p>
        </div>

        <TodayPreview />

        <Plans signup={signup} />
      </aside>

      <section className="auth-form">
        <div className="auth-card">
          <div className="auth-card-head">
            <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="muted">{signup ? 'Includes 15 days of Premium, free. No card needed.' : 'Log in to pick up where you left off.'}</p>
          </div>

          {googleEnabled || appleEnabled ? (
            <>
              <div className="social-row">
                {googleEnabled ? <button type="button" className="btn social" onClick={() => void social('google')}><GoogleMark />Google</button> : null}
                {appleEnabled ? <button type="button" className="btn social" onClick={() => void social('apple')}><AppleMark />Apple</button> : null}
              </div>
              <div className="divider">or with email</div>
            </>
          ) : null}

          <form onSubmit={submit} className="auth-stack">
            {signup ? (
              <label className="field">Name
                <span className="input-wrap">
                  <UserRound size={17} aria-hidden="true" />
                  <input className="input" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" placeholder="Your name" />
                </span>
              </label>
            ) : null}
            {signup ? (
              <div className="field">
                <label htmlFor="auth-phone">Mobile number</label>
                <span className="phone-row">
                  <select className="select" value={country} onChange={e => setCountry(e.target.value)} aria-label="Country code">
                    {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                  <span className="input-wrap">
                    <Smartphone size={17} aria-hidden="true" />
                    <input id="auth-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoComplete="tel-national" placeholder="98765 43210" />
                  </span>
                </span>
              </div>
            ) : null}
            <label className="field">Email
              <span className="input-wrap">
                <Mail size={17} aria-hidden="true" />
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
              </span>
            </label>
            <div className="field">
              <span className="field-row">
                <label htmlFor="auth-password">Password</label>
                {!signup ? <Link href="/forgot-password" className="forgot">Forgot password?</Link> : null}
              </span>
              <span className="input-wrap">
                <LockKeyhole size={17} aria-hidden="true" />
                <input id="auth-password" className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                  autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 8 characters' : 'Your password'} />
                <button type="button" className="reveal" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </div>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button className="btn primary block auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
            </button>
          </form>

          <p className="auth-switch">
            {signup ? (
              <>Already have an account? <Link href="/login">Log in</Link></>
            ) : (
              <>New to Amiroon? <Link href="/signup">Create an account</Link></>
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
