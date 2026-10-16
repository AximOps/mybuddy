'use client';

/**
 * Small Web Audio sounds for the focus tools. Browsers only allow sound after the person has
 * interacted with the page, so the shared AudioContext is unlocked on the first tap or key press.
 */
export type SoundId = 'chime' | 'bell' | 'beep' | 'soft';
export const SOUNDS: { id: SoundId; label: string }[] = [
  { id: 'chime', label: 'Chime' },
  { id: 'bell', label: 'Bell' },
  { id: 'beep', label: 'Classic beep' },
  { id: 'soft', label: 'Soft' },
];

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Call once on mount: unlocks audio on the first interaction. */
export function unlockAudioOnGesture() {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
}

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, peak: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at); o.stop(at + dur + 0.05);
}

/** Plays one round of a sound (about one second). */
export function playSound(id: SoundId = 'chime') {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.02;
  switch (id) {
    case 'bell': [523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, t + i * 0.12, 1.2, 'sine', 0.16)); break;
    case 'beep': [0, 0.16, 0.32, 0.48].forEach(d => tone(c, 880, t + d, 0.11, 'square', 0.07)); break;
    case 'soft': [392, 523.25].forEach((f, i) => tone(c, f, t + i * 0.3, 0.9, 'triangle', 0.12)); break;
    default: [660, 880].forEach((f, i) => tone(c, f, t + i * 0.18, 0.5, 'sine', 0.18));
  }
}

export function buzz(pattern: number[] = [200, 100, 200]) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/** A system notification through the service worker when allowed. Returns true when shown. */
export async function systemNotify(title: string, body: string, tag: string, href = '/focus', sticky = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts: NotificationOptions & { data?: unknown } = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { href }, requireInteraction: sticky };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) { await reg.showNotification(title, opts); return true; }
    new Notification(title, opts);
    return true;
  } catch { return false; }
}
