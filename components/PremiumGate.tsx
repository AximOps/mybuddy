import Link from 'next/link';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { startFreeTrial } from '@/app/actions';
import { PERIOD, PREMIUM_ENABLED, PREMIUM_FEATURES, PRICE } from '@/lib/plans';
import { withUser } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';

/** Shows the page only to premium plans, once PREMIUM_ENABLED is switched on. */
export async function PremiumGate({ feature, children }: { feature: string; children: ReactNode }) {
  if (!PREMIUM_ENABLED) return <>{children}</>;
  const user = await getCurrentUser();
  const settings = user ? await withUser(user.id, async c => getSettings(c, user.id)) : null;
  if (settings && settings.plan === 'premium') return <>{children}</>;
  const match = PREMIUM_FEATURES.find(f => f.title.toLowerCase().startsWith(feature.toLowerCase().split(' ')[0]));
  const canTrial = settings ? !settings.trialUsed : false;
  return (
    <section className="card gate">
      <div className="gate-icon" aria-hidden="true"><Lock size={26} strokeWidth={2.2} /></div>
      <h1>{feature} is part of Premium</h1>
      <p>{match ? `${match.detail} ` : ''}{canTrial ? `Try it free for 15 days, then ${PRICE} ${PERIOD}.` : `Upgrade for ${PRICE} ${PERIOD} to unlock it.`}</p>
      <ul className="gate-list" aria-label="Premium includes">
        {PREMIUM_FEATURES.map(f => <li key={f.title} className={`badge ${f === match ? 'accent' : ''}`}>{f.icon} {f.title}</li>)}
      </ul>
      <div className="actions">
        {canTrial ? (
          <form action={startFreeTrial}><button type="submit" className="btn primary">Start 15-day free trial</button></form>
        ) : null}
        <Link className={`btn ${canTrial ? '' : 'primary'}`} href="/settings#plan">See plans</Link>
      </div>
    </section>
  );
}
