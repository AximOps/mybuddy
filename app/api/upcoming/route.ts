import { withUser } from '@/lib/db';
import { isPremium } from '@/lib/entitlements';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { loadToday } from '@/lib/today';
import { dateKeyIn, fmtMinutes, shiftDateKey, zonedToUtc } from '@/lib/time';

export const dynamic = 'force-dynamic';

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Timed items for today and tomorrow, as epoch times, for reminders in the browser. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ items: [] }, { status: 401 });
  const items = await withUser(user.id, async c => {
    const settings = await getSettings(c, user.id);
    const today = dateKeyIn(settings.timezone);
    const ws = await personalWorkspaceId(c, user.id);
    const out: { key: string; kind: string; title: string; body: string; at: number; href: string }[] = [];
    for (const day of [today, shiftDateKey(today, 1)]) {
      const t = await loadToday(c, { ws, userId: user.id, day, today, tz: settings.timezone, premium: isPremium(settings), student: settings.studentEnabled, workMode: settings.mode === 'work', budgetMinor: null });
      for (const a of t.agenda) {
        if (a.startMin === null || a.done || a.kind === 'focus') continue;
        out.push({
          key: `${a.key}|${day}`, kind: a.kind, title: `${a.emoji} ${a.title}`,
          body: `${fmtMinutes(a.startMin)}${a.endMin !== null ? `–${fmtMinutes(a.endMin)}` : ''} · ${a.meta}`,
          at: zonedToUtc(`${day}T${hhmm(a.startMin)}`, settings.timezone), href: a.href ?? '/today',
        });
      }
    }
    return out.filter(i => i.at > Date.now() - 60_000);
  });
  return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
