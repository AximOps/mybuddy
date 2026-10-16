'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';

/**
 * Reminds the person to subscribe from day 10 of the 15-day trial, and once more after it ends.
 * Hiding it lasts until the next day, so the reminder comes back daily.
 */
export function TrialBanner({ kind, daysLeft }: { kind: 'ending' | 'ended'; daysLeft: number }) {
  const key = `mybuddy.trialbanner.${kind}.${new Date().toISOString().slice(0, 10)}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === '1'); } catch { setHidden(false); } }, [key]);
  if (hidden) return null;
  const urgent = kind === 'ended' || daysLeft <= 2;
  return (
    <div className={`trial-banner ${urgent ? 'urgent' : ''}`} role="status">
      <Sparkles size={18} aria-hidden="true" />
      <div className="trial-text">
        {kind === 'ending'
          ? <><strong>{daysLeft <= 1 ? 'Your Premium trial ends today.' : `Your Premium trial ends in ${daysLeft} days.`}</strong> Subscribe to keep Focus, Spending, Week planning, meetings and student tools.</>
          : <><strong>Your Premium trial has ended.</strong> Your data is safe. Subscribe to unlock Focus, Spending, Work and Student tools again.</>}
      </div>
      <Link href="/settings#plan" className="btn sm trial-cta">Subscribe for $10/year</Link>
      <button type="button" className="trial-close" aria-label="Hide until tomorrow" onClick={() => { try { localStorage.setItem(key, '1'); } catch { /* ignore */ } setHidden(true); }}><X size={16} /></button>
    </div>
  );
}
