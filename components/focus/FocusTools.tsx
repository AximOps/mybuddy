'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AlarmClock, Bell, BellRing, Coffee, Flag, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trash2, Volume2, Watch, X } from 'lucide-react';
import { addQuickReminder, recordFocusSession, removeReminder } from '@/app/actions';
import { FocusTimer, MinutePicker } from '@/components/FocusTimer';
import { FocusDial } from './FocusDial';
import { nextAlarmAt, swElapsed, useTools, type Alarm } from './ToolsProvider';
import { SOUNDS, type SoundId } from './sound';

import type { FocusTab } from '@/lib/focus-tabs';

const FOCUS_TABS: { id: FocusTab; label: string; icon: typeof Timer }[] = [
  { id: 'timer', label: 'Timer', icon: Timer },
  { id: 'breaks', label: 'Breaks', icon: Coffee },
  { id: 'alarm', label: 'Alarm', icon: AlarmClock },
  { id: 'stopwatch', label: 'Stopwatch', icon: Watch },
  { id: 'reminders', label: 'Reminders', icon: Bell },
];
export type ReminderRow = { id: string; title: string; atMs: number; when: string; isNote: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const hms = (sec: number) => { const s = Math.max(0, Math.ceil(sec)); const h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function rel(ms: number) {
  if (ms <= 0) return 'now';
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return `in ${h} h${m ? ` ${m} min` : ''}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}
const swFmt = (ms: number) => { const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000); const h = Math.floor(s / 3600); return `${h ? `${h}:` : ''}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}.${pad(cs)}`; };
const fmtTime = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${pad(m)}`; };
const ampm = (hm: string) => Number(hm.split(':')[0]) >= 12 ? 'PM' : 'AM';
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function repeatText(days: number[]) {
  if (!days.length) return 'Once';
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '0,6') return 'Weekends';
  return days.map(d => DAY_NAMES[d]).join(', ');
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function SoundPicker({ value, onChange, id }: { value: SoundId; onChange: (s: SoundId) => void; id: string }) {
  const { previewSound } = useTools();
  return (
    <div className="field">
      <label htmlFor={id}>Sound</label>
      <div className="sound-row">
        <select id={id} className="select" value={value} onChange={e => onChange(e.target.value as SoundId)}>
          {SOUNDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => previewSound(value)} aria-label="Play the sound"><Volume2 size={16} /> Test</button>
      </div>
    </div>
  );
}

function NotifyHint() {
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported' | null>(null);
  useEffect(() => setPerm('Notification' in window ? Notification.permission : 'unsupported'), []);
  if (perm !== 'default') return null;
  return (
    <button type="button" className="btn ghost sm" onClick={() => void Notification.requestPermission().then(setPerm)}>
      <BellRing size={15} /> Also notify me when this tab is in the background
    </button>
  );
}

/* ---------------- Breaks ---------------- */

function BreaksPanel() {
  const { breaks, breakState, setBreaks, startBreak, endBreak, resetBreakTimer, now } = useTools();
  const onBreak = !!breakState.breakEndAt;
  const paused = breakState.pausedLeft != null;
  const every = breaks.everyMin * 60;
  const left = onBreak ? ((breakState.breakEndAt as number) - now) / 1000 : paused ? (breakState.pausedLeft as number) / 1000 : breakState.nextAt ? (breakState.nextAt - now) / 1000 : every;
  const total = onBreak ? breaks.breakMin * 60 : every;
  const progress = total ? Math.min(1, Math.max(0, 1 - left / total)) : 0;

  return (
    <section className="card card-body tool-card">
      <div className="tool-toggle">
        <div>
          <h2>Regular break reminders</h2>
          <p className="small muted">A nudge to stand up, stretch and rest your eyes every so often, on any page.</p>
        </div>
        <Switch checked={breaks.enabled} onChange={v => setBreaks({ enabled: v })} label="Regular break reminders" />
      </div>

      {breaks.enabled && now ? (
        <div className="focus-stage compact">
          <FocusDial progress={progress} state={paused ? 'paused' : onBreak ? 'break' : 'running'}>
            {onBreak ? <Coffee size={22} aria-hidden="true" className="focus-break-icon" /> : null}
            <div className="focus-dial num">{hms(left)}</div>
            <span className="fdial-sub">{onBreak ? 'break left' : paused ? 'paused during focus' : 'until next break'}</span>
          </FocusDial>
        </div>
      ) : null}

      {breaks.enabled ? (
        <div className="actions" style={{ justifyContent: 'center' }}>
          {onBreak ? <button type="button" className="btn primary" onClick={endBreak}>End break</button>
            : <button type="button" className="btn primary" onClick={startBreak}><Coffee size={15} /> Take a break now</button>}
          {!onBreak && !paused ? <button type="button" className="btn" onClick={resetBreakTimer}><RotateCcw size={14} /> Restart countdown</button> : null}
        </div>
      ) : null}

      <MinutePicker label="Remind me every" presets={[20, 30, 45, 60, 90]} value={breaks.everyMin} max={240} onChange={n => setBreaks({ everyMin: Math.max(5, n) })} />
      <MinutePicker label="Break length" presets={[2, 5, 10, 15]} value={breaks.breakMin} max={60} onChange={n => setBreaks({ breakMin: n })} />

      <div className="tool-options">
        <label className="check-row"><input type="checkbox" checked={breaks.pauseDuringFocus} onChange={e => setBreaks({ pauseDuringFocus: e.target.checked })} /> Hold reminders while a focus timer or Pomodoro runs</label>
        <label className="check-row"><input type="checkbox" checked={breaks.useHours} onChange={e => setBreaks({ useHours: e.target.checked })} /> Only between set hours</label>
        {breaks.useHours ? (
          <div className="hours-row">
            <label className="field">From<input className="input" type="time" value={breaks.from} onChange={e => e.target.value && setBreaks({ from: e.target.value })} /></label>
            <label className="field">To<input className="input" type="time" value={breaks.to} onChange={e => e.target.value && setBreaks({ to: e.target.value })} /></label>
          </div>
        ) : null}
      </div>
      <SoundPicker id="break-sound" value={breaks.sound} onChange={s => setBreaks({ sound: s })} />
      <p className="small muted">Break reminders ring while My Buddy is open in a tab or as the installed app on this device. Settings stay on this device.</p>
      <NotifyHint />
    </section>
  );
}

/* ---------------- Alarm ---------------- */

type Draft = { id?: string; time: string; label: string; days: number[]; sound: SoundId; snoozeMin: number };
const blankDraft = (): Draft => {
  const d = new Date(Date.now() + 60 * 60_000);
  return { time: `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 5) * 5)}`, label: '', days: [], sound: 'beep', snoozeMin: 5 };
};

function AlarmPanel() {
  const { alarms, saveAlarm, toggleAlarm, removeAlarm, now } = useTools();
  const [draft, setDraft] = useState<Draft | null>(null);
  const edit = (a: Alarm) => setDraft({ id: a.id, time: a.time, label: a.label, days: a.days, sound: a.sound, snoozeMin: a.snoozeMin || 5 });
  const setDays = (days: number[]) => draft && setDraft({ ...draft, days: [...new Set(days)].sort() });
  const next = alarms.map(a => ({ a, at: nextAlarmAt(a, now || Date.now()) })).filter(x => x.at).sort((x, y) => (x.at as number) - (y.at as number))[0];

  return (
    <section className="card card-body tool-card">
      <div className="tool-toggle">
        <div>
          <h2>Alarms</h2>
          <p className="small muted">{next && now ? <>Next alarm <strong>{rel((next.at as number) - now)}</strong>{next.a.label ? ` · ${next.a.label}` : ''}</> : 'Set a time and My Buddy rings, once or on repeat days.'}</p>
        </div>
        {!draft ? <button type="button" className="btn primary sm" onClick={() => setDraft(blankDraft())}><Plus size={15} /> New alarm</button> : null}
      </div>

      {draft ? (
        <form className="alarm-form" onSubmit={e => { e.preventDefault(); saveAlarm(draft); setDraft(null); }}>
          <input className="input alarm-time-input" type="time" required value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} aria-label="Alarm time" />
          <label className="field">Label<input className="input" maxLength={60} placeholder="Optional, e.g. Leave for class" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
          <div className="field">
            <span>Repeat</span>
            <div className="day-chips" role="group" aria-label="Repeat on">
              {DAYS.map((d, i) => (
                <button key={i} type="button" className={`day-chip ${draft.days.includes(i) ? 'on' : ''}`} aria-pressed={draft.days.includes(i)} aria-label={DAY_NAMES[i]}
                  onClick={() => setDays(draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i])}>{d}</button>
              ))}
            </div>
            <div className="chip-row">
              <button type="button" className={`chip ${!draft.days.length ? 'on' : ''}`} onClick={() => setDays([])}>Once</button>
              <button type="button" className={`chip ${draft.days.join() === '1,2,3,4,5' ? 'on' : ''}`} onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
              <button type="button" className={`chip ${draft.days.length === 7 ? 'on' : ''}`} onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
            </div>
          </div>
          <div className="hours-row">
            <SoundPicker id="alarm-sound" value={draft.sound} onChange={s => setDraft({ ...draft, sound: s })} />
            <label className="field">Snooze
              <select className="select" value={draft.snoozeMin} onChange={e => setDraft({ ...draft, snoozeMin: Number(e.target.value) })}>
                {[5, 10, 15, 30].map(m => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">{draft.id ? 'Save alarm' : 'Set alarm'}</button>
            <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      ) : null}

      {alarms.length ? (
        <ul className="alarm-list">
          {alarms.map(a => {
            const at = nextAlarmAt(a, now || Date.now());
            return (
              <li key={a.id} className={`alarm-row ${a.enabled ? '' : 'off'}`}>
                <div className="alarm-main">
                  <span className="alarm-time num">{fmtTime(a.time)}<small>{ampm(a.time)}</small></span>
                  <span className="small muted">{a.label ? `${a.label} · ` : ''}{repeatText(a.days)}{a.enabled && at && now ? ` · rings ${rel(at - now)}` : ''}{a.snoozeUntil ? ' · snoozed' : ''}</span>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => edit(a)} aria-label="Edit alarm"><Pencil size={15} /></button>
                <button type="button" className="btn ghost sm danger" onClick={() => removeAlarm(a.id)} aria-label="Delete alarm"><Trash2 size={15} /></button>
                <Switch checked={a.enabled} onChange={v => toggleAlarm(a.id, v)} label={`Alarm at ${a.time}`} />
              </li>
            );
          })}
        </ul>
      ) : !draft ? <div className="tool-empty"><AlarmClock size={22} aria-hidden="true" /> No alarms yet.</div> : null}
      <p className="small muted">Alarms ring for up to a minute while My Buddy is open in a tab or as the installed app on this device, so keep the volume up. They are saved on this device.</p>
      <NotifyHint />
    </section>
  );
}

/* ---------------- Stopwatch ---------------- */

function StopwatchPanel() {
  const { stopwatch, swStart, swPause, swReset, swLap } = useTools();
  const [t, setT] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const raf = useRef(0);
  useEffect(() => {
    const loop = () => { setT(Date.now()); raf.current = requestAnimationFrame(loop); };
    if (stopwatch.startedAt) raf.current = requestAnimationFrame(loop); else setT(Date.now());
    return () => cancelAnimationFrame(raf.current);
  }, [stopwatch.startedAt]);
  const running = !!stopwatch.startedAt;
  const elapsed = t ? swElapsed(stopwatch, t) : stopwatch.accMs;
  const laps = stopwatch.laps.map((total, i) => ({ n: i + 1, total, split: total - (stopwatch.laps[i - 1] ?? 0) }));
  const splits = laps.map(l => l.split);
  const best = laps.length > 1 ? Math.min(...splits) : -1, worst = laps.length > 1 ? Math.max(...splits) : -1;
  const minutes = Math.min(480, Math.floor(elapsed / 60_000));
  const logIt = () => startTransition(async () => {
    const fd = new FormData(); fd.set('title', 'Stopwatch session'); fd.set('minutes', String(minutes));
    if (await recordFocusSession(fd)) { setSaved(`Saved ${minutes} min to Stats.`); swReset(); }
    else setSaved('Could not save this time. Try again.');
  });

  return (
    <section className="card card-body tool-card">
      <div className="focus-stage compact">
        <FocusDial progress={(elapsed % 60_000) / 60_000} state={running ? 'running' : 'paused'}>
          <div className="focus-dial num sw-dial">{swFmt(elapsed)}</div>
          <span className="fdial-sub">{running ? 'running' : elapsed ? 'paused' : 'stopwatch'}</span>
        </FocusDial>
      </div>
      <div className="actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" disabled={pending} onClick={running ? swPause : swStart}>{running ? <><Pause size={15} fill="currentColor" /> Pause</> : <><Play size={15} fill="currentColor" /> {elapsed ? 'Resume' : 'Start'}</>}</button>
        <button type="button" className="btn" onClick={swLap} disabled={!running}><Flag size={14} /> Lap</button>
        <button type="button" className="btn" onClick={() => { swReset(); setSaved(null); }} disabled={!elapsed}><RotateCcw size={14} /> Reset</button>
      </div>
      {!running && minutes >= 1 ? (
        <button type="button" className="btn ghost sm" style={{ alignSelf: 'center' }} disabled={pending} onClick={logIt}><Timer size={15} /> Log {minutes} min as a focus session</button>
      ) : null}
      {saved ? <div className="notice success" role="status" style={{ margin: 0 }}>{saved}</div> : null}
      {laps.length ? (
        <table className="table lap-table">
          <thead><tr><th>Lap</th><th>Lap time</th><th>Total</th></tr></thead>
          <tbody>
            {[...laps].reverse().map(l => (
              <tr key={l.n} className={l.split === best ? 'best' : l.split === worst ? 'worst' : ''}>
                <td>{l.n}{l.split === best ? ' · fastest' : l.split === worst ? ' · slowest' : ''}</td><td className="num">{swFmt(l.split)}</td><td className="num">{swFmt(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="small muted">The stopwatch keeps running if you switch pages or refresh.</p>
    </section>
  );
}

/* ---------------- Reminders ---------------- */

const QUICK = [5, 15, 30, 60, 120];
function RemindersPanel({ reminders, defaultAt }: { reminders: ReminderRow[]; defaultAt: string }) {
  const { ringReminders, setRingReminders, refreshReminders, now } = useTools();
  const [title, setTitle] = useState('');
  const [inMin, setInMin] = useState<number | null>(15);
  const [at, setAt] = useState(defaultAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = now;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('title', title);
    if (inMin) fd.set('inMin', String(inMin)); else fd.set('at', at);
    startTransition(async () => {
      const res = await addQuickReminder(fd);
      if (!res.ok) { setError(res.error ?? 'Could not save.'); return; }
      setError(null); setTitle(''); refreshReminders();
    });
  };
  const remove = (id: string) => startTransition(async () => {
    const fd = new FormData(); fd.set('id', id);
    await removeReminder(fd); refreshReminders();
  });

  return (
    <section className="card card-body tool-card">
      <div>
        <h2>Reminders</h2>
        <p className="small muted">Quick reminders also appear on Today, in Notes and on your phone.</p>
      </div>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <label className="field">Remind me to
          <input className="input" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Call mom, take medicine, check the oven" />
        </label>
        <div className="field">
          <span>When</span>
          <div className="chip-row" role="group" aria-label="When">
            {QUICK.map(m => (
              <button key={m} type="button" className={`chip ${inMin === m ? 'on' : ''}`} aria-pressed={inMin === m} onClick={() => setInMin(m)}>
                In {m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`}
              </button>
            ))}
            <button type="button" className={`chip ${inMin === null ? 'on' : ''}`} aria-pressed={inMin === null} onClick={() => setInMin(null)}>Pick a time</button>
          </div>
          {inMin === null ? <input className="input" type="datetime-local" required value={at} onChange={e => setAt(e.target.value)} aria-label="Reminder date and time" style={{ maxWidth: 260 }} /> : null}
        </div>
        {error ? <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
        <button type="submit" className="btn primary" disabled={pending} style={{ alignSelf: 'flex-start' }}><Bell size={15} /> Add reminder</button>
      </form>

      <div className="tool-toggle slim">
        <div>
          <strong>Ring in the app at the reminder time</strong>
          <p className="small muted">A pop-up and a sound for every timed reminder, on any page of My Buddy.</p>
        </div>
        <Switch checked={ringReminders} onChange={setRingReminders} label="Ring in the app at the reminder time" />
      </div>

      {reminders.length ? (
        <ul className="reminder-list">
          {reminders.map(r => {
            const past = !!t && r.atMs <= t;
            return (
              <li key={r.id} className={past ? 'past' : ''}>
                <span className="reminder-icon" aria-hidden="true"><Bell size={15} /></span>
                <div className="reminder-main">
                  <span className="title">{r.title}</span>
                  <span className="small muted">{r.when}{t ? ` · ${past ? 'passed' : rel(r.atMs - t)}` : ''}{r.isNote ? ' · from a note' : ''}</span>
                </div>
                <button type="button" className="btn ghost sm danger" disabled={pending} onClick={() => remove(r.id)} aria-label={`Remove reminder: ${r.title}`}><X size={15} /></button>
              </li>
            );
          })}
        </ul>
      ) : <div className="tool-empty"><Bell size={22} aria-hidden="true" /> No reminders coming up.</div>}
      <NotifyHint />
    </section>
  );
}

/* ---------------- Tabs ---------------- */

export function FocusTools({ initialTab, task, reminders, defaultAt }: { initialTab: FocusTab; task: { id: string; title: string } | null; reminders: ReminderRow[]; defaultAt: string }) {
  const [tab, setTab] = useState<FocusTab>(initialTab);
  const { breaks, breakState, alarms, stopwatch } = useTools();
  const go = (t: FocusTab) => {
    setTab(t);
    try { const u = new URL(window.location.href); if (t === 'timer') u.searchParams.delete('tab'); else u.searchParams.set('tab', t); window.history.replaceState(null, '', u); } catch { /* ignore */ }
  };
  const dot: Partial<Record<FocusTab, boolean>> = { breaks: breaks.enabled || !!breakState.breakEndAt, alarm: alarms.some(a => a.enabled), stopwatch: !!stopwatch.startedAt };
  return (
    <>
      <div className="seg focus-tabs" role="tablist" aria-label="Focus tools">
        {FOCUS_TABS.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`/focus${id === 'timer' ? '' : `?tab=${id}`}`} role="tab" aria-selected={tab === id} aria-current={tab === id ? 'true' : undefined} onClick={e => { e.preventDefault(); go(id); }}>
            <Icon size={15} aria-hidden="true" /> {label}{dot[id] ? <span className="tab-dot" aria-label="(on)" /> : null}
          </a>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'timer' ? <FocusTimer task={task} />
          : tab === 'breaks' ? <BreaksPanel />
          : tab === 'alarm' ? <AlarmPanel />
          : tab === 'stopwatch' ? <StopwatchPanel />
          : <RemindersPanel reminders={reminders} defaultAt={defaultAt} />}
      </div>
    </>
  );
}
