import { PremiumGate } from '@/components/PremiumGate';
import Link from 'next/link';
import { addClient, addMeeting, addMeetingAction, addProject, addTimeEntry, actionToTask, createInvoice, emailMeetingNotes, deleteClient, deleteMeeting, deleteMeetingAction, deleteProject, deleteTimeEntry, startTimer, stopTimer, toggleMeetingAction, updateMeeting } from '@/app/actions';
import { Elapsed } from '@/components/work/Elapsed';
import { withUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { getSettings, money } from '@/lib/settings';
import { activeWorkspaceId, weekStartOf } from '@/lib/workspace';
import { decideTimesheet, setActiveWorkspace, submitTimesheet } from '@/app/actions';
import { entriesForReport } from '@/lib/work-queries';
import { employeeSummary, hmText, reportLines } from '@/lib/work';
import { dateKeyIn, fmtMinutes, isDateKey, isUuid, shiftDateKey } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Tab = 'time' | 'projects' | 'meetings' | 'reports' | 'approvals';
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

async function WorkPageContent({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const tab: Tab = (['projects', 'meetings', 'reports', 'approvals'] as string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'time';

  const data = await withUser(user!.id, async c => {
    const ws = await activeWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const today = dateKeyIn(settings.timezone);
    const wsList = (await c.query<{ id: string; name: string; kind: string }>(
      `select w.id, w.name, w.kind from workspaces w join workspace_members m on m.workspace_id = w.id
        where m.user_id = $1 order by w.kind, w.name`, [user!.id])).rows;
    const activeKind = wsList.find(w => w.id === ws)?.kind ?? 'personal';
    const isAdmin = (await c.query<{ a: boolean }>(`select is_workspace_admin($1) as a`, [ws])).rows[0].a;
    const timer = (await c.query<{ work_timer: { projectId: string; note: string; startedAt: string } | null }>(
      `select work_timer from user_settings where user_id = $1`, [user!.id])).rows[0]?.work_timer ?? null;
    const clients = (await c.query<{ id: string; name: string }>(`select id, name from clients where workspace_id = $1 and deleted_at is null order by name`, [ws])).rows;
    const projects = (await c.query<{ id: string; name: string; client_id: string | null; client_name: string | null; hourly_rate_minor: number }>(
      `select p.id, p.name, p.client_id, cl.name as client_name, p.hourly_rate_minor from projects p
         left join clients cl on cl.id = p.client_id where p.workspace_id = $1 and p.deleted_at is null order by p.name`, [ws])).rows;

    // Timesheet week (offset from the current week, 0 = this week)
    const weekOffset = Math.min(0, Number(sp.week ?? 0) || 0);
    const todayDate = new Date(`${today}T12:00:00Z`);
    const dow = (todayDate.getUTCDay() + 6) % 7;
    const monday = shiftDateKey(today, -dow + weekOffset * 7);
    const sunday = shiftDateKey(monday, 6);
    const weekDays = Array.from({ length: 7 }, (_, i) => shiftDateKey(monday, i));
    const entries = (await c.query<{ id: string; project_id: string; project_name: string; spent_on: string; start_min: number; end_min: number; billable: boolean; note: string }>(
      `select e.id, e.project_id, p.name as project_name, e.spent_on::text as spent_on, e.start_min, e.end_min, e.billable, e.note
         from time_entries e join projects p on p.id = e.project_id
        where e.workspace_id = $1 and e.deleted_at is null and e.spent_on >= $2 and e.spent_on <= $3
        order by e.spent_on, e.start_min`, [ws, monday, sunday])).rows;

    const meetings = (await c.query<{ id: string; title: string; meeting_on: string; start_min: number | null; end_min: number | null }>(
      `select id, title, meeting_on::text as meeting_on, start_min, end_min from meetings
        where workspace_id = $1 and deleted_at is null order by meeting_on desc, start_min nulls last limit 100`, [ws])).rows;
    const selectedId = isUuid(sp.meeting ?? '') ? sp.meeting! : null;
    const meeting = selectedId ? (await c.query<{ id: string; title: string; meeting_on: string; start_min: number | null; end_min: number | null; attendees: string; agenda: string; notes: string }>(
      `select id, title, meeting_on::text as meeting_on, start_min, end_min, attendees, agenda, notes from meetings where id = $1 and workspace_id = $2 and deleted_at is null`, [selectedId, ws])).rows[0] ?? null : null;
    const actions = meeting ? (await c.query<{ id: string; text: string; done: boolean }>(
      `select id, text, done from meeting_actions where meeting_id = $1 order by sort_order`, [meeting.id])).rows : [];
    const members = (await c.query<{ id: string; name: string; email: string }>(
      `select u.id, u.name, u.email from workspace_members m join "user" u on u.id = m.user_id where m.workspace_id = $1 order by u.name`, [ws])).rows;

    // Reports (date range and client)
    const from = isDateKey(sp.from ?? '') ? sp.from! : `${today.slice(0, 8)}01`;
    const to = isDateKey(sp.to ?? '') ? sp.to! : today;
    const clientFilter = isUuid(sp.client ?? '') ? sp.client! : null;
    const rangeEntries = await entriesForReport(c, ws, from, to, clientFilter);
    const lines = reportLines(rangeEntries);
    const people = employeeSummary(rangeEntries);
    const invoices = (await c.query<{ id: string; number: string; client_name: string; period_start: string; period_end: string; total_minor: number; currency: string }>(
      `select id, number, client_name, period_start::text as period_start, period_end::text as period_end, total_minor, currency
         from invoices where workspace_id = $1 order by created_at desc limit 50`, [ws])).rows;

    const timesheet = (await c.query<{ status: string; decision_note: string }>(
      `select status, decision_note from timesheets where workspace_id = $1 and user_id = $2 and week_start = $3`, [ws, user!.id, monday])).rows[0] ?? null;
    const approvals = isAdmin && activeKind === 'organisation' ? (await c.query<{ id: string; name: string; email: string; week_start: string; submitted_at: Date; minutes: number }>(
      `select t.id, u.name, u.email, t.week_start::text as week_start, t.submitted_at,
              (select coalesce(sum(e.end_min - e.start_min), 0)::int from time_entries e
                where e.workspace_id = t.workspace_id and e.user_id = t.user_id and e.deleted_at is null
                  and e.spent_on >= t.week_start and e.spent_on < t.week_start + 7) as minutes
         from timesheets t join "user" u on u.id = t.user_id
        where t.workspace_id = $1 and t.status = 'submitted' order by t.submitted_at`, [ws])).rows : [];
    return {
      members, settings, today, timer, clients, projects, weekDays, monday, sunday, entries, meetings, meeting, actions, from, to, clientFilter, lines, people, invoices, wsList, ws, activeKind, isAdmin, timesheet, approvals };
  });

  const cur = data.settings.currency;
  const weekMinutes = data.entries.reduce((s, e) => s + (e.end_min - e.start_min), 0);
  const weekBillable = data.entries.filter(e => e.billable).reduce((s, e) => s + (e.end_min - e.start_min), 0);
  const tabLink = (t: Tab, label: string) => <Link href={`/work?tab=${t}`} aria-current={tab === t ? 'true' : undefined}>{label}</Link>;
  const timerProject = data.timer ? data.projects.find(p => p.id === data.timer!.projectId) : null;
  const projectOptions = data.projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` · ${p.client_name}` : ''}</option>);

  return (
    <>
      <div className="page-head">
        <div><h1>Work</h1><p>Time, projects, meetings and invoices</p></div>
        <div className="seg">{tabLink('time', 'Time')}{tabLink('projects', 'Projects')}{tabLink('meetings', 'Meetings')}{tabLink('reports', 'Reports')}{data.isAdmin && data.activeKind === 'organisation' ? tabLink('approvals', 'Approvals') : null}</div>
      </div>

      <form action={setActiveWorkspace} className="actions" style={{ marginBottom: 16 }}>
        <span className="small muted">Working in</span>
        <select className="select" name="ws" defaultValue={data.ws} style={{ width: 240 }} aria-label="Workspace">
          {data.wsList.map(w => <option key={w.id} value={w.id}>{w.name}{w.kind === 'organisation' ? ' (team)' : ' (personal)'}</option>)}
        </select>
        <button className="btn sm" type="submit">Switch</button>
      </form>

      {tab === 'time' ? (
        <>
          <section className="card card-body" style={{ marginBottom: 20 }}>
            {data.timer && timerProject ? (
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="small muted">Timer running · {timerProject.name}</div>
                  <div style={{ fontSize: 32, fontWeight: 650 }}><Elapsed startedAt={data.timer.startedAt} /></div>
                  {data.timer.note ? <div className="small muted">{data.timer.note}</div> : null}
                </div>
                <form action={stopTimer}><button className="btn danger" type="submit">Stop and save</button></form>
              </div>
            ) : (
              <form action={startTimer} className="form-grid">
                <label className="field span-4">Project<select className="select" name="projectId" required>{projectOptions}</select></label>
                <label className="field span-6">What are you working on? (optional)<input className="input" name="note" maxLength={160} /></label>
                <div className="span-2" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary block" type="submit" disabled={data.projects.length === 0}>Start timer</button></div>
                {data.projects.length === 0 ? <p className="small muted span-12">Add a project in the Projects tab first.</p> : null}
              </form>
            )}
          </section>

          <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <Link className="btn" href={`/work?tab=time&week=${(Number(sp.week ?? 0) || 0) - 1}`}>‹ Previous week</Link>
            <strong>{data.weekDays[0]} to {data.weekDays[6]}</strong>
            <Link className="btn" href={`/work?tab=time&week=${Math.min(0, (Number(sp.week ?? 0) || 0) + 1)}`}>Next week ›</Link>
          </div>
          {data.activeKind === 'organisation' ? (
            <section className="card card-body" style={{ marginBottom: 16 }}>
              <div className="actions" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>Timesheet for {data.monday}</strong>
                  <div className="small muted">{data.timesheet
                    ? data.timesheet.status === 'submitted' ? 'Submitted, waiting for approval'
                    : data.timesheet.status === 'approved' ? 'Approved. This week is locked.'
                    : `Rejected${data.timesheet.decision_note ? `: ${data.timesheet.decision_note}` : ''}. Fix and submit again.`
                    : 'Not submitted yet'}</div>
                </div>
                {data.timesheet?.status !== 'approved' && data.timesheet?.status !== 'submitted' ? (
                  <form action={submitTimesheet}><input type="hidden" name="weekStart" value={data.monday} />
                    <button className="btn primary" type="submit">Submit week for approval</button></form>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="card stat"><div className="label">Week total</div><div className="value num">{hmText(weekMinutes)}</div></div>
            <div className="card stat"><div className="label">Billable</div><div className="value num">{hmText(weekBillable)}</div></div>
          </div>

          <section className="card flush" style={{ marginBottom: 20 }}>
            <table className="table">
              <thead><tr><th>Day</th><th>Project</th><th>Time</th><th>Length</th><th className="action-col" aria-label="Actions" /></tr></thead>
              <tbody>
                {data.weekDays.map((d, i) => {
                  const dayEntries = data.entries.filter(e => e.spent_on === d);
                  if (dayEntries.length === 0) return <tr key={d}><td className="muted">{DAY[i]} {d.slice(8)}</td><td colSpan={4} className="muted small">No time logged</td></tr>;
                  return dayEntries.map(e => (
                    <tr key={e.id}>
                      <td>{DAY[i]} {d.slice(8)}</td>
                      <td><strong>{e.project_name}</strong>{e.note ? <div className="small muted">{e.note}</div> : null}{e.billable ? null : <span className="badge"> non-billable</span>}</td>
                      <td className="num">{fmtMinutes(e.start_min)} – {fmtMinutes(e.end_min)}</td>
                      <td className="num">{hmText(e.end_min - e.start_min)}</td>
                      <td className="action-col"><form action={deleteTimeEntry}><input type="hidden" name="id" value={e.id} /><button className="btn ghost sm danger" type="submit" aria-label="Delete entry">Delete</button></form></td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </section>

          <details className="card panel">
            <summary className="card-body"><strong>+ Add time manually</strong></summary>
            <form action={addTimeEntry} className="form-grid" style={{ padding: '0 18px 18px' }}>
              <label className="field span-4">Project<select className="select" name="projectId" required>{projectOptions}</select></label>
              <label className="field span-3">Date<input className="input" type="date" name="day" required defaultValue={data.today} /></label>
              <label className="field span-2">Starts<input className="input" type="time" name="start" required /></label>
              <label className="field span-2">Ends<input className="input" type="time" name="end" required /></label>
              <label className="field span-9">What did you work on?<input className="input" name="note" maxLength={160} /></label>
              <label className="check-row span-3" style={{ alignSelf: 'end' }}><input type="checkbox" name="billable" defaultChecked /> Billable</label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit" disabled={data.projects.length === 0}>Add time</button></div>
            </form>
          </details>
        </>
      ) : null}

      {tab === 'approvals' ? (
        <section className="card flush">
          <div className="card-head"><h2>Timesheets waiting for approval</h2><span className="muted small">{data.approvals.length} submitted</span></div>
          {data.approvals.length === 0 ? <div className="empty">Nothing to approve right now.</div> : (
            <table className="table">
              <thead><tr><th>Employee</th><th>Week of</th><th className="num">Hours</th><th>Submitted</th><th className="action-col" aria-label="Actions" /></tr></thead>
              <tbody>
                {data.approvals.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.name || a.email}</strong><div className="small muted">{a.email}</div></td>
                    <td>{a.week_start}</td>
                    <td className="num">{hmText(a.minutes)}</td>
                    <td className="small">{new Date(a.submitted_at).toLocaleDateString('en-IN')}</td>
                    <td className="action-col">
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        <form action={decideTimesheet}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value="approved" /><button className="btn primary sm" type="submit">Approve</button></form>
                        <form action={decideTimesheet} className="actions"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="decision" value="rejected" />
                          <input className="input" name="note" placeholder="Reason" style={{ width: 140, height: 34 }} /><button className="btn ghost sm danger" type="submit">Reject</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === 'projects' ? (
        <div className="layout-2">
          <section className="card flush">
            <div className="card-head"><h2>Projects</h2><span className="muted small">{data.projects.length} projects</span></div>
            {data.projects.length === 0 ? <div className="empty">No projects yet.</div> : (
              <table className="table">
                <thead><tr><th>Project</th><th>Client</th><th>Rate per hour</th><th className="action-col" aria-label="Actions" /></tr></thead>
                <tbody>
                  {data.projects.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.name}</strong></td>
                      <td>{p.client_name ?? <span className="muted">No client</span>}</td>
                      <td className="num">{p.hourly_rate_minor ? money(p.hourly_rate_minor, cur) : <span className="muted">Not set</span>}</td>
                      <td className="action-col"><form action={deleteProject}><input type="hidden" name="id" value={p.id} /><button className="btn ghost sm danger" type="submit">Delete</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <div className="stack">
            <section className="card card-body">
              <h2 style={{ marginBottom: 12 }}>New project</h2>
              <form action={addProject} className="stack" style={{ gap: 12 }}>
                <label className="field">Project name<input className="input" name="name" required maxLength={80} /></label>
                <label className="field">Client (optional)<select className="select" name="clientId" defaultValue=""><option value="">No client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="field">Hourly rate ({cur}, optional)<input className="input" name="rate" inputMode="decimal" placeholder="e.g. 1500" /></label>
                <button className="btn primary block" type="submit">Add project</button>
              </form>
            </section>
            <section className="card card-body">
              <h2 style={{ marginBottom: 12 }}>Clients</h2>
              {data.clients.map(c => (
                <form key={c.id} action={deleteClient} className="actions" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                  <input type="hidden" name="id" value={c.id} /><span>{c.name}</span><button className="btn ghost sm danger" type="submit">Remove</button>
                </form>
              ))}
              {data.clients.length === 0 ? <p className="small muted">No clients yet.</p> : null}
              <form action={addClient} className="actions" style={{ marginTop: 12 }}>
                <input className="input" name="name" required maxLength={80} placeholder="New client name" style={{ flex: 1 }} />
                <button className="btn" type="submit">Add</button>
              </form>
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'meetings' ? (
        <div className="layout-2">
          <section className="card flush">
            <div className="card-head"><h2>Meetings</h2><span className="muted small">{data.meetings.length} meetings</span></div>
            {data.meetings.length === 0 ? <div className="empty">No meetings yet.</div> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.meetings.map(m => (
                  <li key={m.id} className="card-body" style={{ borderTop: '1px solid var(--line)', background: m.id === data.meeting?.id ? 'var(--accent-soft)' : undefined }}>
                    <Link href={`/work?tab=meetings&meeting=${m.id}`}><strong>{m.title}</strong></Link>
                    <div className="small muted">{m.meeting_on}{m.start_min !== null && m.end_min !== null ? ` · ${fmtMinutes(m.start_min)} – ${fmtMinutes(m.end_min)}` : ''}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="stack">
            {data.meeting ? (
              <section className="card card-body">
                <h2 style={{ marginBottom: 12 }}>{data.meeting.title}</h2>
                <form action={updateMeeting} className="form-grid">
                  <input type="hidden" name="id" value={data.meeting.id} />
                  <label className="field span-12">Title<input className="input" name="title" required maxLength={120} defaultValue={data.meeting.title} /></label>
                  <label className="field span-4">Date<input className="input" type="date" name="meetingOn" required defaultValue={data.meeting.meeting_on} /></label>
                  <label className="field span-4">Starts<input className="input" type="time" name="start" defaultValue={data.meeting.start_min === null ? '' : `${String(Math.floor(data.meeting.start_min / 60)).padStart(2, '0')}:${String(data.meeting.start_min % 60).padStart(2, '0')}`} /></label>
                  <label className="field span-4">Ends<input className="input" type="time" name="end" defaultValue={data.meeting.end_min === null ? '' : `${String(Math.floor(data.meeting.end_min / 60)).padStart(2, '0')}:${String(data.meeting.end_min % 60).padStart(2, '0')}`} /></label>
                  <label className="field span-12">Attendees<input className="input" name="attendees" maxLength={300} defaultValue={data.meeting.attendees} /></label>
                  <label className="field span-12">Agenda<textarea name="agenda" rows={4} defaultValue={data.meeting.agenda} /></label>
                  <label className="field span-12">Notes<textarea name="notes" rows={6} defaultValue={data.meeting.notes} /></label>
                  <div className="span-12" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button className="btn primary" type="submit">Save meeting</button>
                  </div>
                </form>
                <div style={{ marginTop: 18 }}>
                  <h2 style={{ marginBottom: 8 }}>Action items</h2>
                  {data.actions.map(a => (
                    <div key={a.id} className="actions" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <form action={toggleMeetingAction}><input type="hidden" name="id" value={a.id} />
                        <button type="submit" className={`check ${a.done ? 'on' : ''}`} aria-label={a.done ? 'Reopen' : 'Complete'}>{a.done ? '✓' : ''}</button></form>
                      <span style={{ flex: 1, textDecoration: a.done ? 'line-through' : 'none' }}>{a.text}</span>
                      <details className="assign">
                        <summary className="btn ghost sm">To To-Do</summary>
                        <form action={actionToTask} className="assign-pop">
                          <input type="hidden" name="id" value={a.id} />
                          <label className="field">For
                            <select className="select" name="assignee" defaultValue={user!.id}>
                              {data.members.length ? data.members.map(mb => <option key={mb.id} value={mb.id}>{mb.id === user!.id ? 'Me' : mb.name || mb.email}</option>) : <option value={user!.id}>Me</option>}
                            </select>
                          </label>
                          <label className="field">Due (optional)<input className="input" type="date" name="dueDate" /></label>
                          <button className="btn primary sm" type="submit">Add to-do</button>
                        </form>
                      </details>
                      <form action={deleteMeetingAction}><input type="hidden" name="id" value={a.id} /><button className="btn ghost sm danger" type="submit">Remove</button></form>
                    </div>
                  ))}
                  <form action={addMeetingAction} className="actions" style={{ marginTop: 10 }}>
                    <input type="hidden" name="meetingId" value={data.meeting.id} />
                    <input className="input" name="text" required maxLength={200} placeholder="Add an action item" style={{ flex: 1 }} />
                    <button className="btn" type="submit">Add</button>
                  </form>
                </div>
                <div className="mail-box">
                  <h2 style={{ marginBottom: 6 }}>Email the notes</h2>
                  {sp.mail === 'sent' ? <div className="notice success" role="status">Sent to {sp.n} {sp.n === '1' ? 'person' : 'people'}.</div>
                    : sp.mail === 'off' ? <div className="notice danger" role="alert">Email is not set up for this site yet (RESEND_API_KEY and MAIL_FROM).</div>
                    : sp.mail === 'partial' ? <div className="notice danger" role="alert">Some emails could not be sent. {sp.n} went out.</div>
                    : sp.mail === 'none' ? <div className="notice danger" role="alert">Add at least one email address.</div> : null}
                  <form action={emailMeetingNotes} className="stack" style={{ gap: 10 }}>
                    <input type="hidden" name="id" value={data.meeting.id} />
                    <label className="field">To (email addresses, separated by commas)
                      <input className="input" name="to" defaultValue={[...(data.meeting.attendees.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) ?? []), ...data.members.filter(mb => mb.id !== user!.id && data.meeting!.attendees.toLowerCase().includes((mb.name || '~').split(' ')[0].toLowerCase())).map(mb => mb.email)].filter((v, i, arr) => arr.indexOf(v) === i).join(', ')} placeholder="ben@company.com, cara@company.com" />
                    </label>
                    <label className="check-row"><input type="checkbox" name="copyMe" defaultChecked /> Send me a copy</label>
                    <button className="btn" type="submit">Send agenda, notes and action items</button>
                  </form>
                </div>
                <form action={deleteMeeting} style={{ marginTop: 18 }}>
                  <input type="hidden" name="id" value={data.meeting.id} />
                  <button className="btn danger" type="submit">Delete meeting</button>
                </form>
              </section>
            ) : (
              <section className="card card-body">
                <h2 style={{ marginBottom: 12 }}>New meeting</h2>
                <form action={addMeeting} className="form-grid">
                  <label className="field span-12">Title<input className="input" name="title" required maxLength={120} /></label>
                  <label className="field span-4">Date<input className="input" type="date" name="meetingOn" required defaultValue={data.today} /></label>
                  <label className="field span-4">Starts<input className="input" type="time" name="start" /></label>
                  <label className="field span-4">Ends<input className="input" type="time" name="end" /></label>
                  <label className="field span-12">Attendees<input className="input" name="attendees" maxLength={300} /></label>
                  <label className="field span-12">Agenda<textarea name="agenda" rows={3} /></label>
                  <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Create meeting</button></div>
                </form>
              </section>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'reports' ? (
        <>
          <section className="card card-body" style={{ marginBottom: 20 }}>
            <form method="get" className="form-grid">
              <input type="hidden" name="tab" value="reports" />
              <label className="field span-3">From<input className="input" type="date" name="from" defaultValue={data.from} /></label>
              <label className="field span-3">To<input className="input" type="date" name="to" defaultValue={data.to} /></label>
              <label className="field span-4">Client<select className="select" name="client" defaultValue={data.clientFilter ?? ''}><option value="">All clients</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <div className="span-2" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn block" type="submit">Show</button></div>
            </form>
          </section>

          <div className="stats" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="card stat"><div className="label">Billable hours</div><div className="value num">{(data.lines.reduce((s, l) => s + l.billableHours, 0)).toFixed(2)}</div></div>
            <div className="card stat"><div className="label">Billable amount</div><div className="value num">{money(data.lines.reduce((s, l) => s + l.amountMinor, 0), cur)}</div></div>
          </div>

          {data.isAdmin && data.activeKind === 'organisation' ? (
            <section className="card flush" style={{ marginBottom: 20 }}>
              <div className="card-head"><h2>By employee</h2><span className="muted small">{data.people.length} people</span></div>
              {data.people.length === 0 ? <div className="empty">No time logged by the team in this range.</div> : (
                <table className="table">
                  <thead><tr><th>Employee</th><th className="num">Hours</th><th className="num">Billable hours</th><th className="num">Billable amount</th></tr></thead>
                  <tbody>
                    {data.people.map(p => (
                      <tr key={p.person}><td><strong>{p.person}</strong></td><td className="num">{hmText(p.minutes)}</td><td className="num">{hmText(p.billableMinutes)}</td><td className="num">{money(p.amountMinor, cur)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}

          <section className="card flush" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <h2>By project</h2>
              <div className="actions">
                <a className="btn sm" href={`/api/work/report?format=csv&from=${data.from}&to=${data.to}${data.clientFilter ? `&client=${data.clientFilter}` : ''}`}>Download CSV</a>
                <a className="btn sm" href={`/api/work/report?format=pdf&from=${data.from}&to=${data.to}${data.clientFilter ? `&client=${data.clientFilter}` : ''}`}>Download PDF</a>
              </div>
            </div>
            {data.lines.length === 0 ? <div className="empty">No billable time in this range.</div> : (
              <table className="table">
                <thead><tr><th>Project</th><th>Client</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {data.lines.map(l => (
                    <tr key={l.project + l.client}><td>{l.project}</td><td>{l.client}</td><td className="num">{l.billableHours.toFixed(2)}</td><td className="num">{l.rateMinor ? money(l.rateMinor, cur) : '—'}</td><td className="num">{money(l.amountMinor, cur)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card card-body" style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 12 }}>Create an invoice</h2>
            <p className="small muted" style={{ marginBottom: 12 }}>Uses the billable time for one client in the date range above, at each project&apos;s hourly rate.</p>
            <form action={createInvoice} className="form-grid">
              <label className="field span-4">Client<select className="select" name="clientId" required><option value="">Choose a client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field span-3">From<input className="input" type="date" name="from" required defaultValue={data.from} /></label>
              <label className="field span-3">To<input className="input" type="date" name="to" required defaultValue={data.to} /></label>
              <div className="span-2" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn primary block" type="submit">Create</button></div>
            </form>
          </section>

          <section className="card flush">
            <div className="card-head"><h2>Invoices</h2><span className="muted small">{data.invoices.length} invoices</span></div>
            {data.invoices.length === 0 ? <div className="empty">No invoices yet.</div> : (
              <table className="table">
                <thead><tr><th>Number</th><th>Client</th><th>Period</th><th className="num">Total</th><th className="action-col" aria-label="Actions" /></tr></thead>
                <tbody>
                  {data.invoices.map(i => (
                    <tr key={i.id}>
                      <td><strong>{i.number}</strong></td>
                      <td>{i.client_name}</td>
                      <td className="small">{i.period_start} to {i.period_end}</td>
                      <td className="num">{money(i.total_minor, i.currency)}</td>
                      <td className="action-col"><a className="btn ghost sm" href={`/api/invoices/${i.id}`}>PDF</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

export default async function WorkPage(props: Parameters<typeof WorkPageContent>[0]) {
  return <PremiumGate feature="Work"><WorkPageContent {...props} /></PremiumGate>;
}
