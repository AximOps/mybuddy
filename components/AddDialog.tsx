'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * An empty state whose "+" really adds something: it opens a pop-up with the add form.
 * The form inside is a normal server-action form; the pop-up closes once it is submitted.
 * Uses the native <dialog> element, so Escape, focus trapping and the backdrop come for free.
 */
export function AddDialog({ title, label, text, children, style }: {
  title: string;          // heading inside the pop-up, e.g. "New to-do"
  label: string;          // what the + button says to screen readers, e.g. "Add a to-do"
  text?: ReactNode;       // the empty-state message under the +
  children: ReactNode;    // the add form
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Put the cursor in the first field.
      requestAnimationFrame(() => d.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus());
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <div className="empty has-add" style={style}>
      <button type="button" className="empty-add" onClick={() => setOpen(true)} aria-label={label} title={label} aria-haspopup="dialog">
        <Plus size={22} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {text ? <div>{text}</div> : null}
      <dialog
        ref={ref}
        className="add-dialog"
        aria-label={title}
        onClose={() => setOpen(false)}
        onClick={e => { if (e.target === ref.current) setOpen(false); }}
        // The browser only fires submit after required fields are filled, so this closes on a real save.
        onSubmit={() => setTimeout(() => setOpen(false), 0)}
      >
        <div className="add-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="add-dialog-body">{open ? children : null}</div>
      </dialog>
    </div>
  );
}
