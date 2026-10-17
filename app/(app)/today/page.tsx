import Link from 'next/link';
import { AddDialog } from '@/components/AddDialog';
import { ArrowRight, Bell, CalendarRange, Briefcase, Check, Lock, NotebookPen, Pin, Plus, Timer, Wallet } from 'lucide-react';
import { addEvent, addTask, moveUnfinishedTasks, setTaskDone, stopTimer, toggleDayCheck, toggleDeadline, toggleEvent } from '@/app/actions';
import { withUser } from '@/lib/db';
import { listRoutines, personalWorkspaceId } from '@/lib/planner';
import { Hero } from '@/components/Hero';
import { InstallNotice } from '@/components/InstallNotice';
import { IconPicker } from '@/components/IconPicker';
import { Elapsed } from '@/components/work/Elapsed';
import { getCurrentUser } from '@/lib/session';
import { fmtMinutes, dateKeyIn, isDateKey, longDate, shiftDateKey } from '@/lib/time';
import { getSettings, money } from '@/lib/settings';
import { isPremium } from '@/lib/entitlements';
import { hmText } from '@/lib/work';
import { loadToday, type AgendaItem, type TodayTask } from '@/lib/today';
import { repeatLabel } from '@/lib/tasks';
import { postDueBills } from '@/lib/spending';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<AgendaItem['kind'], string> = {
  routine: 'Routine', meeting: 'Meeting', class: 'Class', task: 'To-do', deadline: 'Deadline', reminder: 'Reminder', focus: 'Focus',
};

function ToggleForm({ item, day }: { item: AgendaItem; day: string }) {
  const t = item.toggle!;
  const action = t.action === 'event' ? toggleEvent : t.action === 'task' ? setTaskDone : t.action === 'check' ? toggleDayCheck : toggleDeadline;
  return (
    <form action={action}>
      {t.action === 'event' ? (<><input type="hidden" name="eventId" value={t.id} /><input type="hidden" name="day" value={day} /></>)
        : (<><input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={item.done ? 'false' : 'true'} />
          {t.action === 'check' ? <><input type="hidden" name="kind" value={t.kind} /><input type="hidden" name="day" value={day} /></> : null}</>)}
      <button type="submit" className={`check ${item.done ? 'on' : ''}`} aria-label={item.done ? `Undo ${item.title}` : `Mark ${item.title} done`}>
        {item.done ? <Check size={14} strokeWidth={3} /> : null}
      </button>
    </form>
  );
}

function DonePill() {
  return <span className="done-pill"><Check size={13} strokeWidth={3} aria-hidden="true" /> Done</span>;
}

function CheckForm({ kind, id, day, done, title }: { kind: 'note' | 'reminder'; id: string; day: string; done: boolean; title: string }) {
  return (
    <form action={toggleDayCheck}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="day" value={day} /><input type="hidden" name="done" value={done ? 'false' : 'true'} />
      <button type="submit" className={`check ${done ? 'on' : ''}`} aria-label={done ? `Undo ${title}` : `Mark ${title} done for today`}>{done ? <Check size={14} strokeWidth={3} /> : null}</button>
    </form>
  );
}

function TaskRow({ t }: { t: TodayTask }) {
  return (
    <li className={`mini-row ${t.done ? 'done' : ''}`}>
      <form action={setTaskDone}>
        <input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={t.done ? 'false' : 'true'} />
        <button type="submit" className={`check ${t.done ? 'on' : ''}`} aria-label={t.done ? `Undo ${t.title}` : `Mark ${t.title} done`}>{t.done ? <Check size={14} strokeWidth={3} /> : null}</button>
      </form>
      <div className="mini-main">
        <span className="title">{t.title}</span>
        <span className="mini-meta">
          <span className="badge">{t.tag}</span>
          {t.overdue ? <span className="badge danger">Overdue · {t.dueDate}</span> : null}
          {t.dueTime !== null ? <span className="small muted">{fmtMinutes(t.dueTime)}</span> : null}
          {t.repeat !== 'none' ? <span className="badge accent">↻ {repeatLabel(t.repeat)}</span> : null}
        </span>
      </div>
      {t.done ? <DonePill /> : <Link href={`/focus?task=${t.id}`} className="agenda-link" aria-label={`Focus on ${t.title}`} title="Focus on this"><Timer size={15} /></Link>}
    </li>
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ day?: string; welcome?: string }> }) {
  const user = await getCurrentUser();
  const { day: requested, welcome } = await searchParams;
  const data = await withUser(user!.id, async c => {
    const settings = await getSettings(c, user!.id);
    const today = dateKeyIn(settings.timezone);
    const day = isDateKey(requested) ? requested : today;
    const ws = await personalWorkspaceId(c, user!.id);
    const premium = isPremium(settings);
    if (premium) await postDueBills(c, user!.id, ws, today);
    const t = await loadToday(c, {
      ws, userId: user!.id, day, today, tz: settings.timezone, premium,
      student: settings.studentEnabled, workMode: settings.mode === 'work', budgetMinor: settings.monthlyBudgetMinor,
    });
    const routines = await listRoutines(c, ws);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const period = hour >= 5 && hour < 12 ? ['🌅', 'Good morning'] : hour < 17 ? ['☀️', 'Good afternoon'] : hour < 21 ? ['🌇', 'Good evening'] : ['🌙', 'Good night'];
    return { ...t, day, today, premium, routines, currency: settings.currency, workMode: settings.mode === 'work', greeting: `${period[1]}, ${(user!.name || 'there').split(' ')[0]}`, emoji: period[0] };
  });

  const { day, today, agenda, tasks, focus, notes, work, spend, premium, nowMin } = data;
  const isToday = day === today;
  const percent = data.routineTotal ? Math.round((data.routineDone / data.routineTotal) * 100) : 0;
  const timed = agenda.filter(a => a.startMin !== null);
  const untimed = agenda.filter(a => a.startMin === null);
  const next = isToday ? timed.find(a => !a.done && a.kind !== 'focus' && (a.endMin ?? a.startMin!) >= (nowMin ?? 0)) : timed.find(a => !a.done && a.kind !== 'focus');
  const nowIndex = nowMin === null ? -1 : timed.findIndex(a => (a.startMin ?? 0) > nowMin);
  const openTasks = tasks.overdue.length + tasks.today.filter(t => !t.done).length;
  const dayLabel = isToday ? 'today' : 'on this day';
  // Daily review: from 6 PM on today, and on any past day.
  const showReview = (isToday && (nowMin ?? 0) >= 18 * 60) || day < today;
  const unfinished = tasks.overdue.length + tasks.today.filter(t => !t.done).length;
  const missed = agenda.filter(a => a.kind === 'routine' && !a.done && (!isToday || (a.endMin ?? 0) <= (nowMin ?? 0)));
  const moveTo = day < today ? today : shiftDateKey(day, 1);

  return (
    <>
      <InstallNotice />
      <div className="page-head">
        <div>
          {isToday ? <Hero emoji={data.emoji} greeting={data.greeting} /> : <h1>{longDate(day)}</h1>}
          <p>
            {isToday ? `${longDate(day)} · ` : ''}
            {data.routineName && data.routineId ? <>Routine: <Link className="routine-link" href={`/routines#routine-${data.routineId}`}>{data.routineName} ›</Link></> : <>No routine yet · <Link className="routine-link" href="/routines">Set up a routine ›</Link></>}
          </p>
        </div>
        <div className="actions">
          <Link className="btn" href={`/today?day=${shiftDateKey(day, -1)}`} aria-label="Previous day">‹ Previous</Link>
          {!isToday ? <Link className="btn" href="/today">Today</Link> : null}
          <Link className="btn" href={`/today?day=${shiftDateKey(day, 1)}`} aria-label="Next day">Next ›</Link>
          <Link className="btn primary" href="/week"><CalendarRange size={15} strokeWidth={2} aria-hidden="true" /> Week</Link>
        </div>
      </div>

      {welcome === 'trial' ? <div className="notice success welcome-note" role="status"><span>🎉</span><div><strong>Your 15-day Premium trial has started.</strong> Every feature is unlocked: try Focus, Week and Spending from the menu.</div></div>
        : welcome === 'no_trial' ? <div className="notice welcome-note" role="status"><span>👋</span><div><strong>You&apos;re all set.</strong> This mobile number already had a free trial, so this account starts on Free. You can upgrade from Settings any time.</div></div> : null}
      <div className="stats">
        <div className="card stat">
          <div className="label">Routine</div>
          <div className="value num">{percent}%</div>
          <div className="small muted">{data.routineDone} of {data.routineTotal} activities</div>
          <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        </div>
        <Link href="/tasks" className="card stat stat-link">
          <div className="label">To-do</div>
          <div className="value num">{openTasks}</div>
          <div className="small muted">{tasks.overdue.length ? <span style={{ color: 'var(--danger)' }}>{tasks.overdue.length} overdue · </span> : null}{tasks.doneToday} done {dayLabel}</div>
        </Link>
        <Link href="/focus" className="card stat stat-link">
          <div className="label">Focus</div>
          {premium ? (<><div className="value num">{hmText(focus.minutes)}</div><div className="small muted">{focus.sessions.length} {focus.sessions.length === 1 ? 'session' : 'sessions'} {dayLabel}</div></>)
            : (<><div className="value"><Lock size={22} aria-hidden="true" /></div><div className="small muted">Premium feature</div></>)}
        </Link>
        {work ? (
          <Link href="/work" className="card stat stat-link">
            <div className="label">Time logged</div>
            <div className="value num">{hmText(work.minutes)}</div>
            <div className="small muted">{work.meetings} {work.meetings === 1 ? 'meeting' : 'meetings'}{work.timer ? ' · timer running' : ''}</div>
          </Link>
        ) : spend ? (
          <Link href={`/spend?day=${day}`} className="card stat stat-link">
            <div className="label">Spent {dayLabel}</div>
            <div className="value num">{money(spend.totalMinor, data.currency)}</div>
            <div className="small muted">{spend.count} {spend.count === 1 ? 'expense' : 'expenses'}</div>
          </Link>
        ) : (
          <Link href="/notes" className="card stat stat-link">
            <div className="label">Reminders</div>
            <div className="value num">{notes.reminders.length}</div>
            <div className="small muted">{notes.pinned.length} pinned notes</div>
          </Link>
        )}
      </div>

      <div className="layout-2">
        <section className="card flush">
          <div className="card-head">
            <h2>Your day</h2>
            <span className="legend-chips small muted">{agenda.length} items</span>
          </div>
          {agenda.length === 0 ? (
            <AddDialog title="Add an activity" label="Add an activity" text={<>Nothing planned {dayLabel} yet. Tap + to add your first activity, or add a to-do with a time on the right.</>}>
            <form action={addEvent} className="form-grid">
              <input type="hidden" name="day" value={day} />
              <label className="field span-12">Title<input className="input" name="title" required maxLength={120} placeholder="e.g. Evening walk" /></label>
              <div className="span-12"><IconPicker /></div>
              <label className="field span-6">Starts<input className="input" name="start" type="time" required /></label>
              <label className="field span-6">Ends<input className="input" name="end" type="time" required /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add activity</button></div>
            </form>
            </AddDialog>
          ) : (
            <ol className="agenda">
              {timed.map((a, i) => (
                <li key={a.key} className="agenda-wrap">
                  {i === nowIndex ? <div className="now-line" aria-label={`Now, ${fmtMinutes(nowMin!)}`}><span>Now · {fmtMinutes(nowMin!)}</span></div> : null}
                  <div className={`agenda-item kind-${a.kind} ${a.done ? 'done' : ''}`}>
                    <div className="agenda-time num">{fmtMinutes(a.startMin!)}{a.endMin !== null ? <span>{fmtMinutes(a.endMin)}</span> : null}</div>
                    <div className="agenda-mark">{a.toggle ? <ToggleForm item={a} day={day} /> : <span className="agenda-icon" aria-hidden="true">{a.emoji}</span>}</div>
                    <div className="agenda-main">
                      <span className="title">{a.kind === 'routine' || a.kind === 'task' || a.kind === 'deadline' ? `${a.emoji} ` : ''}{a.title}</span>
                      <span className="agenda-meta"><span className={`kind-chip kind-${a.kind}`}>{KIND_LABEL[a.kind]}</span><span className="small muted">{a.meta}</span>{a.streak && a.streak >= 2 ? <span className="streak-chip" title={`${a.streak} scheduled days in a row`}>🔥 {a.streak}</span> : null}</span>
                    </div>
                    <div className="agenda-end">{a.done ? <DonePill /> : null}{a.href ? <Link href={a.href} className="agenda-link" aria-label={`Open ${a.title}`}><ArrowRight size={16} /></Link> : null}</div>
                  </div>
                </li>
              ))}
              {nowIndex === -1 && nowMin !== null && timed.length ? <li className="agenda-wrap"><div className="now-line"><span>Now · {fmtMinutes(nowMin)}</span></div></li> : null}
              {untimed.length ? <li className="agenda-group">Anytime</li> : null}
              {untimed.map(a => (
                <li key={a.key} className="agenda-wrap">
                  <div className={`agenda-item kind-${a.kind} ${a.done ? 'done' : ''}`}>
                    <div className="agenda-time muted">—</div>
                    <div className="agenda-mark">{a.toggle ? <ToggleForm item={a} day={day} /> : <span className="agenda-icon" aria-hidden="true">{a.emoji}</span>}</div>
                    <div className="agenda-main">
                      <span className="title">{a.title}</span>
                      <span className="agenda-meta"><span className={`kind-chip kind-${a.kind}`}>{KIND_LABEL[a.kind]}</span><span className="small muted">{a.meta}</span></span>
                    </div>
                    <div className="agenda-end">{a.done ? <DonePill /> : null}{a.href ? <Link href={a.href} className="agenda-link" aria-label={`Open ${a.title}`}><ArrowRight size={16} /></Link> : null}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <details className="panel agenda-add" open={agenda.length === 0}>
            <summary><Plus size={15} aria-hidden="true" /> {data.routineId ? 'Add an activity to this routine' : 'Add your first activity'}</summary>
            <form action={addEvent} className="form-grid">
              <input type="hidden" name="day" value={day} />
              <label className="field span-12">Title<input className="input" name="title" required maxLength={120} placeholder="e.g. Evening walk" /></label>
              <div className="span-12"><IconPicker /></div>
              <label className="field span-6">Starts<input className="input" name="start" type="time" required /></label>
              <label className="field span-6">Ends<input className="input" name="end" type="time" required /></label>
              <div className="span-12" style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" type="submit">Add activity</button></div>
            </form>
          </details>
        </section>

        <div className="stack">
          {showReview ? (
            <section className="card review">
              <div className="card-head"><h2>{isToday ? 'How did today go?' : 'Day in review'}</h2><span className="badge accent">{percent}% routine</span></div>
              <div className="card-body stack" style={{ gap: 12 }}>
                <div className="kv-grid">
                  <div><span className="small muted">Activities done</span><strong className="num">{data.routineDone}/{data.routineTotal}</strong></div>
                  <div><span className="small muted">Tasks done</span><strong className="num">{tasks.doneToday}</strong></div>
                  <div><span className="small muted">Focus</span><strong className="num">{premium ? hmText(focus.minutes) : '—'}</strong></div>
                  <div><span className="small muted">Still open</span><strong className="num">{unfinished}</strong></div>
                </div>
                {missed.length ? <p className="small muted">Missed: {missed.slice(0, 4).map(m => m.title).join(', ')}{missed.length > 4 ? ` and ${missed.length - 4} more` : ''}.</p> : <p className="small muted">Every activity that has ended is done. 🎉</p>}
                {unfinished ? (
                  <form action={moveUnfinishedTasks}>
                    <input type="hidden" name="from" value={day} /><input type="hidden" name="to" value={moveTo} />
                    <button className="btn primary block" type="submit">Move {unfinished} unfinished {unfinished === 1 ? 'task' : 'tasks'} to {moveTo === today ? 'today' : 'tomorrow'}</button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}
          {next ? (
            <section className="card next-up card-body">
              <div className="small">{isToday && nowMin !== null && next.startMin! <= nowMin ? 'Happening now' : 'Next up'} · {fmtMinutes(next.startMin!)}{next.kind !== 'routine' ? ` · ${KIND_LABEL[next.kind]}` : ''}</div>
              <div className="next-title">{next.emoji} {next.title}</div>
            </section>
          ) : null}

          <section className="card flush">
            <div className="card-head"><h2>To-do</h2><Link href="/tasks">All tasks</Link></div>
            <form action={addTask} className="quick-add">
              <input type="hidden" name="dueDate" value={day} />
              <input className="input" name="title" required maxLength={120} placeholder={`Add a task for ${isToday ? 'today' : longDate(day)}`} aria-label="New task" />
              <input className="input quick-time" name="dueTime" type="time" aria-label="Time (optional)" />
              <button className="btn primary" type="submit" aria-label="Add task"><Plus size={16} /></button>
            </form>
            {tasks.overdue.length + tasks.today.length + tasks.anytime.length === 0 ? (
              <div className="mini-empty">No tasks {dayLabel}. Nice and clear.</div>
            ) : (
              <>
                {tasks.overdue.length ? <><div className="mini-group danger">Overdue</div><ul className="mini-list">{tasks.overdue.map(t => <TaskRow key={t.id} t={t} />)}</ul></> : null}
                {tasks.today.length ? <><div className="mini-group">Due {dayLabel}</div><ul className="mini-list">{tasks.today.map(t => <TaskRow key={t.id} t={t} />)}</ul></> : null}
                {tasks.anytime.length ? <><div className="mini-group">No date</div><ul className="mini-list">{tasks.anytime.map(t => <TaskRow key={t.id} t={t} />)}</ul></> : null}
              </>
            )}
          </section>

          {premium ? (
            <section className="card flush">
              <div className="card-head"><h2><Timer size={16} aria-hidden="true" className="h-icon" /> Focus</h2><Link href="/focus">Open timer</Link></div>
              <div className="card-body">
                <div className="split-stat"><strong className="num">{hmText(focus.minutes)}</strong><span className="small muted">{focus.sessions.length ? `in ${focus.sessions.length} ${focus.sessions.length === 1 ? 'session' : 'sessions'}` : `No focus sessions ${dayLabel} yet`}</span></div>
                {focus.sessions.length ? (
                  <ul className="mini-list plain">
                    {focus.sessions.map((s, i) => <li key={i} className="mini-row"><span className="small muted num">{fmtMinutes(s.atMin)}</span><span className="mini-main">{s.title || 'Focus session'}</span><span className="badge">{s.minutes} min</span></li>)}
                  </ul>
                ) : null}
                {isToday ? <Link href="/focus" className="btn block" style={{ marginTop: 12 }}><Timer size={16} aria-hidden="true" /> Start a focus session</Link> : null}
              </div>
            </section>
          ) : null}

          {work ? (
            <section className="card flush">
              <div className="card-head"><h2><Briefcase size={16} aria-hidden="true" className="h-icon" /> Work</h2><Link href="/work">Open</Link></div>
              <div className="card-body stack" style={{ gap: 12 }}>
                {work.timer ? (
                  <div className="timer-strip">
                    <span className="focus-dot on" aria-hidden="true" />
                    <div className="mini-main"><strong>{work.timer.project}</strong><span className="small muted">{work.timer.note || 'Timer running'}</span></div>
                    <strong className="num"><Elapsed startedAt={work.timer.startedAt} /></strong>
                    <form action={stopTimer}><button className="btn sm" type="submit">Stop</button></form>
                  </div>
                ) : null}
                <div className="kv-grid">
                  <div><span className="small muted">Logged</span><strong className="num">{hmText(work.minutes)}</strong></div>
                  <div><span className="small muted">Billable</span><strong className="num">{hmText(work.billableMinutes)}</strong></div>
                  <div><span className="small muted">Meetings</span><strong className="num">{work.meetings}</strong></div>
                  <div><span className="small muted">Open actions</span><strong className="num">{work.openActions}</strong></div>
                </div>
                {!work.timer && isToday ? <Link href="/work" className="btn block">Start a timer</Link> : null}
              </div>
            </section>
          ) : null}

          <section className="card flush">
            <div className="card-head"><h2><NotebookPen size={16} aria-hidden="true" className="h-icon" /> Notes</h2><Link href="/notes/new">New note</Link></div>
            {notes.reminders.length + notes.pinned.length === 0 ? (
              <div className="mini-empty">Pin a note or set a reminder and it shows here.</div>
            ) : (
              <ul className="mini-list">
                {notes.reminders.map(r => (
                  <li key={`r${r.id}`} className={`mini-row ${r.done ? 'done' : ''}`}><CheckForm kind="reminder" id={r.id} day={day} done={r.done} title={r.title} />
                    <Link href={`/notes?id=${r.id}`} className="mini-main"><span className="title">{r.title}</span><span className="small muted"><Bell size={12} aria-hidden="true" className="mini-ico warn" /> Reminder at {fmtMinutes(r.atMin)}</span></Link>{r.done ? <DonePill /> : null}</li>
                ))}
                {notes.pinned.map(n => (
                  <li key={`p${n.id}`} className={`mini-row ${n.done ? 'done' : ''}`}><CheckForm kind="note" id={n.id} day={day} done={n.done} title={n.title} />
                    <Link href={`/notes?id=${n.id}`} className="mini-main"><span className="title"><Pin size={12} aria-hidden="true" className="mini-ico" /> {n.title}</span>{n.snippet ? <span className="small muted clamp-1">{n.snippet}</span> : null}</Link>{n.done ? <DonePill /> : null}</li>
                ))}
              </ul>
            )}
          </section>

          {spend ? (
            <section className="card flush">
              <div className="card-head"><h2><Wallet size={16} aria-hidden="true" className="h-icon" /> Spending</h2><Link href={`/spend?day=${day}`}>Add expense</Link></div>
              <div className="card-body">
                <div className="kv-grid">
                  <div><span className="small muted">{isToday ? 'Today' : 'This day'}</span><strong className="num">{money(spend.totalMinor, data.currency)}</strong></div>
                  <div><span className="small muted">This month</span><strong className="num">{money(spend.monthMinor, data.currency)}</strong></div>
                </div>
                {spend.budgetMinor ? (
                  <>
                    <div className="progress" title="Monthly budget used"><span style={{ width: `${Math.min(100, Math.round((spend.monthMinor / spend.budgetMinor) * 100))}%`, background: spend.monthMinor > spend.budgetMinor ? 'var(--danger)' : undefined }} /></div>
                    <div className="small muted" style={{ marginTop: 6 }}>{Math.round((spend.monthMinor / spend.budgetMinor) * 100)}% of {money(spend.budgetMinor, data.currency)} budget</div>
                  </>
                ) : null}
              </div>
            </section>
          ) : null}

          {!premium ? (
            <section className="card card-body upsell">
              <strong>See your whole day in one place</strong>
              <p className="small muted">Premium adds focus sessions, meetings, time tracking, classes and spending to Today.</p>
              <Link href="/settings#plan" className="btn primary sm">Try Premium free</Link>
            </section>
          ) : null}
        </div>
      </div>

      <section className="card flush" style={{ marginTop: 20 }}>
        <div className="card-head">
          <h2>Routines</h2>
          <Link href="/routines">Manage ›</Link>
        </div>
        {data.routines.length === 0 ? <div className="empty">No routines yet. A routine is the plan for your weekdays, like “Workdays” or “Weekend”. <Link className="routine-link" href="/routines">Create your first routine ›</Link></div> : (
          <ul className="routine-list">
            {data.routines.map(r => (
              <li key={r.id} className="routine-row">
                <span className="routine-dot" style={{ background: r.color }} aria-hidden="true" />
                <div className="routine-name">
                  <strong>{r.name}</strong>
                  <span className="small muted">{r.events.length} activities</span>
                </div>
                <div className="routine-days" aria-label="Weekdays">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className={r.days.includes(i) ? 'on' : ''}>{d}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
