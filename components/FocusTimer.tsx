'use client';

import { useEffect, useState } from 'react';

type Session = { title: string; minutes: number; endAt: number | null; remainingSec: number | null };
const KEY = 'mybuddy.focus.v1';
const PRESETS = [15, 25, 45, 60, 90];
const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/**
 * Browser focus timer. The running timer is kept in this browser (localStorage), so it survives a
 * page refresh. A finished session is recorded to the account through the record() server action.
 * Stopping early discards the session and records nothing.
 */
export function FocusTimer({ record }: { record: (formData: FormData) => Promise<void> }) {
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(0);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(25);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch { /* ignore a damaged saved timer */ }
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const save = (next: Session | null) => {
    setSession(next);
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  };

  const running = session?.endAt != null;
  const remaining = session
    ? running ? Math.max(0, Math.ceil(((session.endAt as number) - now) / 1000)) : session.remainingSec ?? 0
    : 0;
  const total = session ? session.minutes * 60 : 0;
  const progress = total ? 1 - remaining / total : 0;
  const finished = running && remaining === 0;

  useEffect(() => {
    if (!finished || !session) return;
    const fd = new FormData();
    fd.set('title', session.title);
    fd.set('minutes', String(session.minutes));
    void record(fd);
    save(null);
    setMessage(`Focus complete: ${session.minutes} minutes${session.title ? ` on ${session.title}` : ''}. Well done.`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Focus complete', { body: session.title || 'Time for a break.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  useEffect(() => {
    document.title = session ? `${clock(remaining)} · My Buddy` : 'Focus · My Buddy';
  }, [remaining, session]);

  const start = () => {
    setMessage(null);
    save({ title: title.trim(), minutes, endAt: Date.now() + minutes * 60000, remainingSec: null });
  };
  const pause = () => session && save({ ...session, endAt: null, remainingSec: remaining });
  const resume = () => session && save({ ...session, endAt: Date.now() + (session.remainingSec ?? 0) * 1000, remainingSec: null });
  const stop = () => save(null);

  if (!session) {
    return (
      <section className="card card-body" style={{ maxWidth: 560 }}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="focus-title">What are you working on?</label>
          <input id="focus-title" className="input" value={title} maxLength={60} placeholder="Optional, e.g. Write the report" onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 18 }}>
          <span>Duration</span>
          <div className="actions">
            {PRESETS.map(m => (
              <button key={m} type="button" className={`btn sm ${minutes === m ? 'primary' : ''}`} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn primary block" style={{ height: 40 }} onClick={start}>Start {minutes}-minute focus</button>
        {message ? <p className="small" role="status" style={{ marginTop: 14, color: 'var(--success)' }}>{message}</p> : null}
        <p className="small muted" style={{ marginTop: 14 }}>The timer keeps running if you refresh this page. Finished sessions count in Stats.</p>
      </section>
    );
  }

  return (
    <section className="card card-body" style={{ maxWidth: 560, textAlign: 'center' }}>
      <div className="small muted">{running ? 'Focusing' : 'Paused'}{session.title ? ` · ${session.title}` : ''}</div>
      <div style={{ fontSize: 64, fontWeight: 650, letterSpacing: '-0.02em', fontVariant: 'tabular-nums', margin: '12px 0' }} aria-live="polite">
        {clock(remaining)}
      </div>
      <div className="progress" aria-hidden="true"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <div className="actions" style={{ justifyContent: 'center', marginTop: 22 }}>
        <button type="button" className="btn primary" onClick={running ? pause : resume}>{running ? 'Pause' : 'Resume'}</button>
        <button type="button" className="btn" onClick={stop}>Stop (not counted)</button>
      </div>
      {'Notification' in globalThis && Notification.permission === 'default' ? (
        <button type="button" className="btn ghost sm" style={{ marginTop: 14 }} onClick={() => void Notification.requestPermission()}>Allow notifications when time is up</button>
      ) : null}
    </section>
  );
}
