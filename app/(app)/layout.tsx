import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { BrandLockup } from '@/components/BuddyLogo';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Sidebar } from '@/components/Sidebar';
import { Notifier } from '@/components/Notifier';
import { TrialBanner } from '@/components/TrialBanner';
import { FocusProvider } from '@/components/focus/FocusProvider';
import { FocusBall } from '@/components/focus/FocusBall';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { getAppContext } from '@/lib/app-context';
import { isPremium } from '@/lib/entitlements';
import { APP_TZ } from '@/lib/time';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAppContext();
  if (!ctx) redirect('/login');
  const { user, settings, admin } = ctx;
  if (!settings.onboarded) redirect('/welcome');
  // Subscribe reminders: from day 10 of the trial (5 days left), and for a week after it ends.
  const untilMs = settings.planUntil ? Date.parse(settings.planUntil) : null;
  const daysLeft = untilMs ? Math.ceil((untilMs - Date.now()) / 86_400_000) : 0;
  const trialBanner = settings.trialActive && daysLeft <= 5 ? { kind: 'ending' as const, daysLeft }
    : settings.plan === 'free' && settings.trialUsed && untilMs && Date.now() - untilMs < 7 * 86_400_000 && Date.now() > untilMs ? { kind: 'ended' as const, daysLeft: 0 } : null;
  const now = new Date();
  const weekday = now.toLocaleDateString('en-IN', { weekday: 'long', timeZone: APP_TZ });
  const dayMonth = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: APP_TZ });
  return (
    <FocusProvider>
    <div className="app">
      <Sidebar showStudent={settings.studentEnabled && isPremium(settings)} showWork={settings.mode === 'work' && isPremium(settings)} showTeam={settings.mode !== 'personal'} premium={isPremium(settings)} trialUntil={settings.trialActive ? settings.planUntil : null} />
      <div className="main">
        <header className="topbar">
          <span className="mobile-brand"><BrandLockup size={30} /></span>
          <span className="topbar-date desktop-only"><strong>{weekday}</strong><span className="small muted">{dayMonth}</span></span>
          <div className="topbar-right">
            <ThemeSwitch initial={settings.theme} />
            <ProfileMenu name={user.name} email={user.email} showAdmin={admin} />
          </div>
        </header>
        {trialBanner ? <TrialBanner kind={trialBanner.kind} daysLeft={trialBanner.daysLeft} /> : null}
        <div className="content">{children}</div>
        <Notifier />
        <FocusBall />
      </div>
    </div>
    </FocusProvider>
  );
}
