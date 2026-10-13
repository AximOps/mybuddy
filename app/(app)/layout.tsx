import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/SignOutButton';
import { getCurrentUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/today" className="brand">My Buddy</Link>
        <nav>
          <Link href="/today">Today</Link>
          <Link href="/tasks">Tasks</Link>
          <Link href="/notes">Notes</Link>
        </nav>
        <SignOutButton />
      </header>
      <main className="wide">{children}</main>
    </div>
  );
}
