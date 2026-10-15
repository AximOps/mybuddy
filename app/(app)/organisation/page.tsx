import { PremiumGate } from '@/components/PremiumGate';
import { changeMemberRole, createOrganisation, inviteMember, removeMember, revokeInvite } from '@/app/actions';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { dateKeyIn } from '@/lib/time';
import { APP_TZ } from '@/lib/time';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Employee' };

async function OrganisationPageContent({ searchParams }: { searchParams: Promise<{ invited?: string; sent?: string; mailError?: string }> }) {
  const user = await getCurrentUser();
  const { invited, sent, mailError } = await searchParams;

  const data = await withUser(user!.id, async c => {
    const orgs = (await c.query<{ id: string; name: string; role: string }>(
      `select o.id, o.name, m.role from organisation_members m join organisations o on o.id = m.organisation_id
        where m.user_id = $1 order by o.name`, [user!.id])).rows;
    const org = orgs[0] ?? null;
    if (!org) return { org: null, members: [], invites: [], mine: null };
    const members = (await c.query<{ user_id: string; role: string; name: string; email: string }>(
      `select m.user_id, m.role, u.name, u.email from organisation_members m join "user" u on u.id = m.user_id
        where m.organisation_id = $1 order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.name`, [org.id])).rows;
    const invites = (await c.query<{ id: string; email: string; role: string; expires_at: Date }>(
      `select id, email, role, expires_at from invitations where organisation_id = $1 and accepted_at is null and expires_at > now() order by created_at desc`, [org.id])).rows;
    return { org, members, invites, mine: org.role };
  });

  const canManage = data.mine === 'owner' || data.mine === 'admin';

  if (!data.org) {
    return (
      <>
        <div className="page-head"><div><h1>Organisation</h1><p>Create a team to invite employees and share a workspace.</p></div></div>
        <section className="card card-body" style={{ maxWidth: 520 }}>
          <form action={createOrganisation} className="stack" style={{ gap: 12 }}>
            <label className="field">Organisation name<input className="input" name="name" required maxLength={120} placeholder="e.g. Acme Pvt Ltd" /></label>
            <button className="btn primary block" type="submit">Create organisation</button>
          </form>
          <p className="small muted" style={{ marginTop: 14 }}>You become the owner. You can invite employees by email afterwards.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div><h1>{data.org.name}</h1><p>Your role: {ROLE_LABEL[data.mine ?? 'member']} · {data.members.length} members</p></div>
      </div>

      {sent ? (
        <section className="card card-body" style={{ marginBottom: 20, borderColor: 'var(--success)' }}>
          <h2>Invitation emailed</h2>
          <p className="small muted">An invitation was sent to {sent}. It works once and expires in 7 days.</p>
        </section>
      ) : null}
      {invited ? (
        <section className="card card-body" style={{ marginBottom: 20, borderColor: 'var(--accent)' }}>
          <h2 style={{ marginBottom: 8 }}>Invitation created</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>
            {mailError ? `${mailError} ` : 'Email is not set up, so copy this link and send it yourself. '}
            It works once, only for the email address you invited, and expires in 7 days.
          </p>
          <input className="input" readOnly value={invited} aria-label="Invitation link" />
        </section>
      ) : null}

      <div className="layout-2">
        <section className="card flush">
          <div className="card-head"><h2>Members</h2></div>
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th>{canManage ? <th className="action-col" aria-label="Actions" /> : null}</tr></thead>
            <tbody>
              {data.members.map(m => (
                <tr key={m.user_id}>
                  <td><strong>{m.name || m.email}</strong>{m.user_id === user!.id ? <span className="small muted"> (you)</span> : null}<div className="small muted">{m.email}</div></td>
                  <td>
                    {canManage && m.user_id !== user!.id && !(m.role === 'owner' && data.mine !== 'owner') ? (
                      <form action={changeMemberRole} className="actions">
                        <input type="hidden" name="orgId" value={data.org!.id} />
                        <input type="hidden" name="userId" value={m.user_id} />
                        <select className="select" name="role" defaultValue={m.role} style={{ width: 130 }} aria-label={`Role for ${m.name || m.email}`}>
                          {data.mine === 'owner' ? <option value="owner">Owner</option> : null}
                          <option value="admin">Admin</option>
                          <option value="member">Employee</option>
                        </select>
                        <button className="btn sm" type="submit">Save</button>
                      </form>
                    ) : <span className="badge">{ROLE_LABEL[m.role]}</span>}
                  </td>
                  {canManage ? (
                    <td className="action-col">
                      {m.user_id !== user!.id && !(m.role === 'owner' && data.mine !== 'owner') ? (
                        <form action={removeMember}>
                          <input type="hidden" name="orgId" value={data.org!.id} />
                          <input type="hidden" name="userId" value={m.user_id} />
                          <button className="btn ghost sm danger" type="submit">Remove</button>
                        </form>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="stack">
          {canManage ? (
            <section className="card card-body">
              <h2 style={{ marginBottom: 12 }}>Invite someone</h2>
              <form action={inviteMember} className="stack" style={{ gap: 12 }}>
                <input type="hidden" name="orgId" value={data.org!.id} />
                <label className="field">Email<input className="input" type="email" name="email" required /></label>
                <label className="field">Role
                  <select className="select" name="role" defaultValue="member">
                    {data.mine === 'owner' ? <option value="owner">Owner</option> : null}
                    <option value="admin">Admin</option>
                    <option value="member">Employee</option>
                  </select>
                </label>
                <button className="btn primary block" type="submit">Create invitation link</button>
              </form>
            </section>
          ) : null}

          {canManage ? (
            <section className="card flush">
              <div className="card-head"><h2>Pending invitations</h2><span className="muted small">{data.invites.length}</span></div>
              {data.invites.length === 0 ? <div className="empty" style={{ padding: 16 }}>No pending invitations.</div> : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {data.invites.map(i => (
                    <li key={i.id} className="card-body actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)' }}>
                      <div><div>{i.email}</div><div className="small muted">{ROLE_LABEL[i.role]} · expires {dateKeyIn(APP_TZ, new Date(i.expires_at))}</div></div>
                      <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><button className="btn ghost sm danger" type="submit">Revoke</button></form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default async function OrganisationPage(props: Parameters<typeof OrganisationPageContent>[0]) {
  return <PremiumGate feature="Teams"><OrganisationPageContent {...props} /></PremiumGate>;
}
