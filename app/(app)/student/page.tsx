import Link from 'next/link';
import { addClass, addDeadline, addSubject, deleteClass, deleteDeadline, toggleDeadline } from '@/app/actions';
import { withUser } from '@/lib/db';
import { cumulativeGpa, gradePointOf, WEEKDAY_NAMES } from '@/lib/student';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { dateKeyIn, fmtMinutes } from '@/lib/time';

export const dynamic = 'force-dynamic';

type Tab = 'timetable' | 'deadlines' | 'subjects';

export default async function StudentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  const { tab: requested } = await searchParams;
  const tab: Tab = requested === 'deadlines' || requested === 'subjects' ? requested : 'timetable';

  const data = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const subjects = (await c.query<{ id: string; name: string; credits: string; grade_point: string | null; avg: string | null }>(
      `select s.id, s.name, s.credits::text, s.grade_point::text,
              avg(a.score / a.max_score * 100)::text as avg
         from subjects s left join assessments a on a.subject_id = s.id and a.deleted_at is null
        where s.workspace_id = $1 and s.deleted_at is null
        group by s.id order by s.name`, [ws])).rows.map(r => ({
      id: r.id, name: r.name, credits: Number(r.credits),
      gradePoint: r.grade_point === null ? null : Number(r.grade_point),
      avg: r.avg === null ? null : Number(r.avg),
    }));
    const classes = (await c.query<{ id: string; title: string; kind: string; weekday: number; start_min: number; end_min: number; room: string; subject_id: string | null }>(
      `select id, title, kind, weekday, start_min, end_min, room, subject_id from classes
        where workspace_id = $1 and deleted_at is null order by weekday, start_min`, [ws])).rows;
    const deadlines = (await c.query<{ id: string; title: string; kind: string; due_date: string; due_time: number | null; done: boolean; subject_id: string | null }>(
      `select id, title, kind, due_date::text as due_date, due_time, done, subject_id from deadlines
        where workspace_id = $1 and deleted_at is null order by done, due_date, coalesce(due_time, 1440)`, [ws])).rows;
    return { settings, subjects, classes, deadlines, today: dateKeyIn(settings.timezone) };
  });

  const subjectName = (id: string | null) => data.subjects.find(s => s.id === id)?.name ?? null;
  const rated = data.subjects.map(s => ({ credits: s.credits, gp: gradePointOf(s.gradePoint, s.avg) }));
  const gpa = cumulativeGpa(rated);
  const marked = data.subjects.filter(s => s.avg !== null);
  const overall = marked.length ? marked.reduce((t, s) => t + (s.avg as number), 0) / marked.length : null;
  const college = data.settings.studentLevel === 'college';
  const openDeadlines = data.deadlines.filter(d => !d.done);
  const nextExam = openDeadlines.find(d => d.kind === 'exam' && d.due_date >= data.today);

  if (!data.settings.studentEnabled) {
    return (
      <div className="page-head"><div><h1>Student</h1><p>Student tools are turned off. Turn them on in Settings.</p></div>
        <Link className="btn" href="/settings">Open Settings</Link></div>
    );
  }

  const tabLink = (t: Tab, label: string) => (
    <Link href={`/student?tab=${t}`} aria-current={tab === t ? 'true' : undefined}>{label}</Link>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Student</h1>
          <p>{college ? 'College / university' : 'School'} planner</p>
        </div>
        <div className="seg">{tabLink('timetable', 'Timetable')}{tabLink('deadlines', 'Deadlines')}{tabLink('subjects', 'Subjects')}</div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">{college ? 'Cumulative GPA' : 'Overall average'}</div>
          <div className="value num">{college ? (gpa === null ? '—' : gpa.toFixed(2)) : (overall === null ? '—' : `${overall.toFixed(1)}%`)}</div>
          <div className="small muted">{college ? 'Out of 10, weighted by credits' : 'Average of subjects with marks'}</div>
        </div>
        <div className="card stat"><div className="label">Subjects</div><div className="value num">{data.subjects.length}</div></div>
        <div className="card stat"><div className="label">Open deadlines</div><div className="value num">{openDeadlines.length}</div></div>
        <div className="card stat">
          <div className="label">Next exam</div>
          <div className="value" style={{ fontSize: 18 }}>{nextExam ? nextExam.title : '—'}</div>
          <div className="small muted">{nextExam ? nextExam.due_date : 'None scheduled'}</div>
        </div>
      </div>

      {tab === 'timetable' ? (
        <div className="layout-2">
          <section className="card flush">
            <div className="card-head"><h2>Weekly timetable</h2><span className="muted small">{data.classes.length} classes</span></div>
            {data.classes.length === 0 ? <div className="empty">No classes yet. Add a lecture, lab or tutorial.</div> : (
              <table className="table">
                <thead><tr><th>Day</th><th>Time</th><th>Class</th><th>Room</th><th className="action-col" aria-label="Actions" /></tr></thead>
                <tbody>
                  {data.classes.map(c => (
                    <tr key={c.id}>
                      <td>{WEEKDAY_NAMES[c.weekday].slice(0, 3)}</td>
                      <td className="num">{fmtMinutes(c.start_min)} – {fmtMinutes(c.end_min)}</td>
                      <td><strong>{c.title}</strong> <span className="badge">{c.kind}</span>{subjectName(c.subject_id) ? <span className="muted small"> · {subjectName(c.subject_id)}</span> : null}</td>
                      <td>{c.room || <span className="muted">—</span>}</td>
                      <td className="action-col">
                        <form action={deleteClass}><input type="hidden" name="id" value={c.id} /><button className="btn ghost sm danger" type="submit" aria-label={`Delete ${c.title}`}>Delete</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Add a class</h2>
            <form action={addClass} className="form-grid">
              <label className="field span-12">Name<input className="input" name="title" required maxLength={60} placeholder="e.g. Engineering Maths" /></label>
              <label className="field span-6">Type<select className="select" name="kind" defaultValue="lecture"><option value="lecture">Lecture</option><option value="lab">Lab</option><option value="tutorial">Tutorial</option></select></label>
              <label className="field span-6">Day<select className="select" name="weekday" defaultValue="1">{WEEKDAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
              <label className="field span-6">Starts<input className="input" type="time" name="start" required /></label>
              <label className="field span-6">Ends<input className="input" type="time" name="end" required /></label>
              <label className="field span-6">Subject<select className="select" name="subjectId" defaultValue=""><option value="">None</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="field span-6">Room (optional)<input className="input" name="room" maxLength={20} /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add class</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {tab === 'deadlines' ? (
        <div className="layout-2">
          <section className="card flush">
            <div className="card-head"><h2>Assignments and exams</h2><span className="muted small">{openDeadlines.length} open</span></div>
            {data.deadlines.length === 0 ? <div className="empty">Nothing due. Add an assignment or exam.</div> : (
              <table className="table">
                <thead><tr><th className="check-col" aria-label="Done" /><th>Title</th><th>Due</th><th className="action-col" aria-label="Actions" /></tr></thead>
                <tbody>
                  {data.deadlines.map(d => {
                    const late = !d.done && d.due_date < data.today;
                    return (
                      <tr key={d.id} className={d.done ? 'done' : ''}>
                        <td className="check-col">
                          <form action={toggleDeadline}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="done" value={String(!d.done)} />
                            <button type="submit" className={`check ${d.done ? 'on' : ''}`} aria-label={d.done ? `Reopen ${d.title}` : `Complete ${d.title}`}>{d.done ? '✓' : ''}</button></form>
                        </td>
                        <td><span className="title">{d.title}</span> <span className="badge">{d.kind}</span>{subjectName(d.subject_id) ? <span className="muted small"> · {subjectName(d.subject_id)}</span> : null}</td>
                        <td><span className={`badge ${late ? 'danger' : ''}`}>{late ? 'Overdue · ' : ''}{d.due_date}{d.due_time !== null ? ` ${fmtMinutes(d.due_time)}` : ''}</span></td>
                        <td className="action-col"><form action={deleteDeadline}><input type="hidden" name="id" value={d.id} /><button className="btn ghost sm danger" type="submit" aria-label={`Delete ${d.title}`}>Delete</button></form></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Add a deadline</h2>
            <form action={addDeadline} className="form-grid">
              <label className="field span-12">Title<input className="input" name="title" required maxLength={120} placeholder="e.g. Lab report 3" /></label>
              <label className="field span-6">Type<select className="select" name="kind" defaultValue="assignment"><option value="assignment">Assignment</option><option value="exam">Exam</option></select></label>
              <label className="field span-6">Subject<select className="select" name="subjectId" defaultValue=""><option value="">None</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="field span-6">Due date<input className="input" type="date" name="dueDate" required /></label>
              <label className="field span-6">Time (optional)<input className="input" type="time" name="dueTime" /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add deadline</button></div>
            </form>
          </section>
        </div>
      ) : null}

      {tab === 'subjects' ? (
        <div className="layout-2">
          <section className="card flush">
            <div className="card-head"><h2>Subjects</h2><span className="muted small">Open a subject to add marks and notes</span></div>
            {data.subjects.length === 0 ? <div className="empty">No subjects yet.</div> : (
              <table className="table">
                <thead><tr><th>Subject</th>{college ? <th>Credits</th> : null}<th>Average</th><th>{college ? 'Grade point' : 'Grade'}</th></tr></thead>
                <tbody>
                  {data.subjects.map(s => {
                    const gp = gradePointOf(s.gradePoint, s.avg);
                    return (
                      <tr key={s.id}>
                        <td><Link href={`/student/subjects/${s.id}`}><strong>{s.name}</strong></Link></td>
                        {college ? <td className="num">{s.credits}</td> : null}
                        <td className="num">{s.avg === null ? <span className="muted">No marks</span> : `${s.avg.toFixed(1)}%`}</td>
                        <td className="num">{college ? (gp === null ? '—' : gp.toFixed(1)) : (s.avg === null ? '—' : `${Math.round(s.avg)}%`)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Add a subject</h2>
            <form action={addSubject} className="form-grid">
              <label className="field span-12">Name<input className="input" name="name" required maxLength={60} placeholder="e.g. Engineering Maths" /></label>
              {college ? <label className="field span-6">Credits<input className="input" name="credits" inputMode="decimal" placeholder="e.g. 4" /></label> : null}
              <label className={`field ${college ? 'span-6' : 'span-12'}`}>Grade point (0 to 10, optional)<input className="input" name="gradePoint" inputMode="decimal" placeholder="Leave empty to use marks" /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add subject</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
