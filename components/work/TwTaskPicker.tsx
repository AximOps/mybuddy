'use client';

import { useState } from 'react';
import type { TwProject } from '@/lib/timesheet';

export interface PickerProject { id: string; name: string; client: string | null; twProjectId: number | null }

/**
 * My Buddy project + Teamwork task, side by side in a form-grid. The task list follows the chosen
 * project: its linked Teamwork project comes first, other Teamwork projects below.
 * Posts projectId and twTaskId (empty = no Teamwork task).
 */
export function TwTaskPicker({ projects, catalog, defaultProjectId, defaultTaskId, projectSpan = 'span-4', taskSpan = 'span-4', required = true }: {
  projects: PickerProject[]; catalog: TwProject[]; defaultProjectId?: string; defaultTaskId?: number | null;
  projectSpan?: string; taskSpan?: string; required?: boolean;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [taskId, setTaskId] = useState(defaultTaskId ? String(defaultTaskId) : '');
  const linked = projects.find(p => p.id === projectId)?.twProjectId ?? null;
  const first = catalog.filter(p => p.id === linked);
  const rest = catalog.filter(p => p.id !== linked);

  const group = (p: TwProject, label?: string) => (
    <optgroup key={p.id} label={label ?? p.name}>
      {p.tasks.map(t => <option key={t.id} value={t.id}>{t.name}{t.tasklist ? ` · ${t.tasklist}` : ''}</option>)}
    </optgroup>
  );

  return (
    <>
      <label className={`field ${projectSpan}`}>Project
        <select className="select" name="projectId" required={required} value={projectId}
          onChange={e => {
            setProjectId(e.target.value);
            const l = projects.find(p => p.id === e.target.value)?.twProjectId;
            if (l && taskId && !catalog.find(p => p.id === l)?.tasks.some(t => String(t.id) === taskId)) setTaskId('');
          }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ''}</option>)}
        </select>
      </label>
      <label className={`field ${taskSpan}`}>Teamwork task
        <select className="select" name="twTaskId" value={taskId} onChange={e => setTaskId(e.target.value)}>
          <option value="">— Not for the timesheet —</option>
          {first.map(p => group(p, `${p.name} (linked)`))}
          {rest.map(p => group(p))}
        </select>
      </label>
    </>
  );
}
