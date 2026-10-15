import Link from 'next/link';
import { CheckCircle2, CheckSquare, Clock, NotebookPen, Repeat, Search, Wallet } from 'lucide-react';
import { withUser } from '@/lib/db';
import { initials } from '@/lib/initials';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn } from '@/lib/time';

export const dynamic = 'force-dynamic';

const PAGE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; page?: string; deleted?: string }> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const plan = sp.plan === 'premium' || sp.plan === 'free' ? sp.plan : '';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const rows = await withUser(user!.id, async c =>
    (await c.query<{
      user_id: string; user_name: string; user_email: string; joined_at: Date; plan: string; plan_until: Date | null;
      mode: string; last_active: Date | null; routines: number; tasks: number; notes: number; expenses: number; time_entries: number; organisations: number;
      suspended: boolean; trial: boolean;
    }>(`select * from admin_list_users($1, $2, $3, $4)`, [q, plan, PAGE, (page - 1) * PAGE])).rows);

  const link = (p: number, nextPlan = plan) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(nextPlan ? { plan: nextPlan } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <>
      {sp.deleted ? <div className="notice success" role="status"><CheckCircle2 size={18} aria-hidden="true" /> The account was deleted.</div> : null}
      <div className="page-head">
        <div><h1>Users</h1><p>Find an account, check its plan and activity, then support it.</p></div>
      </div>

      <div className="filter-bar">
        <form method="get" className="admin-search" role="search">
          <Search size={16} aria-hidden="true" />
          <input className="input" name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search users" />
          {plan ? <input type="hidden" name="plan" value={plan} /> : null}
        </form>
        <nav className="seg" aria-label="Plan">
          <Link href={link(1, '')} aria-current={plan === '' ? 'true' : undefined}>All plans</Link>
          <Link href={link(1, 'premium')} aria-current={plan === 'premium' ? 'true' : undefined}>Premium</Link>
          <Link href={link(1, 'free')} aria-current={plan === 'free' ? 'true' : undefined}>Free</Link>
        </nav>
        {q ? <Link className="btn ghost sm" href={link(1)}>Clear search</Link> : null}
      </div>

      <section className="card flush">
        {rows.length === 0 ? <div className="empty">No accounts match{q ? ` “${q}”` : ''}.</div> : (
          <table className="table">
            <thead>
              <tr><th>Account</th><th>Status</th><th>Plan</th><th>Mode</th><th>Joined</th><th>Last active</th><th>Items</th><th className="action-col" aria-label="Open" /></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id}>
                  <td>
                    <Link href={`/admin/users/${r.user_id}`} className="user-cell">
                      <span className="avatar" aria-hidden="true">{initials(r.user_name, r.user_email)}</span>
                      <span><strong>{r.user_name || 'No name'}</strong><span className="small muted">{r.user_email}</span></span>
                    </Link>
                  </td>
                  <td>{r.suspended ? <span className="badge danger">Suspended</span> : r.trial ? <span className="badge warn">Trial</span> : <span className="badge success">Active</span>}</td>
                  <td>
                    <span className={`badge ${r.plan === 'premium' ? 'sun' : ''}`}>{r.plan === 'premium' ? 'Premium' : 'Free'}</span>
                    {r.plan_until ? <div className="small muted" style={{ marginTop: 3 }}>until {dateKeyIn('Asia/Kolkata', new Date(r.plan_until))}</div> : null}
                  </td>
                  <td className="small" style={{ textTransform: 'capitalize' }}>{r.mode}</td>
                  <td className="small num">{dateKeyIn('Asia/Kolkata', new Date(r.joined_at))}</td>
                  <td className="small num">{r.last_active ? dateKeyIn('Asia/Kolkata', new Date(r.last_active)) : <span className="muted">Never</span>}</td>
                  <td>
                    <span className="counts" aria-label={`${r.routines} routines, ${r.tasks} tasks, ${r.notes} notes, ${r.expenses} expenses, ${r.time_entries} time entries`}>
                      <span title="Routines"><Repeat size={13} aria-hidden="true" />{r.routines}</span>
                      <span title="Tasks"><CheckSquare size={13} aria-hidden="true" />{r.tasks}</span>
                      <span title="Notes"><NotebookPen size={13} aria-hidden="true" />{r.notes}</span>
                      <span title="Expenses"><Wallet size={13} aria-hidden="true" />{r.expenses}</span>
                      <span title="Time entries"><Clock size={13} aria-hidden="true" />{r.time_entries}</span>
                    </span>
                  </td>
                  <td className="action-col"><Link className="btn sm" href={`/admin/users/${r.user_id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <div className="pager">
        {page > 1 ? <Link className="btn" href={link(page - 1)}>‹ Previous</Link> : <span />}
        <span className="small muted">Page {page}{rows.length ? ` · ${rows.length} shown` : ''}</span>
        {rows.length === PAGE ? <Link className="btn" href={link(page + 1)}>Next ›</Link> : <span />}
      </div>
    </>
  );
}
