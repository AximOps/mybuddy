'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Sparkles, BarChart3, Briefcase, CalendarDays, GraduationCap, ListChecks, NotebookPen, Timer, Users, Wallet } from 'lucide-react';
import { BrandLockup } from './BuddyLogo';

const ITEMS = [
  { href: '/today', label: 'Today', icon: CalendarDays },
  { href: '/focus', label: 'Focus', icon: Timer },
  { href: '/tasks', label: 'To-Do', icon: ListChecks },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/spend', label: 'Spending', icon: Wallet },
  { href: '/organisation', label: 'Team', icon: Users },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
];

/** Side navigation on desktop, and a bottom bar with the same links on phones. */
export function Sidebar({ showStudent, showWork, premium, trialUntil = null }: { name?: string; email?: string; showStudent: boolean; showWork: boolean; premium: boolean; trialUntil?: string | null }) {
  const PREMIUM_HREFS = ['/focus', '/spend', '/organisation', '/student', '/work'];
  const pathname = usePathname();
  const withStudent = showStudent ? [...ITEMS.slice(0, 4), { href: '/student', label: 'Student', icon: GraduationCap }, ...ITEMS.slice(4)] : ITEMS;
  const items = showWork ? [...withStudent.slice(0, withStudent.findIndex(i => i.href === '/spend') + 1), { href: '/work', label: 'Work', icon: Briefcase }, ...withStudent.slice(withStudent.findIndex(i => i.href === '/spend') + 1)] : withStudent;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <BrandLockup size={38} />
        </div>
        <nav className="nav" aria-label="Main">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                {item.label}
                {!premium && PREMIUM_HREFS.includes(item.href) ? <Lock size={13} strokeWidth={2.2} aria-label="Premium" className="lock-icon" /> : null}
              </Link>
            );
          })}
        </nav>
        {premium ? (
          <div className="sidebar-plan">
            <span className="plan-chip"><Sparkles size={13} aria-hidden="true" /> {trialUntil ? 'Premium trial' : 'Premium'}</span>
            <span className="small muted">{trialUntil ? `Free until ${new Date(trialUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Every feature is unlocked.` : 'Every feature is unlocked. Thanks for supporting My Buddy.'}</span>
          </div>
        ) : (
          <div className="sidebar-plan is-free">
            <strong>Unlock Premium</strong>
            <span className="small muted">Focus timer, spending, student, work and teams. Free for 15 days.</span>
            <Link href="/settings#plan" className="btn primary sm">See plans</Link>
          </div>
        )}
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
