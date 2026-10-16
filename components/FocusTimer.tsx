'use client';

import { useEffect, useState } from 'react';
import { Coffee, Pause, Play, SkipForward, Square, Timer } from 'lucide-react';
import { clock, useFocus, type FocusMode } from './focus/FocusProvider';
import { FocusDial } from './focus/FocusDial';

const DURATIONS = [5, 15, 30, 45, 60, 90, 120];
const BREAKS = [5, 10, 15, 30];
const ROUNDS = [2, 3, 4, 6];
const PREFS = 'mybuddy.focus.prefs.v1';
type Prefs = { mode: FocusMode; focusMin: number; breakMin: number; rounds: number };
const DEFAULT_PREFS: Prefs = { mode: 'single', focusMin: 30, breakMin: 5, rounds: 4 };
const clampMin = (n: number, max = 480) => Math.max(1, Math.min(max, Math.round(n) || 1));

/** Preset buttons plus a "Custom" button that opens a minutes field. */
export function MinutePicker({ label, presets, value, onChange, max = 480, unit = 'min' }: { label: string; presets: number[]; value: number; onChange: (n: number) => void; max?: number; unit?: string }) {
  const [custom, setCustom] = useState(!presets.includes(value));
  useEffect(() => { if (!presets.includes(value)) setCustom(true); }, [value, presets]);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chip-row" role="group" aria-label={label}>
        {presets.map(m => (
          <button key={m} type="button" className={`chip ${!custom && value === m ? 'on' : ''}`} aria-pressed={!custom && value === m} onClick={() => { setCustom(false); onChange(m); }}>
            {m} {unit}
          </button>
        ))}
        <button type="button" className={`chip ${custom ? 'on' : ''}`} aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
        {custom ? (
          <span className="chip-custom">
            <input className="input" type="number" min={1} max={max} value={value} onChange={e => onChange(clampMin(Number(e.target.value), max))} aria-label={`${label} (custom)`} autoFocus />
            <span className="small muted">{unit}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

const endsAt = (minutes: number) => new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The Focus page: set up a focus block or a Pomodoro, then the big running timer. */
export function FocusTimer({ task = null }: { task?: { id: string; title: string } | null }) {
  const { session, remaining, progress, running, start, pause, resume, stop, skipBreak, message, clearMessage } = useFocus();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [title, setTitle] = useState(task?.title ?? '');
  const [completeTask, setCompleteTask] = useState(true);

  useEffect(() => { try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }); } catch { /* defaults */ } }, []);
  const update = (p: Partial<Prefs>) => setPrefs(prev => { const next = { ...prev, ...p }; try { localStorage.setItem(PREFS, JSON.stringify(next)); } catch { /* ignore */ } return next; });

  if (!session) {
    const pomodoro = prefs.mode === 'pomodoro';
    const totalMin = pomodoro ? prefs.focusMin * prefs.rounds + prefs.breakMin * (prefs.rounds - 1) : prefs.focusMin;
    return (
      <section className="card card-body focus-setup">
        {message ? <div className="notice success" role="status" onClick={clearMessage}>{message}</div> : null}
        <div className="seg focus-mode" role="tablist" aria-label="Timer type">
          <a href="#" role="tab" aria-current={!pomodoro ? 'true' : undefined} onClick={e => { e.preventDefault(); update({ mode: 'single' }); }}><Timer size={14} aria-hidden="true" /> Focus</a>
          <a href="#" role="tab" aria-current={pomodoro ? 'true' : undefined} onClick={e => { e.preventDefault(); update({ mode: 'pomodoro' }); }}>🍅 Pomodoro</a>
        </div>
        <p className="small muted">{pomodoro ? 'Work in rounds with short breaks in between. Each finished round counts as a focus session.' : 'One block of focused time. It keeps running if you switch pages; a small timer follows you.'}</p>

        <div className="field">
          <label htmlFor="focus-title">What are you working on?</label>
          <input id="focus-title" className="input" value={title} maxLength={60} placeholder="Optional, e.g. Write the report" onChange={e => setTitle(e.target.value)} />
        </div>
        <MinutePicker label={pomodoro ? 'Focus length per round' : 'Duration'} presets={DURATIONS} value={prefs.focusMin} onChange={n => update({ focusMin: n })} />
        {pomodoro ? (
          <>
            <MinutePicker label="Break length" presets={BREAKS} value={prefs.breakMin} max={120} onChange={n => update({ breakMin: n })} />
            <MinutePicker label="Rounds" presets={ROUNDS} value={prefs.rounds} max={12} unit="rounds" onChange={n => update({ rounds: n })} />
          </>
        ) : null}
        {task ? (
          <label className="check-row">
            <input type="checkbox" checked={completeTask} onChange={e => setCompleteTask(e.target.checked)} />
            Tick off “{task.title}” when {pomodoro ? 'the last round' : 'the session'} finishes
          </label>
        ) : null}
        <div className="focus-summary">
          <span>{pomodoro ? `${prefs.rounds} × ${prefs.focusMin} min focus, ${prefs.breakMin} min breaks` : `${prefs.focusMin} minutes of focus`}</span>
          <span className="muted">Ends around {endsAt(totalMin)}</span>
        </div>
        <button type="button" className="btn primary block" style={{ height: 48 }}
          onClick={() => start({ mode: prefs.mode, title: title.trim(), taskId: task?.id ?? null, completeTask: !!task && completeTask, focusMin: prefs.focusMin, breakMin: pomodoro ? prefs.breakMin : 0, rounds: pomodoro ? prefs.rounds : 1 })}>
          <Play size={16} fill="currentColor" aria-hidden="true" /> Start {pomodoro ? 'Pomodoro' : `${prefs.focusMin}-minute focus`}
        </button>
        <p className="small muted">The timer keeps running if you refresh or move to another page. Finished sessions count in Stats and on Today.</p>
      </section>
    );
  }

  const isBreak = session.phase === 'break';
  return (
    <section className={`card card-body focus-run ${isBreak ? 'is-break' : ''}`} style={{ maxWidth: 560 }}>
      <div className="focus-status">
        <span className={`focus-dot ${running ? 'on' : ''}`} aria-hidden="true" />
        {isBreak ? 'Break' : running ? 'Focusing' : 'Paused'}
        {session.mode === 'pomodoro' ? ` · Round ${session.round} of ${session.rounds}` : ''}
        {session.title && !isBreak ? ` · ${session.title}` : ''}
      </div>
      <div className="focus-stage">
        <FocusDial progress={progress} state={!running ? 'paused' : isBreak ? 'break' : 'running'}>
          {isBreak ? <Coffee size={22} aria-hidden="true" className="focus-break-icon" /> : null}
          <div className="focus-dial num" aria-live="polite">{clock(remaining)}</div>
          <span className="fdial-sub">{!running ? 'paused' : isBreak ? `break · next round ${session.round + 1}` : session.mode === 'pomodoro' ? `focus ${session.round}/${session.rounds}` : 'focus'}</span>
        </FocusDial>
      </div>
      {session.mode === 'pomodoro' ? (
        <div className="round-dots" aria-label={`Round ${session.round} of ${session.rounds}`}>
          {Array.from({ length: session.rounds }, (_, i) => <span key={i} className={i + 1 < session.round || (i + 1 === session.round && isBreak) ? 'done' : i + 1 === session.round ? 'now' : ''} />)}
        </div>
      ) : null}
      <div className="actions" style={{ justifyContent: 'center', marginTop: 8 }}>
        <button type="button" className="btn primary" onClick={running ? pause : resume}>{running ? <><Pause size={15} fill="currentColor" /> Pause</> : <><Play size={15} fill="currentColor" /> Resume</>}</button>
        {isBreak ? <button type="button" className="btn" onClick={skipBreak}><SkipForward size={15} /> Skip break</button> : null}
        <button type="button" className="btn" onClick={stop}><Square size={13} fill="currentColor" /> Stop{session.mode === 'pomodoro' && (session.round > 1 || isBreak) ? '' : ' (not counted)'}</button>
      </div>
      {session.mode === 'pomodoro' && (session.round > 1 || isBreak) ? <p className="small muted" style={{ marginTop: 10 }}>Finished rounds are already saved. Stopping only skips what is left.</p> : null}
      {'Notification' in globalThis && Notification.permission === 'default' ? (
        <button type="button" className="btn ghost sm" style={{ marginTop: 14 }} onClick={() => void Notification.requestPermission()}>Allow notifications when time is up</button>
      ) : null}
    </section>
  );
}
