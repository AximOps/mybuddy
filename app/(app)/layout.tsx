import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { Sidebar } from '@/components/Sidebar';
import { APP_TZ } from '@/lib/time';
import { getCurrentUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: APP_TZ });
  return (
    <div className="app">
      <Sidebar name={user.name} email={user.email} />
      <div className="main">
        <header className="topbar">
          <span className="mobile-brand"><span className="brand-mark" aria-hidden="true">🙂</span> My Buddy</span>
          <span className="muted small desktop-only">{todayLabel}</span>
          <span className="muted small desktop-only">Signed in as {user.email}</span>
          <span className="mobile-only"><LogoutButton compact /></span>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
