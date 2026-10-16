'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { recordFocusSession } from '@/app/actions';
import { playSound } from './sound';

/**
 * One focus engine for the whole app. The running session lives in this browser (localStorage),
 * so it survives refreshes and page changes, and shows in the floating ball on other pages.
 * Plain focus = one block. Pomodoro = focus and break blocks for a number of rounds.
 */
export type FocusMode = 'single' | 'pomodoro';
export interface FocusSession {
  id: string; mode: FocusMode; title: string; taskId: string | null; completeTask: boolean;
  focusMin: number; breakMin: number; rounds: number; round: number; phase: 'focus' | 'break';
  endAt: number | null; remainingSec: number | null;
}
export type FocusConfig = Pick<FocusSession, 'mode' | 'title' | 'taskId' | 'completeTask' | 'focusMin' | 'breakMin' | 'rounds'>;

const KEY = 'mybuddy.focus.v2';
const LOCK = 'mybuddy.focus.lock';

function read(): FocusSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as FocusSession;
    // A timer started before this version (single block).
    const old = localStorage.getItem('mybuddy.focus.v1');
    if (old) {
      const o = JSON.parse(old) as { title: string; minutes: number; endAt: number | null; remainingSec: number | null; taskId?: string | null; completeTask?: boolean };
      localStorage.removeItem('mybuddy.focus.v1');
      return { id: String(Date.now()), mode: 'single', title: o.title, taskId: o.taskId ?? null, completeTask: !!o.completeTask, focusMin: o.minutes, breakMin: 0, rounds: 1, round: 1, phase: 'focus', endAt: o.endAt, remainingSec: o.remainingSec };
    }
  } catch { /* damaged */ }
  return null;
}
function write(s: FocusSession | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

async function notify(title: string, body: string) {
  playSound('chime');
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, { body, tag: 'focus', icon: '/icons/icon-192.png', data: { href: '/focus' } }); return; }
    new Notification(title, { body, tag: 'focus' });
  } catch { /* ignore */ }
}

interface FocusApi {
  session: FocusSession | null; remaining: number; total: number; running: boolean; progress: number;
  message: string | null; clearMessage: () => void;
  start: (c: FocusConfig) => void; pause: () => void; resume: () => void; stop: () => void; skipBreak: () => void;
}
const Ctx = createContext<FocusApi | null>(null);
export const useFocus = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFocus must be inside FocusProvider');
  return c;
};

export function FocusProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const advancing = useRef(false);

  useEffect(() => {
    setSession(read()); setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setSession(read()); };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(t); window.removeEventListener('storage', onStorage); };
  }, []);

  const save = useCallback((next: FocusSession | null) => { write(next); setSession(next); }, []);
  const running = session?.endAt != null;
  const total = session ? (session.phase === 'focus' ? session.focusMin : session.breakMin) * 60 : 0;
  const remaining = session ? (running ? Math.max(0, Math.ceil(((session.endAt as number) - now) / 1000)) : session.remainingSec ?? total) : 0;
  const progress = total ? Math.min(1, 1 - remaining / total) : 0;

  // Move to the next phase when the clock reaches zero. A lock keeps two open tabs from both doing it.
  useEffect(() => {
    if (!session || !running || remaining > 0 || advancing.current) return;
    const stored = read();
    if (!stored || stored.id !== session.id || stored.round !== session.round || stored.phase !== session.phase) { setSession(stored); return; }
    const lockKey = `${session.id}:${session.round}:${session.phase}`;
    try { if (localStorage.getItem(LOCK) === lockKey) return; localStorage.setItem(LOCK, lockKey); } catch { /* ignore */ }
    advancing.current = true;
    const s = session;
    if (s.phase === 'focus') {
      const last = s.mode === 'single' || s.round >= s.rounds;
      if (last) save(null);
      else save({ ...s, phase: 'break', endAt: Date.now() + s.breakMin * 60_000, remainingSec: null });
      const fd = new FormData();
      fd.set('title', s.title); fd.set('minutes', String(s.focusMin));
      if (s.taskId) { fd.set('taskId', s.taskId); fd.set('completeTask', String(last && s.completeTask)); }
      void recordFocusSession(fd);
      if (last) {
        const total = s.focusMin * (s.mode === 'pomodoro' ? s.rounds : 1);
        setMessage(`Focus complete: ${total} minutes${s.title ? ` on ${s.title}` : ''}.${s.taskId && s.completeTask ? ' The task is ticked off.' : ''} Well done.`);
        void notify('Focus complete 🎉', s.title || 'Great work. Time for a proper break.');
      } else {
        void notify(`Round ${s.round} done · break time`, `${s.breakMin} minute break. Round ${s.round + 1} of ${s.rounds} starts after.`);
      }
    } else {
      save({ ...s, phase: 'focus', round: s.round + 1, endAt: Date.now() + s.focusMin * 60_000, remainingSec: null });
      void notify('Break over', `Round ${s.round + 1} of ${s.rounds}: ${s.focusMin} minutes${s.title ? ` on ${s.title}` : ''}.`);
    }
    advancing.current = false;
  }, [session, running, remaining, save]);

  useEffect(() => {
    if (!session) { document.title = document.title.replace(/^\d{2}:\d{2}.*? · /, ''); return; }
    const label = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}${session.phase === 'break' ? ' break' : ''}`;
    document.title = `${label} · ${document.title.replace(/^\d{2}:\d{2}.*? · /, '')}`;
  }, [remaining, session]);

  const api = useMemo<FocusApi>(() => ({
    session, remaining, total, running, progress, message,
    clearMessage: () => setMessage(null),
    start: c => { setMessage(null); save({ ...c, id: String(Date.now()), round: 1, phase: 'focus', endAt: Date.now() + c.focusMin * 60_000, remainingSec: null }); },
    pause: () => session && save({ ...session, endAt: null, remainingSec: remaining }),
    resume: () => session && save({ ...session, endAt: Date.now() + (session.remainingSec ?? total) * 1000, remainingSec: null }),
    stop: () => save(null),
    skipBreak: () => session && session.phase === 'break' && save({ ...session, phase: 'focus', round: session.round + 1, endAt: Date.now() + session.focusMin * 60_000, remainingSec: null }),
  }), [session, remaining, total, running, progress, message, save]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
