import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { BrandLockup } from '@/components/BuddyLogo';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Sidebar } from '@/components/Sidebar';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { withUser } from '@/lib/db';
import { isPlatformAdmin } from '@/lib/admin';
import { getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';
import { APP_TZ } from '@/lib/time';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { settings, admin } = await withUser(user.id, async c => ({ settings: await getSettings(c, user.id), admin: await isPlatformAdmin(c, user.id) }));
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: APP_TZ });
  return (
    <div className="app">
      <Sidebar showStudent={settings.studentEnabled} showWork={settings.mode === 'work'} />
      <div className="main">
        <header className="topbar">
          <span className="mobile-brand"><BrandLockup size={30} /></span>
          <span className="muted small desktop-only">{todayLabel}</span>
          <div className="topbar-right">
            <ThemeSwitch initial={settings.theme} />
            <ProfileMenu name={user.name} email={user.email} showAdmin={admin} />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
