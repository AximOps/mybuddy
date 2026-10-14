import Link from 'next/link';
import { addMark, deleteMark, deleteSubject, updateSubject } from '@/app/actions';
import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { averagePercent, gradePointOf } from '@/lib/student';
import { fmtMinutes, isUuid } from '@/lib/time';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const data = await withUser(user!.id, async c => {
    const ws = await personalWorkspaceId(c, user!.id);
    const settings = await getSettings(c, user!.id);
    const s = (await c.query<{ id: string; name: string; credits: string; grade_point: string | null }>(
      `select id, name, credits::text, grade_point::text from subjects where id = $1 and workspace_id = $2 and deleted_at is null`, [id, ws])).rows[0];
    if (!s) return null;
    const marks = (await c.query<{ id: string; title: string; score: string; max_score: string }>(
      `select id, title, score::text, max_score::text from assessments where subject_id = $1 and deleted_at is null order by created_at`, [id])).rows;
    const notes = (await c.query<{ id: string; title: string }>(
      `select id, title from notes where workspace_id = $1 and subject_id = $2 and deleted_at is null order by updated_at desc`, [ws, id])).rows;
    const classes = (await c.query<{ id: string; title: string; weekday: number; start_min: number; end_min: number }>(
      `select id, title, weekday, start_min, end_min from classes where subject_id = $1 and deleted_at is null order by weekday, start_min`, [id])).rows;
    const deadlines = (await c.query<{ id: string; title: string; due_date: string; done: boolean }>(
      `select id, title, due_date::text as due_date, done from deadlines where subject_id = $1 and deleted_at is null order by done, due_date`, [id])).rows;
    return {
      settings,
      subject: { id: s.id, name: s.name, credits: Number(s.credits), gradePoint: s.grade_point === null ? null : Number(s.grade_point) },
      marks: marks.map(m => ({ id: m.id, title: m.title, score: Number(m.score), maxScore: Number(m.max_score) })),
      notes, classes, deadlines,
    };
  });
  if (!data) notFound();

  const { subject, marks, settings } = data;
  const avg = averagePercent(marks);
  const gp = gradePointOf(subject.gradePoint, avg);
  const college = settings.studentLevel === 'college';

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/student?tab=subjects" className="small muted">‹ All subjects</Link>
          <h1 style={{ marginTop: 6 }}>{subject.name}</h1>
          <p>{college ? `${subject.credits} credits` : 'Subject'}</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Average</div><div className="value num">{avg === null ? '—' : `${avg.toFixed(1)}%`}</div><div className="small muted">{marks.length} marks</div></div>
        <div className="card stat"><div className="label">{college ? 'Grade point' : 'Grade'}</div><div className="value num">{gp === null ? '—' : college ? gp.toFixed(1) : `${Math.round(gp * 10)}%`}</div><div className="small muted">{subject.gradePoint === null && avg !== null ? 'From marks' : 'Entered'}</div></div>
        <div className="card stat"><div className="label">Notes</div><div className="value num">{data.notes.length}</div></div>
        <div className="card stat"><div className="label">Classes</div><div className="value num">{data.classes.length}</div></div>
      </div>

      <div className="layout-2">
        <div className="stack">
          <section className="card flush">
            <div className="card-head"><h2>Marks</h2><span className="muted small">Equal weight per entry</span></div>
            {marks.length === 0 ? <div className="empty">No marks yet.</div> : (
              <table className="table">
                <thead><tr><th>Test or assignment</th><th>Marks</th><th>%</th><th className="action-col" aria-label="Actions" /></tr></thead>
                <tbody>
                  {marks.map(m => (
                    <tr key={m.id}>
                      <td>{m.title}</td>
                      <td className="num">{m.score} / {m.maxScore}</td>
                      <td className="num">{((m.score / m.maxScore) * 100).toFixed(1)}%</td>
                      <td className="action-col">
                        <form action={deleteMark}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="subjectId" value={subject.id} /><button className="btn ghost sm danger" type="submit" aria-label={`Delete ${m.title}`}>Delete</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={addMark} className="form-grid" style={{ padding: 18, borderTop: '1px solid var(--line)' }}>
              <input type="hidden" name="subjectId" value={subject.id} />
              <label className="field span-6">Test or assignment<input className="input" name="title" required maxLength={80} placeholder="e.g. Unit test 1" /></label>
              <label className="field span-3">Scored<input className="input" name="score" inputMode="decimal" required /></label>
              <label className="field span-3">Out of<input className="input" name="maxScore" inputMode="decimal" required defaultValue="100" /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add marks</button></div>
            </form>
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 10 }}>Study notes</h2>
            {data.notes.length === 0 ? <p className="muted small">No notes linked to this subject yet. Choose the subject when you write a note.</p> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.notes.map(n => <li key={n.id} style={{ padding: '6px 0' }}><Link href={`/notes?id=${n.id}`}>{n.title || 'Untitled'}</Link></li>)}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card card-body">
            <h2 style={{ marginBottom: 10 }}>Classes and deadlines</h2>
            {data.classes.map(c => <div key={c.id} className="small" style={{ padding: '4px 0' }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][c.weekday]} · {fmtMinutes(c.start_min)} {c.title}</div>)}
            {data.deadlines.map(d => <div key={d.id} className="small" style={{ padding: '4px 0', textDecoration: d.done ? 'line-through' : 'none' }}>{d.due_date} · {d.title}</div>)}
            {data.classes.length === 0 && data.deadlines.length === 0 ? <p className="muted small">Nothing linked yet.</p> : null}
          </section>

          <section className="card card-body">
            <h2 style={{ marginBottom: 12 }}>Edit subject</h2>
            <form action={updateSubject} className="form-grid">
              <input type="hidden" name="id" value={subject.id} />
              <label className="field span-12">Name<input className="input" name="name" required maxLength={60} defaultValue={subject.name} /></label>
              {college ? <label className="field span-6">Credits<input className="input" name="credits" inputMode="decimal" defaultValue={String(subject.credits)} /></label> : <input type="hidden" name="credits" value={String(subject.credits)} />}
              <label className={`field ${college ? 'span-6' : 'span-12'}`}>Grade point (optional)<input className="input" name="gradePoint" inputMode="decimal" defaultValue={subject.gradePoint === null ? '' : String(subject.gradePoint)} /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn primary" type="submit">Save</button>
              </div>
            </form>
            <form action={deleteSubject} style={{ marginTop: 14 }}>
              <input type="hidden" name="id" value={subject.id} />
              <button className="btn danger" type="submit">Delete subject</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
