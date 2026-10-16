'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';

/**
 * Reminders in the browser. While My Buddy is open (a tab, or the installed app), it fetches the
 * next timed items and shows a notification a few minutes before each one. Settings live in this
 * browser, so each device can choose its own.
 */
type Prefs = { enabled: boolean; lead: number; routines: boolean };
type Item = { key: string; kind: string; title: string; body: string; at: number; href: string };
const PREFS = 'mybuddy.reminders.v1';
const SENT = 'mybuddy.reminders.sent.v1';
const DEFAULTS: Prefs = { enabled: false, lead: 10, routines: false };

function readPrefs(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }; } catch { return DEFAULTS; }
}
function readSent(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SENT) ?? '{}'); } catch { return {}; }
}

async function show(title: string, body: string, href: string, tag: string) {
  const opts: NotificationOptions & { data?: unknown } = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { href } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch { /* fall back below */ }
  const n = new Notification(title, opts);
  n.onclick = () => { window.focus(); window.location.href = href; };
}

/** Mounted once in the app layout. Renders nothing. */
export function Notifier() {
  useEffect(() => {
    let timers: number[] = [];
    let stopped = false;
    const plan = async () => {
      timers.forEach(clearTimeout); timers = [];
      const prefs = readPrefs();
      if (!prefs.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
      let items: Item[] = [];
      try { items = (await (await fetch('/api/upcoming', { cache: 'no-store' })).json()).items ?? []; } catch { return; }
      if (stopped) return;
      const sent = readSent();
      const now = Date.now();
      for (const it of items) {
        if (it.kind === 'routine' && !prefs.routines) continue;
        const fireAt = it.at - prefs.lead * 60_000;
        if (sent[it.key] || it.at < now || fireAt - now > 6 * 3600_000) continue;
        timers.push(window.setTimeout(() => {
          const s = readSent();
          if (s[it.key]) return;           // another tab already sent it
          s[it.key] = Date.now();
          for (const k of Object.keys(s)) if (Date.now() - s[k] > 2 * 86400_000) delete s[k];
          localStorage.setItem(SENT, JSON.stringify(s));
          const lead = Math.round((it.at - Date.now()) / 60_000);
          void show(it.title, `${lead > 0 ? `In ${lead} min · ` : 'Now · '}${it.body}`, it.href, it.key);
        }, Math.max(0, fireAt - now)));
      }
    };
    void plan();
    const every = window.setInterval(() => void plan(), 5 * 60_000);
    const onChange = () => void plan();
    window.addEventListener('mybuddy:reminders', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => { stopped = true; timers.forEach(clearTimeout); clearInterval(every); window.removeEventListener('mybuddy:reminders', onChange); document.removeEventListener('visibilitychange', onChange); };
  }, []);
  return null;
}

/** The Reminders card in Settings. */
export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => {
    setPrefs(readPrefs());
    setPermission('Notification' in window ? Notification.permission : 'unsupported');
  }, []);
  const update = (next: Prefs) => {
    setPrefs(next);
    localStorage.setItem(PREFS, JSON.stringify(next));
    window.dispatchEvent(new Event('mybuddy:reminders'));
  };
  const enable = async () => {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === 'granted') update({ ...prefs, enabled: true });
  };

  if (permission === 'unsupported') return <p className="small muted">This browser cannot show notifications. On iPhone, add My Buddy to your Home Screen first, then open it from there.</p>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted">Get a notification before meetings, to-dos with a time, classes and note reminders. Reminders come while My Buddy is open in a tab or as the installed app on this device.</p>
      {permission === 'denied' ? (
        <p className="small" style={{ color: 'var(--danger)' }}>Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.</p>
      ) : prefs.enabled && permission === 'granted' ? (
        <>
          <div className="form-grid">
            <label className="field span-6">Remind me
              <select className="select" value={prefs.lead} onChange={e => update({ ...prefs, lead: Number(e.target.value) })}>
                {[0, 5, 10, 15, 30, 60].map(m => <option key={m} value={m}>{m === 0 ? 'At the start time' : `${m} minutes before`}</option>)}
              </select>
            </label>
            <label className="check-row span-6" style={{ alignSelf: 'center' }}>
              <input type="checkbox" checked={prefs.routines} onChange={e => update({ ...prefs, routines: e.target.checked })} /> Also for routine activities
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => void show('🔔 Test reminder', 'Reminders are working on this device.', '/today', 'test')}><Bell size={15} /> Send a test</button>
            <button type="button" className="btn sm ghost danger" onClick={() => update({ ...prefs, enabled: false })}><BellOff size={15} /> Turn off on this device</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => void enable()}><Bell size={16} /> Turn on reminders</button>
      )}
    </div>
  );
}
