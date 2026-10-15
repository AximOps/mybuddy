import Link from 'next/link';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn } from '@/lib/time';

export const dynamic = 'force-dynamic';

const PAGE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; page?: string }> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const plan = sp.plan === 'premium' || sp.plan === 'free' ? sp.plan : '';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const rows = await withUser(user!.id, async c =>
    (await c.query<{
      user_id: string; user_name: string; user_email: string; joined_at: Date; plan: string; plan_until: Date | null;
      mode: string; last_active: Date | null; routines: number; tasks: number; notes: number; expenses: number; time_entries: number; organisations: number;
    }>(`select * from admin_list_users($1, $2, $3, $4)`, [q, plan, PAGE, (page - 1) * PAGE])).rows);

  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(plan ? { plan } : {}), page: String(p) })}`;

  return (
    <>
      <div className="page-head">
        <div><h1>Users</h1><p>Find an account, check its plan and activity, then support it.</p></div>
      </div>
      <form method="get" className="actions" style={{ marginBottom: 16 }}>
        <input className="input" name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" style={{ width: 280 }} />
        <select className="select" name="plan" defaultValue={plan} aria-label="Plan" style={{ width: 160 }}>
          <option value="">All plans</option><option value="premium">Premium</option><option value="free">Free</option>
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>

      <section className="card flush">
        {rows.length === 0 ? <div className="empty">No accounts match.</div> : (
          <table className="table">
            <thead>
              <tr><th>Account</th><th>Joined</th><th>Plan</th><th>Mode</th><th>Last active</th><th className="num">Items</th><th className="action-col" aria-label="Open" /></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id}>
                  <td><strong>{r.user_name || '—'}</strong><div className="small muted">{r.user_email}</div></td>
                  <td className="small">{dateKeyIn('Asia/Kolkata', new Date(r.joined_at))}</td>
                  <td>
                    <span className={`badge ${r.plan === 'premium' ? 'accent' : ''}`}>{r.plan === 'premium' ? 'Premium' : 'Free'}</span>
                    {r.plan_until ? <div className="small muted">until {dateKeyIn('Asia/Kolkata', new Date(r.plan_until))}</div> : null}
                  </td>
                  <td><span className="badge">{r.mode}</span></td>
                  <td className="small">{r.last_active ? dateKeyIn('Asia/Kolkata', new Date(r.last_active)) : <span className="muted">Never</span>}</td>
                  <td className="num small">{r.routines} routines · {r.tasks} tasks · {r.notes} notes · {r.expenses} expenses · {r.time_entries} time entries</td>
                  <td className="action-col"><Link className="btn sm" href={`/admin/users/${r.user_id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <div className="actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
        {page > 1 ? <Link className="btn" href={link(page - 1)}>‹ Previous</Link> : <span />}
        <span className="small muted">Page {page}</span>
        {rows.length === PAGE ? <Link className="btn" href={link(page + 1)}>Next ›</Link> : <span />}
      </div>
    </>
  );
}
