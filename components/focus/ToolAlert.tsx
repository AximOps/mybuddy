'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlarmClock, Bell, Coffee, PartyPopper } from 'lucide-react';
import { useTools } from './ToolsProvider';

/** The pop-up that rings for a break, an alarm or a reminder, on any page. */
export function ToolAlertOverlay() {
  const { alert, dismissAlert, snoozeAlarmAlert, startBreak, snoozeBreak, breaks, alarms } = useTools();
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (alert) primary.current?.focus(); }, [alert]);
  useEffect(() => {
    if (!alert) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissAlert(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alert, dismissAlert]);
  if (!alert) return null;

  const Icon = alert.kind === 'alarm' ? AlarmClock : alert.kind === 'reminder' ? Bell : alert.kind === 'break' ? Coffee : PartyPopper;
  const snoozeMin = alarms.find(a => a.id === alert.alarmId)?.snoozeMin ?? 5;
  return (
    <div className="tool-alert-backdrop" role="presentation">
      <div className={`tool-alert kind-${alert.kind}`} role="alertdialog" aria-modal="true" aria-labelledby="tool-alert-title" aria-describedby="tool-alert-body">
        <div className="tool-alert-icon" aria-hidden="true"><span className="tool-alert-pulse" /><Icon size={28} /></div>
        <h2 id="tool-alert-title">{alert.title}</h2>
        <p id="tool-alert-body" className="muted">{alert.body}</p>
        <div className="tool-alert-actions">
          {alert.kind === 'break' ? (
            <>
              <button ref={primary} type="button" className="btn primary block" onClick={startBreak}><Coffee size={16} /> Start {breaks.breakMin}-minute break</button>
              <div className="tool-alert-row">
                <button type="button" className="btn" onClick={() => snoozeBreak(5)}>In 5 minutes</button>
                <button type="button" className="btn ghost" onClick={dismissAlert}>Skip this one</button>
              </div>
            </>
          ) : alert.kind === 'alarm' ? (
            <>
              <button ref={primary} type="button" className="btn primary block" onClick={dismissAlert}>Stop alarm</button>
              <button type="button" className="btn block" onClick={snoozeAlarmAlert}>Snooze {snoozeMin} min</button>
            </>
          ) : alert.kind === 'reminder' ? (
            <div className="tool-alert-row">
              <button ref={primary} type="button" className="btn primary" onClick={dismissAlert}>Got it</button>
              {alert.href ? <Link href={alert.href} className="btn" onClick={dismissAlert}>Open</Link> : null}
            </div>
          ) : (
            <button ref={primary} type="button" className="btn primary block" onClick={dismissAlert}>Back to it</button>
          )}
        </div>
      </div>
    </div>
  );
}
