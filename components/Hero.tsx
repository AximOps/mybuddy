'use client';

import { useEffect, useState } from 'react';
import { BuddyLogo } from './BuddyLogo';

const SWITCH_AFTER_MS = 3500;

/** Shows the My Buddy logo, then fades it into the greeting after a few seconds, as the phone app does. */
export function Hero({ emoji, greeting }: { emoji: string; greeting: string }) {
  const [showGreeting, setShowGreeting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowGreeting(true), SWITCH_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="hero-line">
      <div className={`hero-brand ${showGreeting ? 'out' : ''}`} aria-hidden={showGreeting}>
        <BuddyLogo size={44} />
        <div>
          <div className="brand-word">My <span>Buddy</span></div>
          <div className="brand-tag">Daily Planner</div>
        </div>
      </div>
      <div className={`hero-greet ${showGreeting ? 'in' : ''}`} aria-live="polite">
        <span aria-hidden="true">{emoji}</span> {greeting}
      </div>
    </div>
  );
}
