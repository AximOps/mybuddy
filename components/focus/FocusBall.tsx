'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { clock, useFocus } from './FocusProvider';

/** Floating timer on every page except Focus while a session runs. Tap to open the timer. */
export function FocusBall() {
  const pathname = usePathname();
  const { session, remaining, progress, running, pause, resume } = useFocus();
  if (!session || pathname === '/focus') return null;
  const R = 30, C = 2 * Math.PI * R;
  const isBreak = session.phase === 'break';
  return (
    <div className={`focus-ball ${isBreak ? 'is-break' : ''} ${running ? '' : 'is-paused'}`}>
      <Link href="/focus" className="focus-ball-main" aria-label={`${isBreak ? 'Break' : 'Focus'}: ${clock(remaining)} left. Open the timer.`}>
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r={R} className="fb-track" />
          <circle cx="36" cy="36" r={R} className="fb-fill" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <span className="fb-time num">{clock(remaining)}</span>
        <span className="fb-label">{isBreak ? 'Break' : session.mode === 'pomodoro' ? `${session.round}/${session.rounds}` : running ? 'Focus' : 'Paused'}</span>
      </Link>
      <button type="button" className="focus-ball-btn" onClick={running ? pause : resume} aria-label={running ? 'Pause' : 'Resume'}>
        {running ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
      </button>
    </div>
  );
}
