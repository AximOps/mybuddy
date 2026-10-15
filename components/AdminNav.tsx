'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, Users } from 'lucide-react';

const LINKS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/admin/teams', label: 'Teams', icon: Building2, exact: false },
];

/** Admin navigation: a column in the sidebar on desktop, pill tabs under the top bar on phones. */
export function AdminNav({ variant }: { variant: 'side' | 'tabs' }) {
  const pathname = usePathname();
  const active = (href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className={variant === 'side' ? 'admin-nav' : 'admin-tabs'} aria-label="Admin">
      {LINKS.map(({ href, label, icon: Icon, exact }) => (
        <Link key={href} href={href} aria-current={active(href, exact) ? 'page' : undefined}>
          {variant === 'side' ? <Icon size={18} strokeWidth={1.9} aria-hidden="true" /> : null}
          {label}
        </Link>
      ))}
      {variant === 'tabs' ? <Link href="/today">Back to app</Link> : null}
    </nav>
  );
}
