import { withUser } from '@/lib/db';
import { activeWorkspaceId } from '@/lib/workspace';
import { getCurrentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { entriesForReport } from '@/lib/work-queries';
import { employeeProjectRows, hoursText, reportLines, reportPdf, toCsv } from '@/lib/work';
import { isDateKey, isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** Hours report as CSV (?format=csv) or PDF (?format=pdf), for a date range and optional client. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const clientParam = url.searchParams.get('client') ?? '';
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv';
  if (!isDateKey(from) || !isDateKey(to) || to < from) return new Response('Choose a valid date range.', { status: 400 });
  const clientId = isUuid(clientParam) ? clientParam : null;

  const result = await withUser(user.id, async c => {
    const ws = await activeWorkspaceId(c, user.id);
    const settings = await getSettings(c, user.id);
    const kind = (await c.query<{ kind: string }>(`select kind from workspaces where id = $1`, [ws])).rows[0]?.kind;
    const entries = await entriesForReport(c, ws, from, to, clientId);
    const team = kind === 'organisation' && (await c.query<{ a: boolean }>(`select is_workspace_admin($1) as a`, [ws])).rows[0].a;
    return { lines: reportLines(entries), entries, team, currency: settings.currency };
  });

  const totalMinor = result.lines.reduce((s, l) => s + l.amountMinor, 0);
  const totalHours = result.lines.reduce((s, l) => s + l.billableHours, 0);
  const name = `hours-${from}-to-${to}`;

  if (format === 'csv') {
    const rows: (string | number)[][] = result.team
      ? employeeProjectRows(result.entries)
      : [
        ['Project', 'Client', 'Billable hours', 'Rate per hour', `Amount (${result.currency})`],
        ...result.lines.map(l => [l.project, l.client, hoursText(l.billableHours), (l.rateMinor / 100).toFixed(2), (l.amountMinor / 100).toFixed(2)]),
      ];
    return new Response(toCsv(rows), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` },
    });
  }

  const pdf = await reportPdf({
    title: 'Hours report', period: `${from} to ${to}`, currency: result.currency,
    lines: result.lines, totalMinor, totalHours,
  });
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` },
  });
}
