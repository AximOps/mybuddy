'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { clock, useFocus } from './FocusProvider';

/** Floating timer on every page except Focus while a session runs. A soft glow pulses while it runs. */
export function FocusBall() {
  const pathname = usePathname();
  const { session, remaining, progress, running, pause, resume } = useFocus();
  if (!session || pathname === '/focus') return null;
  const R = 50, C = 2 * Math.PI * R;
  const isBreak = session.phase === 'break';
  const label = !running ? 'paused' : isBreak ? 'break' : session.mode === 'pomodoro' ? `focus ${session.round}/${session.rounds}` : 'focus';
  return (
    <div className={`focus-ball ${isBreak ? 'is-break' : ''} ${running ? 'is-running' : 'is-paused'}`}>
      <span className="fb-glow" aria-hidden="true" />
      <span className="fb-glow fb-glow-2" aria-hidden="true" />
      <Link href="/focus" className="focus-ball-main" aria-label={`${isBreak ? 'Break' : 'Focus'}: ${clock(remaining)} left. Open the timer.`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="fb-track" />
          <circle cx="60" cy="60" r={R} className="fb-fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.012, progress))} />
        </svg>
        <span className="fb-disc" aria-hidden="true" />
        <span className="fb-time num">{clock(remaining)}</span>
        <span className="fb-label">{label}</span>
      </Link>
      <button type="button" className="focus-ball-btn" onClick={running ? pause : resume} aria-label={running ? 'Pause' : 'Resume'}>
        {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
    </div>
  );
}
