import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { BuddyLogo } from '@/components/BuddyLogo';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Sidebar } from '@/components/Sidebar';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { withUser } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';
import { APP_TZ } from '@/lib/time';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const settings = await withUser(user.id, async c => getSettings(c, user.id));
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: APP_TZ });
  return (
    <div className="app">
      <Sidebar showStudent={settings.studentEnabled} showWork={settings.mode === 'work'} />
      <div className="main">
        <header className="topbar">
          <span className="mobile-brand"><BuddyLogo size={28} /> My Buddy</span>
          <span className="muted small desktop-only">{todayLabel}</span>
          <div className="topbar-right">
            <ThemeSwitch initial={settings.theme} />
            <ProfileMenu name={user.name} email={user.email} />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
