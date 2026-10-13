import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
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
          <span className="muted small">{todayLabel}</span>
          <span className="muted small">Signed in as {user.email}</span>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
