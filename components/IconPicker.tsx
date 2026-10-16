'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [pos, setPos] = useState({ top: 0, left: 0, height: PANEL_HEIGHT });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isCustom = !ICON_CHOICES.includes(value);

  /** Puts the panel below the button, or above when there is more room there, and fits it on screen. */
  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return false;
    const r = t.getBoundingClientRect();
    // On phones the bottom nav bar covers the end of the screen, so the panel stops above it.
    const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect();
    const screenH = window.visualViewport?.height ?? window.innerHeight;
    const vh = nav && nav.height > 0 && nav.top < screenH ? Math.min(screenH, nav.top) : screenH;
    if (r.bottom < 0 || r.top > vh) return false; // the button scrolled out of view
    const below = vh - r.bottom - 14, above = r.top - 14;
    const down = below >= Math.min(PANEL_HEIGHT, 240) || below >= above;
    const height = Math.max(160, Math.min(PANEL_HEIGHT, down ? below : above));
    const left = Math.min(Math.max(8, r.left), window.innerWidth - PANEL_WIDTH - 8);
    setPos({ top: down ? r.bottom + 6 : Math.max(8, r.top - height - 6), left: Math.max(8, left), height });
    return true;
  }, []);

  const toggle = () => {
    if (!open) place();
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Scrolling inside the panel is just browsing icons. Scrolling the page moves the panel with its button.
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      if (!place()) setOpen(false);
    };
    // Window size changes, including the phone keyboard opening for "type your own", only re-fit the panel.
    const onResize = () => { place(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

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
        <div ref={panelRef} className="icon-panel" role="dialog" aria-label="Choose an icon" style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, maxHeight: pos.height }}>
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
