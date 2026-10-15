import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { BuddyLogo } from '@/components/BuddyLogo';
import { ProfileMenu } from '@/components/ProfileMenu';
import { withUser } from '@/lib/db';
import { isPlatformAdmin } from '@/lib/admin';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Admin area. Anyone who is not a platform admin gets "not found", so the area is not revealed. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const admin = await withUser(user.id, async c => isPlatformAdmin(c, user.id));
  if (!admin) notFound();
  return (
    <div className="admin-shell">
      <header className="topbar">
        <Link href="/admin/users" className="mobile-brand" style={{ display: 'inline-flex' }}>
          <BuddyLogo size={28} /><span style={{ marginLeft: 8 }}>My Buddy <span className="muted small">· Admin</span></span>
        </Link>
        <nav className="admin-nav">
          <Link href="/admin">Overview</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/teams">Teams</Link>
          <Link href="/today">Back to app</Link>
        </nav>
        <div className="topbar-right"><ProfileMenu name={user.name} email={user.email} /></div>
      </header>
      <div className="content">{children}</div>
    </div>
  );
}
