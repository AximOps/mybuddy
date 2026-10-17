import { isPlatformAdmin } from '@/lib/admin';
import { withUser } from '@/lib/db';
import { isPremium } from '@/lib/entitlements';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Who is signed in, for the phone app. The app sends its session token as a bearer token.
 * Returns the profile and the few settings the app needs: mode, plan, trial end and time zone.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Not signed in.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { settings, admin } = await withUser(user.id, async c => ({ settings: await getSettings(c, user.id), admin: await isPlatformAdmin(c, user.id) }));
  return Response.json({
    user: { id: user.id, name: user.name, email: user.email },
    // Platform admins see Admin in the app's profile menu (it opens the website's admin pages).
    admin,
    settings: {
      mode: settings.mode, onboarded: settings.onboarded, timezone: settings.timezone, currency: settings.currency,
      premium: isPremium(settings), plan: settings.plan, planUntil: settings.planUntil, trialActive: settings.trialActive,
      studentEnabled: settings.studentEnabled,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
