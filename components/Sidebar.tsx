'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, ListChecks, LogOut, NotebookPen, Repeat, Settings, Timer, Wallet } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

const ITEMS = [
  { href: '/today', label: 'Today', icon: CalendarDays },
  { href: '/focus', label: 'Focus', icon: Timer },
  { href: '/tasks', label: 'To-Do', icon: ListChecks },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/routines', label: 'Routines', icon: Repeat },
  { href: '/spend', label: 'Spending', icon: Wallet },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">🙂</span>
        My Buddy
      </div>
      <nav className="nav" aria-label="Main">
        {ITEMS.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="user-chip">
          <strong>{name || 'Signed in'}</strong>
          <span className="muted small">{email}</span>
        </div>
        <button
          type="button"
          className="btn ghost block"
          onClick={async () => { await authClient.signOut(); router.push('/login'); }}
        >
          <LogOut size={16} strokeWidth={1.9} aria-hidden="true" /> Log out
        </button>
      </div>
    </aside>
  );
}
