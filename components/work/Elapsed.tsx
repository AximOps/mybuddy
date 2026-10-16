'use client';

import { useEffect, useState } from 'react';

/** Shows how long the running timer has been going, updated every second. */
export function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span style={{ fontVariantNumeric: 'tabular-nums' }} aria-live="off" suppressHydrationWarning>{pad(h)}:{pad(m)}:{pad(s)}</span>;
}
