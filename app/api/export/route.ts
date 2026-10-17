import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Downloads everything in the signed-in person's personal workspace as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const data = await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const [routines, days, events, tasks, notes, focus] = await Promise.all([
      c.query(`select id, name, color, sort_order from routines where workspace_id = $1 and deleted_at is null`, [ws]),
      c.query(`select weekday, routine_id from routine_days where workspace_id = $1 and deleted_at is null`, [ws]),
      c.query(`select id, routine_id, title, emoji, start_min, end_min, category from events where workspace_id = $1 and deleted_at is null`, [ws]),
      c.query(`select id, title, due_date, due_time, tag, done, completed_at from tasks where workspace_id = $1 and deleted_at is null`, [ws]),
      c.query(`select id, title, body, tag, pinned, reminder_at, updated_at from notes where workspace_id = $1 and deleted_at is null`, [ws]),
      c.query(`select title, minutes, completed_at from focus_sessions where user_id = $1 order by completed_at`, [user.id]),
    ]);
    return { routines: routines.rows, routineDays: days.rows, events: events.rows, tasks: tasks.rows, notes: notes.rows, focusSessions: focus.rows };
  });

  const body = JSON.stringify({ app: 'amiroon-web', exportedAt: new Date().toISOString(), data }, null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="my-buddy-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
