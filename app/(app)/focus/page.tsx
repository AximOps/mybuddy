import { recordFocusSession } from '@/app/actions';
import { FocusTimer } from '@/components/FocusTimer';
import { PremiumGate } from '@/components/PremiumGate';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

async function FocusPageContent({ taskId }: { taskId: string | null }) {
  const user = await getCurrentUser();
  const task = taskId ? await withUser(user!.id, async c =>
    (await c.query<{ id: string; title: string }>(`select id, title from tasks where id = $1 and deleted_at is null and not done`, [taskId])).rows[0] ?? null) : null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Focus</h1>
          <p>{task ? <>Focusing on a task from your to-do list.</> : 'Work in one block of time without interruptions. Finished sessions appear in Stats and on Today.'}</p>
        </div>
      </div>
      <FocusTimer record={recordFocusSession} task={task} />
    </>
  );
}

export default async function FocusPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  return <PremiumGate feature="Focus timer"><FocusPageContent taskId={isUuid(task) ? task : null} /></PremiumGate>;
}
