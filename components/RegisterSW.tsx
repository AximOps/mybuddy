'use client';

import { useEffect } from 'react';

/** Registers the service worker that makes the app installable and usable offline. Production only. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* not critical */ });
  }, []);
  return null;
}
