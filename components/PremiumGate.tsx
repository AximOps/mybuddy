import Link from 'next/link';
import type { ReactNode } from 'react';
import { PREMIUM_ENABLED } from '@/lib/plans';
import { withUser } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';

/** Shows the page only to premium plans, once PREMIUM_ENABLED is switched on. */
export async function PremiumGate({ feature, children }: { feature: string; children: ReactNode }) {
  if (!PREMIUM_ENABLED) return <>{children}</>;
  const user = await getCurrentUser();
  const settings = user ? await withUser(user.id, async c => getSettings(c, user.id)) : null;
  if (settings && settings.plan === 'premium') return <>{children}</>;
  return (
    <section className="card card-body" style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 40 }} aria-hidden="true">🔒</div>
      <h1 style={{ margin: '10px 0 6px' }}>{feature} is a premium feature</h1>
      <p className="muted" style={{ marginBottom: 16 }}>Upgrade to unlock it, for $10 a year.</p>
      <Link className="btn primary" href="/settings#plan">See plans</Link>
    </section>
  );
}
