import { FocusTools, FOCUS_TABS, type FocusTab, type ReminderRow } from '@/components/focus/FocusTools';
import { PremiumGate } from '@/components/PremiumGate';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { dateKeyIn, inputInZone, isUuid, shiftDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

const INTRO: Record<FocusTab, string> = {
  timer: 'Work in one block of time without interruptions. Finished sessions appear in Stats and on Today.',
  breaks: 'Regular reminders to step away from the screen, at the interval you choose.',
  alarm: 'Alarms that ring at a set time, once or on the days you pick.',
  stopwatch: 'Time anything, with laps. Log the time as a focus session when you are done.',
  reminders: 'Quick reminders for later today or any day. They ring in the app at the time.',
};

async function FocusPageContent({ taskId, tab }: { taskId: string | null; tab: FocusTab }) {
  const user = await getCurrentUser();
  const data = await withUser(user!.id, async c => {
    const settings = await getSettings(c, user!.id);
    const tz = settings.timezone;
    const task = taskId ? (await c.query<{ id: string; title: string }>(`select id, title from tasks where id = $1 and deleted_at is null and not done`, [taskId])).rows[0] ?? null : null;
    const ws = await personalWorkspaceId(c, user!.id);
    const today = dateKeyIn(tz);
    const rows = (await c.query<{ id: string; title: string; reminder_at: Date; body: string; device_id: string | null }>(
      `select id, title, reminder_at, body, device_id from notes
        where workspace_id = $1 and deleted_at is null and reminder_at is not null
          and (reminder_at at time zone $2)::date >= $3::date and reminder_at < now() + interval '366 days'
        order by reminder_at limit 100`, [ws, tz, today])).rows;
    const tomorrow = shiftDateKey(today, 1);
    const reminders: ReminderRow[] = rows.map(r => {
      const day = dateKeyIn(tz, r.reminder_at);
      const time = r.reminder_at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz });
      const dayLabel = day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : r.reminder_at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
      return { id: r.id, title: r.title || 'Untitled', atMs: r.reminder_at.getTime(), when: `${dayLabel}, ${time}`, isNote: r.body !== '' || r.device_id !== 'web-quick-reminder' };
    });
    const soon = new Date(Math.ceil((Date.now() + 60 * 60_000) / 300_000) * 300_000).toISOString();
    return { task, reminders, defaultAt: inputInZone(soon, tz) };
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Focus</h1>
          <p>{data.task && tab === 'timer' ? <>Focusing on a task from your to-do list.</> : INTRO[tab]}</p>
        </div>
      </div>
      <FocusTools initialTab={tab} task={data.task} reminders={data.reminders} defaultAt={data.defaultAt} />
    </>
  );
}

export default async function FocusPage({ searchParams }: { searchParams: Promise<{ task?: string; tab?: string }> }) {
  const { task, tab } = await searchParams;
  const current = FOCUS_TABS.some(t => t.id === tab) ? tab as FocusTab : 'timer';
  return <PremiumGate feature="Focus tools"><FocusPageContent taskId={isUuid(task) ? task : null} tab={current} /></PremiumGate>;
}
