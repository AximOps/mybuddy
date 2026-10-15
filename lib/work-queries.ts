import type { PoolClient } from 'pg';
import type { EntryRow } from './work';

/** Billable and non-billable entries in a date range, optionally for one client. */
export async function entriesForReport(c: PoolClient, ws: string, from: string, to: string, clientId: string | null): Promise<EntryRow[]> {
  const { rows } = await c.query<EntryRow>(
    `select e.project_id, p.name as project_name, cl.name as client_name, p.hourly_rate_minor, e.start_min, e.end_min, e.billable,
            e.user_id, u.name as user_name, u.email as user_email
       from time_entries e join projects p on p.id = e.project_id left join clients cl on cl.id = p.client_id
       join "user" u on u.id = e.user_id
      where e.workspace_id = $1 and e.deleted_at is null and e.spent_on >= $2 and e.spent_on <= $3
        and ($4::uuid is null or p.client_id = $4::uuid)
      order by e.spent_on, e.start_min`,
    [ws, from, to, clientId]);
  return rows;
}
