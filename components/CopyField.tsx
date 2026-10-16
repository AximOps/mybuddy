'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** A read-only text field with a Copy button. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="copy-field">
      <input className="input" readOnly value={value} aria-label={label} onFocus={e => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={() => void copy()}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
    </div>
  );
}
