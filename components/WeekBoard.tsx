'use client';

import { useMemo, useState, useTransition, type DragEvent } from 'react';
import Link from 'next/link';
import { rescheduleItem } from '@/app/actions';

export interface WeekItem {
  key: string; kind: string; title: string; emoji: string; meta: string; done: boolean;
  startMin: number | null; endMin: number | null; href?: string;
  /** Set when the item can be dragged to another day or time. */
  move?: { kind: 'task' | 'meeting'; id: string };
}
export interface WeekDay { day: string; label: string; date: string; isToday: boolean; items: WeekItem[]; routinePct: number }

const START = 6 * 60, END = 23 * 60, PX = 0.9; // grid from 6 AM to 11 PM, pixels per minute
const SNAP = 15;
const fmt = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

/** Gives overlapping timed items side-by-side lanes. */
function lanes(items: WeekItem[]) {
  const sorted = [...items].sort((a, b) => a.startMin! - b.startMin!);
  const ends: number[] = [];
  const placed = sorted.map(it => {
    const end = it.endMin ?? it.startMin! + 30;
    let lane = ends.findIndex(e => e <= it.startMin!);
    if (lane < 0) { lane = ends.length; ends.push(end); } else ends[lane] = end;
    return { it, lane, end };
  });
  return placed.map(p => ({ ...p, lanes: Math.max(1, ends.length) }));
}

export function WeekBoard({ days, nowMin }: { days: WeekDay[]; nowMin: number | null }) {
  const [state, setState] = useState(days);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const hours = useMemo(() => Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60), []);

  const drop = (e: DragEvent<HTMLElement>, day: string, allDay: boolean) => {
    e.preventDefault();
    setOver(null);
    const raw = e.dataTransfer.getData('application/x-mybuddy');
    if (!raw) return;
    const { key, kind, id } = JSON.parse(raw) as { key: string; kind: 'task' | 'meeting'; id: string };
    let startMin: number | null = null;
    if (!allDay) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      startMin = Math.max(0, Math.min(1439, START + Math.round((e.clientY - rect.top) / PX / SNAP) * SNAP));
    }
    // Move it on screen at once, then save.
    const prev = state;
    let moved: WeekItem | undefined;
    const next = state.map(d => ({ ...d, items: d.items.filter(i => (i.key === key ? ((moved = i), false) : true)) }));
    if (!moved) return;
    const length = moved.startMin !== null && moved.endMin !== null ? moved.endMin - moved.startMin : null;
    const updated: WeekItem = { ...moved, startMin, endMin: startMin !== null && length !== null ? startMin + length : null };
    setState(next.map(d => d.day === day ? { ...d, items: [...d.items, updated] } : d));
    setError(null);
    start(async () => {
      const r = await rescheduleItem(kind, id, day, startMin);
      if (!r.ok) { setState(prev); setError('That item could not be moved. Please try again.'); }
    });
  };

  const dragProps = (it: WeekItem) => it.move ? {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData('application/x-mybuddy', JSON.stringify({ key: it.key, ...it.move }));
      e.dataTransfer.effectAllowed = 'move';
    },
  } : {};

  return (
    <>
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      <div className="week" style={{ ['--px' as string]: PX }}>
        <div className="week-head">
          <div className="week-gutter" />
          {state.map(d => (
            <div key={d.day} className={`week-dayhead ${d.isToday ? 'is-today' : ''}`}>
              <Link href={`/today?day=${d.day}`}><span>{d.label}</span><strong>{d.date}</strong></Link>
              <span className="week-pct" title="Routine done">{d.routinePct}%</span>
            </div>
          ))}
        </div>
        <div className="week-allday">
          <div className="week-gutter small muted">Any time</div>
          {state.map(d => (
            <div key={d.day} className={`week-allday-cell ${over === `${d.day}|all` ? 'over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(`${d.day}|all`); }} onDragLeave={() => setOver(null)} onDrop={e => drop(e, d.day, true)}>
              {d.items.filter(i => i.startMin === null).map(it => (
                <div key={it.key} className={`week-chip kind-${it.kind} ${it.done ? 'done' : ''} ${it.move ? 'movable' : ''}`} {...dragProps(it)} title={`${it.title} · ${it.meta}`}>
                  <span aria-hidden="true">{it.emoji}</span> {it.title}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="week-body" style={{ height: (END - START) * PX }}>
          <div className="week-gutter">
            {hours.map(h => <span key={h} style={{ top: (h - START) * PX }}>{fmt(h)}</span>)}
          </div>
          {state.map(d => (
            <div key={d.day} className={`week-col ${d.isToday ? 'is-today' : ''} ${over === d.day ? 'over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOver(d.day); }} onDragLeave={() => setOver(null)} onDrop={e => drop(e, d.day, false)}>
              {hours.map(h => <i key={h} className="week-line" style={{ top: (h - START) * PX }} />)}
              {d.isToday && nowMin !== null && nowMin >= START && nowMin <= END ? <i className="week-now" style={{ top: (nowMin - START) * PX }} /> : null}
              {lanes(d.items.filter(i => i.startMin !== null)).map(({ it, lane, lanes: n, end }) => {
                const top = (Math.max(START, it.startMin!) - START) * PX;
                const height = Math.max(22, (Math.min(END, end) - Math.max(START, it.startMin!)) * PX - 2);
                const body = (<><strong>{it.emoji} {it.title}</strong>{height > 34 ? <span>{fmt(it.startMin!)}{it.endMin !== null ? ` – ${fmt(it.endMin)}` : ''}</span> : null}</>);
                return (
                  <div key={it.key} className={`week-event kind-${it.kind} ${it.done ? 'done' : ''} ${it.move ? 'movable' : ''}`}
                    style={{ top, height, left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }} title={`${it.title} · ${it.meta}`} {...dragProps(it)}>
                    {it.href && !it.move ? <Link href={it.href}>{body}</Link> : body}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
