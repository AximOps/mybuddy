import Link from 'next/link';
import { WeekBoard, type WeekDay, type WeekItem } from '@/components/WeekBoard';
import { withUser } from '@/lib/db';
import { isPremium } from '@/lib/entitlements';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { loadToday } from '@/lib/today';
import { dateKeyIn, isDateKey, shiftDateKey, weekdayOf } from '@/lib/time';

export const dynamic = 'force-dynamic';

const LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const user = await getCurrentUser();
  const { start: requested } = await searchParams;
  const data = await withUser(user!.id, async c => {
    const settings = await getSettings(c, user!.id);
    const today = dateKeyIn(settings.timezone);
    const base = isDateKey(requested) ? requested : today;
    const monday = shiftDateKey(base, -((weekdayOf(base) + 6) % 7));
    const ws = await personalWorkspaceId(c, user!.id);
    const premium = isPremium(settings);
    const days: WeekDay[] = [];
    let nowMin: number | null = null;
    for (let i = 0; i < 7; i++) {
      const day = shiftDateKey(monday, i);
      const t = await loadToday(c, { ws, userId: user!.id, day, today, tz: settings.timezone, premium, student: settings.studentEnabled, workMode: settings.mode === 'work', budgetMinor: null });
      if (day === today) nowMin = t.nowMin;
      const items: WeekItem[] = t.agenda.map(a => ({
        key: a.key, kind: a.kind, title: a.title, emoji: a.emoji, meta: a.meta, done: a.done, startMin: a.startMin, endMin: a.endMin, href: a.href,
        move: a.kind === 'task' ? { kind: 'task' as const, id: a.key.slice(1) } : a.kind === 'meeting' ? { kind: 'meeting' as const, id: a.key.slice(1) } : undefined,
      }));
      // To-dos without a time sit in the "Any time" row (overdue ones only on today).
      for (const task of [...t.tasks.today, ...(day === today ? t.tasks.overdue.filter(o => o.dueDate! < monday) : [])]) {
        if (task.dueTime !== null && task.dueDate === day) continue;
        items.push({ key: `t${task.id}`, kind: 'task', title: task.title, emoji: task.overdue ? '⚠️' : '✅', meta: task.overdue ? `Overdue since ${task.dueDate}` : `To-do · ${task.tag}`, done: task.done, startMin: null, endMin: null, href: '/tasks', move: { kind: 'task', id: task.id } });
      }
      const [, mo, dd] = day.split('-').map(Number);
      days.push({ day, label: LABEL[weekdayOf(day)], date: `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]}`, isToday: day === today, items, routinePct: t.routineTotal ? Math.round((t.routineDone / t.routineTotal) * 100) : 0 });
    }
    return { monday, today, days, nowMin };
  });
  const { monday, days } = data;
  const sunday = shiftDateKey(monday, 6);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Week</h1>
          <p>{days[0].date} – {days[6].date}. Drag a to-do or a meeting to another day or time to move it.</p>
        </div>
        <div className="actions">
          <Link className="btn" href={`/week?start=${shiftDateKey(monday, -7)}`}>‹ Previous</Link>
          {data.today < monday || data.today > sunday ? <Link className="btn" href="/week">This week</Link> : null}
          <Link className="btn" href={`/week?start=${shiftDateKey(monday, 7)}`}>Next ›</Link>
        </div>
      </div>
      <div className="week-legend small">
        <span className="kind-chip kind-routine">Routine</span><span className="kind-chip kind-task">To-do</span><span className="kind-chip kind-meeting">Meeting</span>
        <span className="kind-chip kind-class">Class</span><span className="kind-chip kind-reminder">Reminder</span><span className="kind-chip kind-focus">Focus</span>
        <span className="muted">Dashed items can be dragged.</span>
      </div>
      <section className="card week-card"><WeekBoard days={days} nowMin={data.nowMin} /></section>
    </>
  );
}
