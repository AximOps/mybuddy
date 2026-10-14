'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Briefcase, CalendarDays, GraduationCap, ListChecks, NotebookPen, Repeat, Settings, Timer, Wallet } from 'lucide-react';
import { LogoutButton } from './LogoutButton';

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

/** Side navigation on desktop, and a bottom bar with the same links on phones. */
export function Sidebar({ name, email, showStudent, showWork }: { name: string; email: string; showStudent: boolean; showWork: boolean }) {
  const pathname = usePathname();
  const withStudent = showStudent ? [...ITEMS.slice(0, 3), { href: '/student', label: 'Student', icon: GraduationCap }, ...ITEMS.slice(3)] : ITEMS;
  const items = showWork ? [...withStudent.slice(0, withStudent.findIndex(i => i.href === '/spend') + 1), { href: '/work', label: 'Work', icon: Briefcase }, ...withStudent.slice(withStudent.findIndex(i => i.href === '/spend') + 1)] : withStudent;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🙂</span>
          My Buddy
        </div>
        <nav className="nav" aria-label="Main">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
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
          <LogoutButton />
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Main">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
