'use client';

import { useState } from 'react';

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

/** Pick an icon with one tap, or type your own. Works inside a plain server-action form. */
export function IconPicker({ name = 'emoji', defaultValue = '📌', label = 'Icon' }: { name?: string; defaultValue?: string; label?: string }) {
  const [value, setValue] = useState(defaultValue);
  const isCustom = !ICON_CHOICES.includes(value);
  return (
    <div className="icon-picker">
      <input type="hidden" name={name} value={value} />
      <div className="field-label">{label}</div>
      <div className="icon-grid" role="radiogroup" aria-label={label}>
        {ICON_CHOICES.map(e => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={value === e}
            aria-label={`Icon ${e}`}
            className={`icon-btn${value === e ? ' on' : ''}`}
            onClick={() => setValue(e)}
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
  );
}
