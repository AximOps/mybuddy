'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Icons for activities, grouped by use. Each is a single emoji. */
export const ICON_CHOICES = [
  '📌', '⭐', '🔔', '📅', '✅', '🧹', '🛒', '🚗', '🛏️', '🧴',
  '🏃', '🚶', '🧘', '💧', '💊', '🏋️', '🚴', '🩺',
  '🍳', '🥗', '☕', '🍎', '🍽️', '🥪',
  '💼', '💻', '📞', '👥', '📝', '📊', '📧', '🗂️',
  '📚', '🎓', '✏️', '🧠', '🔬',
  '🏠', '👨‍👩‍👧', '🐶', '🌱', '🎂',
  '📖', '🎵', '🎬', '🎮', '🌙', '🌿', '☀️', '🎨',
];

const PANEL_WIDTH = 296;
const PANEL_HEIGHT = 320;

/**
 * Icon dropdown. Shows the chosen icon in one small button; tapping it opens the icon grid
 * on top of the page, so the form keeps its size. Works inside a plain server-action form.
 */
export function IconPicker({ name = 'emoji', defaultValue = '📌', label = 'Icon' }: { name?: string; defaultValue?: string; label?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isCustom = !ICON_CHOICES.includes(value);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const fitsBelow = r.bottom + 6 + PANEL_HEIGHT < window.innerHeight;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_WIDTH - 8);
      setPos({ top: fitsBelow ? r.bottom + 6 : Math.max(8, r.top - PANEL_HEIGHT - 6), left });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const choose = (e: string) => { setValue(e); setOpen(false); };

  return (
    <div className="icon-picker">
      <input type="hidden" name={name} value={value} />
      <span className="field-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="icon-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value}. Change`}
        onClick={toggle}
      >
        <span className="icon-trigger-value" aria-hidden="true">{value}</span>
        <span className="icon-trigger-text">Change icon</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={open ? 'chev open' : 'chev'} />
      </button>

      {open ? (
        <div ref={panelRef} className="icon-panel" role="dialog" aria-label="Choose an icon" style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, maxHeight: PANEL_HEIGHT }}>
          <div className="icon-grid" role="radiogroup" aria-label={label}>
            {ICON_CHOICES.map(e => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={value === e}
                aria-label={`Icon ${e}`}
                className={`icon-btn${value === e ? ' on' : ''}`}
                onClick={() => choose(e)}
              >
                {e}
              </button>
            ))}
          </div>
          <label className="icon-custom">
            <span>Or type your own</span>
            <input className="input" maxLength={8} value={isCustom ? value : ''} placeholder="Any emoji" onChange={e => setValue(e.target.value)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
