import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react';
import { AdminNav } from '@/components/AdminNav';
import { BrandLockup } from '@/components/BuddyLogo';
import { ProfileMenu } from '@/components/ProfileMenu';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { withUser } from '@/lib/db';
import { isPlatformAdmin } from '@/lib/admin';
import { getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Admin area. Anyone who is not a platform admin gets "not found", so the area is not revealed. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { admin, settings } = await withUser(user.id, async c => ({ admin: await isPlatformAdmin(c, user.id), settings: await getSettings(c, user.id) }));
  if (!admin) notFound();
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="brand"><BrandLockup size={38} onDark /></div>
        <span className="admin-badge"><ShieldCheck size={13} aria-hidden="true" /> Admin console</span>
        <AdminNav variant="side" />
        <div className="admin-side-foot">
          <p className="admin-side-note">Personal content (tasks, notes, spending, time) is never shown here.</p>
          <Link href="/today"><ArrowLeft size={17} aria-hidden="true" /> Back to Amiroon</Link>
        </div>
      </aside>
      <div className="admin-main">
        <header className="topbar">
          <span className="mobile-brand"><BrandLockup size={28} /></span>
          <form action="/admin/users" method="get" className="admin-search desktop-only" role="search">
            <Search size={16} aria-hidden="true" />
            <input className="input" name="q" placeholder="Find a user by name or email" aria-label="Find a user" />
          </form>
          <div className="topbar-right">
            <ThemeSwitch initial={settings.theme} />
            <ProfileMenu name={user.name} email={user.email} />
          </div>
        </header>
        <AdminNav variant="tabs" />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
