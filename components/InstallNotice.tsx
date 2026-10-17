'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

const KEY = 'mb.install.dismissed';
const SNOOZE_DAYS = 14;

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type Mode = 'hidden' | 'prompt' | 'ios' | 'android';

/**
 * Top-of-Today banner that helps people add Amiroon to their home screen.
 * Chrome, Edge and Android offer a one-tap Install button. iPhone and iPad (Safari) need steps.
 * Hidden once the app is installed, after it is dismissed (for 14 days), or on desktop browsers without an install prompt.
 */
export function InstallNotice() {
  const [mode, setMode] = useState<Mode>('hidden');
  const [event, setEvent] = useState<PromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    let snoozed = false;
    try {
      const at = Number(localStorage.getItem(KEY) ?? 0);
      snoozed = at > 0 && Date.now() - at < SNOOZE_DAYS * 86_400_000;
    } catch { /* storage unavailable: show the notice */ }
    if (installed || snoozed) return;

    const ua = navigator.userAgent;
    const onIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as PromptEvent); setMode('prompt'); };
    const onInstalled = () => setMode('hidden');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (onIos) { setMode('ios'); setOpen(true); }
    else if (/Android/.test(ua)) setMode('android');

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    setMode('hidden');
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice?.outcome === 'accepted') setMode('hidden');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the steps still work */ }
  };

  if (mode === 'hidden') return null;

  return (
    <section className="install-notice" aria-label="Add Amiroon to your home screen">
      <div className="install-main">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="install-icon" />
        <div>
          <strong>Add Amiroon to your home screen</strong>
          <p className="small muted">Open it like an app, with its own icon and no browser bar.</p>
        </div>
      </div>

      <div className="install-actions">
        {mode === 'prompt' ? (
          <button type="button" className="btn primary sm" onClick={() => void install()}>
            <Download size={15} strokeWidth={2} aria-hidden="true" /> Install app
          </button>
        ) : (
          <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? 'Hide steps' : 'Show steps'}
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Copy app link'}</button>
        <button type="button" className="btn ghost sm" onClick={dismiss} aria-label="Dismiss"><X size={16} strokeWidth={2} aria-hidden="true" /></button>
      </div>

      {open && mode === 'ios' ? (
        <ol className="install-steps">
          <li>Open this page in <strong>Safari</strong> (install does not work from Chrome on iPhone).</li>
          <li>Tap the <Share size={14} strokeWidth={2} aria-label="Share" className="inline-icon" /> <strong>Share</strong> button at the bottom of the screen.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Amiroon appears on your home screen.</li>
        </ol>
      ) : null}

      {open && mode === 'android' ? (
        <ol className="install-steps">
          <li>Tap the <strong>⋮ menu</strong> in your browser.</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        </ol>
      ) : null}
    </section>
  );
}
