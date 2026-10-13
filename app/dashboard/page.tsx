import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/SignOutButton';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Runs as this user, so row-level security returns only the workspaces they belong to.
  const workspaces = await withUser(user.id, async client => {
    const { rows } = await client.query<{ id: string; name: string; kind: string; role: string }>(
      `select w.id, w.name, w.kind, m.role
         from workspaces w
         join workspace_members m on m.workspace_id = w.id
        where m.user_id = $1
        order by w.created_at`,
      [user.id],
    );
    return rows;
  });

  return (
    <main>
      <h1>Hi, {user.name || 'buddy'}</h1>
      <p className="muted">{user.email}</p>
      <div className="card">
        <strong>Your workspaces</strong>
        {workspaces.map(w => (
          <p key={w.id} className="muted" style={{ margin: '8px 0 0' }}>
            {w.name} · {w.kind} · {w.role}
          </p>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 20 }}>The daily planner (Today, routines, tasks, notes) comes next.</p>
      <SignOutButton />
    </main>
  );
}
