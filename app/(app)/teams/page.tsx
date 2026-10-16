import Link from 'next/link';
import { Briefcase, Check, Pencil, Plus, Users } from 'lucide-react';
import { PremiumGate } from '@/components/PremiumGate';
import { changeMemberRole, createOrganisation, deleteTeam, inviteMember, leaveTeam, removeMember, renameTeam, revokeInvite, workInTeam } from '@/app/actions';
import { withUser } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getCurrentUser } from '@/lib/session';
import { APP_TZ, dateKeyIn, isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Search = { team?: string; invited?: string; sent?: string; mailError?: string; error?: string; created?: string; left?: string; deleted?: string; new?: string };

function CreateTeamForm({ student, first }: { student: boolean; first: boolean }) {
  return (
    <form action={createOrganisation} className="stack" style={{ gap: 12 }}>
      <label className="field">Team name<input className="input" name="name" required maxLength={120} placeholder={student ? 'e.g. Physics project group' : 'e.g. Acme Pvt Ltd, Design team'} autoFocus={!first} /></label>
      <button className="btn primary block" type="submit"><Plus size={16} /> Create team</button>
      <p className="small muted" style={{ margin: 0 }}>You become the owner and can invite people by email. You can be in as many teams as you like.</p>
    </form>
  );
}

async function TeamsPageContent({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  const q = await searchParams;
  const settings = await withUser(user!.id, async c => getSettings(c, user!.id));
  if (settings.mode === 'personal') {
    return (
      <section className="card card-body" style={{ maxWidth: 560 }}>
        <h1>Teams are for Work and Student</h1>
        <p className="muted" style={{ margin: '8px 0 16px' }}>Teams share projects, timesheets and approvals, so they are turned on in Work or Student mode. Personal mode stays focused on your own planning.</p>
        <Link className="btn primary" href="/settings#mode">Change mode in Settings</Link>
      </section>
    );
  }
  const student = settings.mode === 'student';
  const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: student ? 'Member' : 'Employee' };

  const data = await withUser(user!.id, async c => {
    const teams = (await c.query<{ id: string; name: string; role: string; members: number }>(
      `select o.id, o.name, m.role, (select count(*)::int from organisation_members x where x.organisation_id = o.id) as members
         from organisation_members m join organisations o on o.id = m.organisation_id
        where m.user_id = $1 order by lower(o.name)`, [user!.id])).rows;
    const team = teams.find(t => t.id === q.team) ?? teams[0] ?? null;
    if (!team) return { teams, team: null, members: [], invites: [] };
    const members = (await c.query<{ user_id: string; role: string; name: string; email: string }>(
      `select m.user_id, m.role, u.name, u.email from organisation_members m join "user" u on u.id = m.user_id
        where m.organisation_id = $1 order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(u.name)`, [team.id])).rows;
    const invites = team.role === 'member' ? [] : (await c.query<{ id: string; email: string; role: string; expires_at: Date }>(
      `select id, email, role, expires_at from invitations where organisation_id = $1 and accepted_at is null and expires_at > now() order by created_at desc`, [team.id])).rows;
    return { teams, team, members, invites };
  });

  const banner = q.error ? <div className="notice danger" role="alert">{q.error}</div>
    : q.created ? <div className="notice success" role="status">Team created. Invite people below.</div>
    : q.left ? <div className="notice success" role="status">You left the team.</div>
    : q.deleted ? <div className="notice success" role="status">The team was deleted.</div> : null;

  if (!data.team) {
    return (
      <>
        <div className="page-head"><div><h1>Teams</h1><p>{student ? 'Create a team for a class, a project or a study group.' : 'Create a team to invite colleagues and share projects, time and approvals.'}</p></div></div>
        {banner}
        <section className="card card-body" style={{ maxWidth: 520 }}><CreateTeamForm student={student} first /></section>
      </>
    );
  }

  const team = data.team;
  const mine = team.role;
  const canManage = mine === 'owner' || mine === 'admin';
  const owners = data.members.filter(m => m.role === 'owner').length;
  const soleOwner = mine === 'owner' && owners <= 1;
  const showNew = q.new === '1';

  return (
    <>
      <div className="page-head">
        <div><h1>Teams</h1><p>{data.teams.length === 1 ? 'You are in 1 team.' : `You are in ${data.teams.length} teams.`} Pick one to manage it.</p></div>
        <Link className={`btn ${showNew ? '' : 'primary'}`} href={showNew ? `/teams?team=${team.id}` : `/teams?team=${team.id}&new=1`} scroll={false}>
          {showNew ? 'Cancel' : <><Plus size={16} /> New team</>}
        </Link>
      </div>
      {banner}
      {showNew ? <section className="card card-body" style={{ maxWidth: 520, marginBottom: 20 }}><h2 style={{ marginBottom: 12 }}>New team</h2><CreateTeamForm student={student} first={false} /></section> : null}

      <nav className="team-list" aria-label="Your teams">
        {data.teams.map(t => (
          <Link key={t.id} href={`/teams?team=${t.id}`} className={`team-pill ${t.id === team.id ? 'on' : ''}`} aria-current={t.id === team.id ? 'page' : undefined}>
            <span className="team-avatar" aria-hidden="true">{t.name.trim().charAt(0).toUpperCase()}</span>
            <span className="team-pill-text"><strong>{t.name}</strong><span className="small muted">{ROLE_LABEL[t.role]} · {t.members} {t.members === 1 ? 'person' : 'people'}</span></span>
            {t.id === team.id ? <Check size={16} aria-hidden="true" className="team-check" /> : null}
          </Link>
        ))}
      </nav>

      <section className="card card-body team-head">
        <div className="team-head-main">
          <span className="team-avatar lg" aria-hidden="true">{team.name.trim().charAt(0).toUpperCase()}</span>
          <div>
            <h2 style={{ fontSize: 20 }}>{team.name}</h2>
            <p className="small muted" style={{ margin: '2px 0 0' }}>Your role: {ROLE_LABEL[mine]} · {data.members.length} {data.members.length === 1 ? 'member' : 'members'}</p>
          </div>
        </div>
        <div className="actions">
          {!student ? <form action={workInTeam}><input type="hidden" name="orgId" value={team.id} /><button className="btn" type="submit"><Briefcase size={15} /> Open in Work</button></form> : null}
          {canManage ? (
            <details className="team-rename">
              <summary className="btn"><Pencil size={14} /> Rename</summary>
              <form action={renameTeam} className="actions team-rename-form">
                <input type="hidden" name="orgId" value={team.id} />
                <input className="input" name="name" defaultValue={team.name} required maxLength={120} aria-label="Team name" />
                <button className="btn primary sm" type="submit">Save</button>
              </form>
            </details>
          ) : null}
        </div>
      </section>

      {q.sent ? (
        <section className="card card-body" style={{ marginBottom: 20, borderColor: 'var(--success)' }}>
          <h2>Invitation emailed</h2>
          <p className="small muted">An invitation was sent to {q.sent}. It works once and expires in 7 days.</p>
        </section>
      ) : null}
      {q.invited ? (
        <section className="card card-body" style={{ marginBottom: 20, borderColor: 'var(--accent)' }}>
          <h2 style={{ marginBottom: 8 }}>Invitation created</h2>
          <p className="small muted" style={{ marginBottom: 10 }}>
            {q.mailError ? `${q.mailError} ` : 'Email is not set up, so copy this link and send it yourself. '}
            It works once, only for the email address you invited, and expires in 7 days.
          </p>
          <input className="input" readOnly value={q.invited} aria-label="Invitation link" />
        </section>
      ) : null}

      <div className="layout-2">
        <div className="stack">
          <section className="card flush">
            <div className="card-head"><h2><Users size={16} className="h-icon" aria-hidden="true" />Members</h2><span className="muted small">{data.members.length}</span></div>
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th>{canManage ? <th className="action-col" aria-label="Actions" /> : null}</tr></thead>
              <tbody>
                {data.members.map(m => {
                  const editable = canManage && m.user_id !== user!.id && !(m.role === 'owner' && mine !== 'owner');
                  return (
                    <tr key={m.user_id}>
                      <td><strong>{m.name || m.email}</strong>{m.user_id === user!.id ? <span className="small muted"> (you)</span> : null}<div className="small muted">{m.email}</div></td>
                      <td>
                        {editable ? (
                          <form action={changeMemberRole} className="actions">
                            <input type="hidden" name="orgId" value={team.id} />
                            <input type="hidden" name="userId" value={m.user_id} />
                            <select className="select" name="role" defaultValue={m.role} style={{ width: 130 }} aria-label={`Role for ${m.name || m.email}`}>
                              {mine === 'owner' ? <option value="owner">Owner</option> : null}
                              <option value="admin">Admin</option>
                              <option value="member">{ROLE_LABEL.member}</option>
                            </select>
                            <button className="btn sm" type="submit">Save</button>
                          </form>
                        ) : <span className="badge">{ROLE_LABEL[m.role]}</span>}
                      </td>
                      {canManage ? (
                        <td className="action-col">
                          {editable ? (
                            <form action={removeMember}>
                              <input type="hidden" name="orgId" value={team.id} />
                              <input type="hidden" name="userId" value={m.user_id} />
                              <button className="btn ghost sm danger" type="submit">Remove</button>
                            </form>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <details className="card danger-zone">
            <summary>Leave or delete this team</summary>
            <div className="card-body stack" style={{ gap: 16, paddingTop: 0 }}>
              <form action={leaveTeam} className="stack" style={{ gap: 8 }}>
                <input type="hidden" name="orgId" value={team.id} />
                <p className="small muted" style={{ margin: 0 }}>
                  {data.members.length === 1 ? 'You are the only member, so leaving deletes the team and everything shared in it.'
                    : soleOwner ? 'You are the only owner. Make someone else an owner before you leave.'
                    : 'You lose access to the team’s shared projects, time and meetings. Your own planner is not affected.'}
                </p>
                <button className="btn danger" type="submit" disabled={soleOwner && data.members.length > 1} style={{ alignSelf: 'flex-start' }}>Leave team</button>
              </form>
              {mine === 'owner' ? (
                <form action={deleteTeam} className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <input type="hidden" name="orgId" value={team.id} />
                  <p className="small muted" style={{ margin: 0 }}>Deleting removes the team for everyone, with its projects, clients, time entries, meetings, invoices and timesheets. This cannot be undone.</p>
                  <label className="field">Type <strong>{team.name}</strong> to confirm<input className="input" name="confirm" required autoComplete="off" /></label>
                  <button className="btn danger solid" type="submit" style={{ alignSelf: 'flex-start' }}>Delete team</button>
                </form>
              ) : null}
            </div>
          </details>
        </div>

        <div className="stack">
          {canManage ? (
            <section className="card card-body">
              <h2 style={{ marginBottom: 12 }}>Invite someone</h2>
              <form action={inviteMember} className="stack" style={{ gap: 12 }}>
                <input type="hidden" name="orgId" value={team.id} />
                <label className="field">Email<input className="input" type="email" name="email" required /></label>
                <label className="field">Role
                  <select className="select" name="role" defaultValue="member">
                    {mine === 'owner' ? <option value="owner">Owner</option> : null}
                    <option value="admin">Admin</option>
                    <option value="member">{ROLE_LABEL.member}</option>
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

export default async function TeamsPage(props: { searchParams: Promise<Search> }) {
  const q = await props.searchParams;
  const safe: Search = { ...q, team: isUuid(q.team) ? q.team : undefined };
  return <PremiumGate feature="Teams"><TeamsPageContent searchParams={Promise.resolve(safe)} /></PremiumGate>;
}
