'use client';

import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { updateAppearance } from '@/app/actions';

type Theme = 'light' | 'dark' | 'system';
const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

/** Light, dark or automatic (follows the device). Applies at once and is remembered. */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = async (value: Theme) => {
    setTheme(value);
    if (value === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
    const fd = new FormData();
    fd.set('theme', value);
    await updateAppearance(fd);
  };
  return (
    <div className="theme-switch" role="group" aria-label="Appearance">
      {OPTIONS.map(o => {
        const Icon = o.icon;
        return (
          <button key={o.value} type="button" aria-pressed={theme === o.value} aria-label={o.label} title={o.label} onClick={() => void choose(o.value)}>
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
