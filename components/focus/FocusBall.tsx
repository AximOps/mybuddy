'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { clock, useFocus } from './FocusProvider';
import { FocusDial } from './FocusDial';

/** Floating timer on every page except Focus while a session runs, with the mobile app's ripple. */
export function FocusBall() {
  const pathname = usePathname();
  const { session, remaining, progress, running, pause, resume } = useFocus();
  if (!session || pathname === '/focus') return null;
  const isBreak = session.phase === 'break';
  const label = !running ? 'paused' : isBreak ? 'break' : session.mode === 'pomodoro' ? `focus ${session.round}/${session.rounds}` : 'focus';
  return (
    <div className="focus-ball">
      <Link href="/focus" className="focus-ball-main" aria-label={`${isBreak ? 'Break' : 'Focus'}: ${clock(remaining)} left. Open the timer.`}>
        <FocusDial size="sm" progress={progress} state={!running ? 'paused' : isBreak ? 'break' : 'running'}>
          <span className="fb-time num">{clock(remaining)}</span>
          <span className="fb-label">{label}</span>
        </FocusDial>
      </Link>
      <button type="button" className="focus-ball-btn" onClick={running ? pause : resume} aria-label={running ? 'Pause' : 'Resume'}>
        {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
    </div>
  );
}
