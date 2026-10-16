import type { ReactNode } from 'react';

/**
 * The focus dial, matching the mobile app: a white face with a soft lavender track, a blue arc
 * for the time done so far (from 12 o'clock, clockwise), and a sonar ripple that spreads out
 * from the edge and fades while the timer runs.
 */
export function FocusDial({ progress, state, size = 'lg', children }: {
  progress: number; state: 'running' | 'paused' | 'break'; size?: 'lg' | 'sm'; children: ReactNode;
}) {
  const R = 52, C = 2 * Math.PI * R;
  const shown = Math.max(0.015, Math.min(1, progress));
  return (
    <div className={`fdial fdial-${size} is-${state}`}>
      <span className="fdial-glow" aria-hidden="true" />
      <span className="fdial-ripple" aria-hidden="true" />
      <div className="fdial-face">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="fdial-track" />
          <circle cx="60" cy="60" r={R} className="fdial-arc" strokeDasharray={C} strokeDashoffset={C * (1 - shown)} />
        </svg>
        <span className="fdial-disc" aria-hidden="true" />
        <div className="fdial-content">{children}</div>
      </div>
    </div>
  );
}
