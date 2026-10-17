'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFocus } from './FocusProvider';
import { buzz, playSound, systemNotify, unlockAudioOnGesture, type SoundId } from './sound';

/**
 * The focus tools that run in the background on every page: regular break reminders, alarms,
 * a stopwatch, and ringing for timed reminders. Everything lives in this browser (localStorage),
 * so it survives refreshes and page changes, and open tabs stay in step. A lock makes sure only
 * one tab rings for each event. Like other browser reminders, they need Amiroon open in a tab or
 * as the installed app.
 */

export type BreakPrefs = { enabled: boolean; everyMin: number; breakMin: number; pauseDuringFocus: boolean; useHours: boolean; from: string; to: string; sound: SoundId };
type BreakState = { nextAt: number | null; breakEndAt: number | null; pausedLeft: number | null };
export type Alarm = { id: string; time: string; label: string; days: number[]; enabled: boolean; sound: SoundId; snoozeMin: number; snoozeUntil: number | null; lastFired: string | null };
export type Stopwatch = { startedAt: number | null; accMs: number; laps: number[] };
export type ToolAlert = { id: string; kind: 'break' | 'breakEnd' | 'alarm' | 'reminder'; title: string; body: string; sound: SoundId; loop: boolean; alarmId?: string; href?: string };
type Upcoming = { key: string; kind: string; title: string; body: string; at: number; href: string };

const K = {
  breakPrefs: 'mybuddy.breaks.prefs.v1', breakState: 'mybuddy.breaks.state.v1', alarms: 'mybuddy.alarms.v1',
  stopwatch: 'mybuddy.stopwatch.v1', ring: 'mybuddy.reminders.ring.v1', rung: 'mybuddy.reminders.rung.v1', lock: 'mybuddy.tools.lock.v1',
};
const NOTIFIER_SENT = 'mybuddy.reminders.sent.v1';
export const DEFAULT_BREAKS: BreakPrefs = { enabled: false, everyMin: 45, breakMin: 5, pauseDuringFocus: true, useHours: false, from: '09:00', to: '18:00', sound: 'chime' };
const NO_BREAK: BreakState = { nextAt: null, breakEndAt: null, pausedLeft: null };
const NO_STOPWATCH: Stopwatch = { startedAt: null, accMs: 0, laps: [] };

function load<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}
function loadList<T>(key: string): T[] {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
/** First tab to claim an event key rings for it. */
function claim(key: string): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(K.lock) ?? '{}') as Record<string, number>;
    if (map[key]) return false;
    const now = Date.now();
    for (const k of Object.keys(map)) if (now - map[k] > 2 * 86_400_000) delete map[k];
    map[key] = now;
    localStorage.setItem(K.lock, JSON.stringify(map));
    return true;
  } catch { return true; }
}

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function atToday(hm: string, base = new Date()) { const d = new Date(base); d.setHours(Math.floor(toMin(hm) / 60), toMin(hm) % 60, 0, 0); return d.getTime(); }
function inHours(p: BreakPrefs, now: number) {
  if (!p.useHours) return true;
  const d = new Date(now), m = d.getHours() * 60 + d.getMinutes(), a = toMin(p.from), b = toMin(p.to);
  return a <= b ? m >= a && m < b : m >= a || m < b;
}
function nextWindowStart(p: BreakPrefs, now: number) {
  const t = atToday(p.from, new Date(now));
  return t > now ? t : t + 86_400_000;
}
/** An alarm whose time already passed today counts as fired today, so saving it never rings at once. */
function arm(a: Alarm): Alarm {
  const now = new Date();
  return { ...a, snoozeUntil: null, lastFired: atToday(a.time, now) <= now.getTime() ? `${dayKey(now)} ${a.time}` : a.lastFired };
}
export function nextAlarmAt(a: Alarm, from = Date.now()): number | null {
  if (!a.enabled) return null;
  if (a.snoozeUntil && a.snoozeUntil > from) return a.snoozeUntil;
  for (let i = 0; i < 8; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i);
    const t = atToday(a.time, d);
    if (t <= from || (a.lastFired === `${dayKey(d)} ${a.time}`)) continue;
    if (a.days.length === 0 || a.days.includes(d.getDay())) return t;
  }
  return null;
}

interface ToolsApi {
  now: number;
  breaks: BreakPrefs; breakState: BreakState;
  setBreaks: (p: Partial<BreakPrefs>) => void; startBreak: () => void; endBreak: () => void; snoozeBreak: (min?: number) => void; resetBreakTimer: () => void;
  alarms: Alarm[]; saveAlarm: (a: Omit<Alarm, 'id' | 'snoozeUntil' | 'lastFired' | 'enabled'> & { id?: string }) => void; toggleAlarm: (id: string, on: boolean) => void; removeAlarm: (id: string) => void;
  stopwatch: Stopwatch; swStart: () => void; swPause: () => void; swReset: () => void; swLap: () => void;
  ringReminders: boolean; setRingReminders: (on: boolean) => void; refreshReminders: () => void; upcomingReminders: Upcoming[];
  alert: ToolAlert | null; dismissAlert: () => void; snoozeAlarmAlert: () => void; previewSound: (s: SoundId) => void;
}
const Ctx = createContext<ToolsApi | null>(null);
export const useTools = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTools must be inside ToolsProvider');
  return c;
};
export const swElapsed = (s: Stopwatch, now: number) => s.accMs + (s.startedAt ? now - s.startedAt : 0);

export function ToolsProvider({ children, premium }: { children: ReactNode; premium: boolean }) {
  const focus = useFocus();
  const focusActive = !!focus.session;
  const [now, setNow] = useState(0);
  const [breaks, setBreakPrefs] = useState<BreakPrefs>(DEFAULT_BREAKS);
  const [breakState, setBreakState] = useState<BreakState>(NO_BREAK);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [stopwatch, setStopwatch] = useState<Stopwatch>(NO_STOPWATCH);
  const [ringReminders, setRing] = useState(true);
  const [alerts, setAlerts] = useState<ToolAlert[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const ready = useRef(false);

  const reloadAll = useCallback(() => {
    setBreakPrefs(load(K.breakPrefs, DEFAULT_BREAKS));
    setBreakState(load(K.breakState, NO_BREAK));
    setAlarms(loadList<Alarm>(K.alarms));
    setStopwatch(load(K.stopwatch, NO_STOPWATCH));
    setRing(load(K.ring, { enabled: true }).enabled);
  }, []);

  useEffect(() => {
    reloadAll(); setNow(Date.now()); ready.current = true;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const onStorage = (e: StorageEvent) => { if (e.key && Object.values(K).includes(e.key) && e.key !== K.lock && e.key !== K.rung) reloadAll(); };
    window.addEventListener('storage', onStorage);
    const off = unlockAudioOnGesture();
    return () => { clearInterval(t); window.removeEventListener('storage', onStorage); off(); };
  }, [reloadAll]);

  const saveBreakState = useCallback((s: BreakState) => { store(K.breakState, s); setBreakState(s); }, []);
  const saveAlarms = useCallback((list: Alarm[]) => { store(K.alarms, list); setAlarms(list); }, []);
  const saveStopwatch = useCallback((s: Stopwatch) => { store(K.stopwatch, s); setStopwatch(s); }, []);

  const fire = useCallback((a: ToolAlert) => {
    setAlerts(list => list.some(x => x.id === a.id) ? list : [...list, a]);
    if (document.hidden) void systemNotify(a.title, a.body, a.id, a.href ?? '/focus', a.loop);
  }, []);

  /* ---- Timed reminders (note reminders and others with kind "reminder"), from /api/upcoming ---- */
  const refreshReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/upcoming', { cache: 'no-store' });
      if (!res.ok) return;
      setUpcoming(((await res.json()).items ?? []).filter((i: Upcoming) => i.kind === 'reminder'));
    } catch { /* offline */ }
  }, []);
  useEffect(() => {
    if (!premium) return;
    void refreshReminders();
    const every = setInterval(() => void refreshReminders(), 5 * 60_000);
    const onChange = () => void refreshReminders();
    window.addEventListener('mybuddy:reminders', onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => { clearInterval(every); window.removeEventListener('mybuddy:reminders', onChange); document.removeEventListener('visibilitychange', onChange); };
  }, [premium, refreshReminders]);

  /* ---- The one-second check for everything that can ring ---- */
  useEffect(() => {
    if (!ready.current || !now) return;

    // Regular breaks
    if (breaks.enabled) {
      const s = breakState, every = breaks.everyMin * 60_000;
      const holding = breaks.pauseDuringFocus && focusActive;
      if (s.breakEndAt) {
        if (now >= s.breakEndAt) {
          if (claim(`breakEnd:${s.breakEndAt}`)) fire({ id: `breakEnd:${s.breakEndAt}`, kind: 'breakEnd', title: 'Break over', body: 'Back to it. Next break reminder in ' + breaks.everyMin + ' minutes.', sound: breaks.sound, loop: false });
          saveBreakState({ nextAt: now + every, breakEndAt: null, pausedLeft: null });
        }
      } else if (holding) {
        if (s.nextAt) saveBreakState({ nextAt: null, breakEndAt: null, pausedLeft: Math.max(60_000, s.nextAt - now) });
      } else if (s.pausedLeft != null) {
        saveBreakState({ nextAt: now + s.pausedLeft, breakEndAt: null, pausedLeft: null });
      } else if (!s.nextAt) {
        saveBreakState({ ...NO_BREAK, nextAt: inHours(breaks, now) ? now + every : nextWindowStart(breaks, now) + every });
      } else if (now >= s.nextAt) {
        if (!inHours(breaks, now)) saveBreakState({ ...NO_BREAK, nextAt: nextWindowStart(breaks, now) + every });
        else {
          if (claim(`break:${s.nextAt}`)) fire({ id: `break:${s.nextAt}`, kind: 'break', title: 'Time for a break', body: `You have been at it for ${breaks.everyMin} minutes. Stand up, stretch, rest your eyes, drink some water.`, sound: breaks.sound, loop: false });
          saveBreakState({ ...NO_BREAK, nextAt: now + every });
        }
      }
    }

    // Alarms
    let changed = false;
    const d = new Date(now);
    const next = alarms.map(a => {
      if (!a.enabled) return a;
      if (a.snoozeUntil) {
        if (now < a.snoozeUntil) return a;
        changed = true;
        if (claim(`alarm:${a.id}:snooze:${a.snoozeUntil}`)) fire({ id: `alarm:${a.id}:${a.snoozeUntil}`, kind: 'alarm', alarmId: a.id, title: a.label || 'Alarm', body: `Snoozed alarm · ${a.time}`, sound: a.sound, loop: true });
        return { ...a, snoozeUntil: null, enabled: a.days.length > 0 || false };
      }
      const key = `${dayKey(d)} ${a.time}`, at = atToday(a.time, d);
      if (a.lastFired === key || now < at) return a;
      // A one-time alarm missed while Amiroon was closed or asleep: mark it, don't roll it to tomorrow.
      if (now - at > 5 * 60_000) { if (a.days.length) return a; changed = true; return { ...a, lastFired: key, enabled: false }; }
      if (a.days.length && !a.days.includes(d.getDay())) return a;
      changed = true;
      if (claim(`alarm:${a.id}:${key}`)) fire({ id: `alarm:${a.id}:${key}`, kind: 'alarm', alarmId: a.id, title: a.label || 'Alarm', body: `It's ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, sound: a.sound, loop: true });
      return { ...a, lastFired: key, enabled: a.days.length > 0 };
    });
    if (changed) saveAlarms(next);

    // Timed reminders
    if (premium && ringReminders && upcoming.length) {
      for (const it of upcoming) {
        if (it.at > now || now - it.at > 2 * 60_000) continue;
        if (!claim(`reminder:${it.key}`)) continue;
        fire({ id: `reminder:${it.key}`, kind: 'reminder', title: it.title, body: it.body, sound: 'bell', loop: false, href: it.href });
        // Tell the Settings reminders not to send the same one again.
        try { const sent = JSON.parse(localStorage.getItem(NOTIFIER_SENT) ?? '{}'); if (!sent[it.key]) { sent[it.key] = Date.now(); localStorage.setItem(NOTIFIER_SENT, JSON.stringify(sent)); } } catch { /* ignore */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  /* ---- Sound for the alert on screen: alarms repeat for up to a minute ---- */
  const alert = alerts[0] ?? null;
  useEffect(() => {
    if (!alert) return;
    playSound(alert.sound); buzz(alert.loop ? [400, 200, 400, 200, 400] : [200, 100, 200]);
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (!alert.loop && n >= 1) { clearInterval(t); }
      if (alert.loop && n > 28) { clearInterval(t); return; }
      playSound(alert.sound);
      if (alert.loop && n % 3 === 0) buzz([400, 200, 400]);
    }, alert.loop ? 2100 : 1600);
    return () => clearInterval(t);
  }, [alert]);

  const api = useMemo<ToolsApi>(() => {
    const every = breaks.everyMin * 60_000;
    return {
      now, breaks, breakState, alarms, stopwatch, ringReminders, upcomingReminders: upcoming, alert,
      setBreaks: p => {
        const next = { ...breaks, ...p };
        store(K.breakPrefs, next); setBreakPrefs(next);
        // Turning on, or changing the interval, starts the countdown again from now.
        if (p.enabled !== undefined || p.everyMin !== undefined) saveBreakState(next.enabled ? { ...NO_BREAK, nextAt: Date.now() + next.everyMin * 60_000 } : NO_BREAK);
      },
      startBreak: () => { saveBreakState({ nextAt: null, breakEndAt: Date.now() + breaks.breakMin * 60_000, pausedLeft: null }); setAlerts(l => l.filter(a => a.kind !== 'break')); },
      endBreak: () => saveBreakState({ ...NO_BREAK, nextAt: Date.now() + every }),
      snoozeBreak: (min = 5) => { saveBreakState({ ...NO_BREAK, nextAt: Date.now() + min * 60_000 }); setAlerts(l => l.filter(a => a.kind !== 'break')); },
      resetBreakTimer: () => saveBreakState({ ...NO_BREAK, nextAt: Date.now() + every }),
      saveAlarm: a => {
        const base: Alarm = arm({ id: a.id ?? (crypto.randomUUID?.() ?? String(Date.now())), time: a.time, label: a.label.trim().slice(0, 60), days: [...a.days].sort(), enabled: true, sound: a.sound, snoozeMin: a.snoozeMin, snoozeUntil: null, lastFired: null });
        saveAlarms(a.id ? alarms.map(x => x.id === a.id ? base : x) : [...alarms, base].sort((x, y) => toMin(x.time) - toMin(y.time)));
      },
      toggleAlarm: (id, on) => saveAlarms(alarms.map(a => a.id === id ? (on ? arm({ ...a, enabled: true }) : { ...a, enabled: false, snoozeUntil: null }) : a)),
      removeAlarm: id => saveAlarms(alarms.filter(a => a.id !== id)),
      swStart: () => saveStopwatch({ ...stopwatch, startedAt: Date.now() }),
      swPause: () => saveStopwatch({ ...stopwatch, accMs: swElapsed(stopwatch, Date.now()), startedAt: null }),
      swReset: () => saveStopwatch(NO_STOPWATCH),
      swLap: () => { if (stopwatch.laps.length < 99) saveStopwatch({ ...stopwatch, laps: [...stopwatch.laps, swElapsed(stopwatch, Date.now())] }); },
      setRingReminders: on => { store(K.ring, { enabled: on }); setRing(on); },
      refreshReminders: () => void refreshReminders(),
      dismissAlert: () => setAlerts(l => l.slice(1)),
      snoozeAlarmAlert: () => {
        const cur = alerts[0];
        if (cur?.alarmId) {
          saveAlarms(alarms.map(a => a.id === cur.alarmId ? { ...a, enabled: true, snoozeUntil: Date.now() + (a.snoozeMin || 5) * 60_000 } : a));
        }
        setAlerts(l => l.slice(1));
      },
      previewSound: s => playSound(s),
    };
  }, [now, breaks, breakState, alarms, stopwatch, ringReminders, upcoming, alert, alerts, saveBreakState, saveAlarms, saveStopwatch, refreshReminders]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
