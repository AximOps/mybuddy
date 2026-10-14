import { withUser } from '@/lib/db';
import { personalWorkspaceId } from '@/lib/planner';
import { getCurrentUser } from '@/lib/session';
import { invoicePdf, type ReportLine } from '@/lib/work';
import { isUuid } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** Downloads an invoice as PDF, using the lines saved when it was created. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in', { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', { status: 404 });

  const invoice = await withUser(user.id, async c => {
    const ws = await personalWorkspaceId(c, user.id);
    const { rows } = await c.query<{
      number: string; client_name: string; period_start: string; period_end: string; currency: string; total_minor: number; lines: ReportLine[]; created_at: Date;
    }>(
      `select number, client_name, period_start::text as period_start, period_end::text as period_end, currency, total_minor, lines, created_at
         from invoices where id = $1 and workspace_id = $2`, [id, ws]);
    return rows[0] ?? null;
  });
  if (!invoice) return new Response('Not found', { status: 404 });

  const pdf = await invoicePdf({
    number: invoice.number,
    issued: invoice.created_at.toISOString().slice(0, 10),
    from: invoice.period_start,
    to: invoice.period_end,
    business: user.name || user.email,
    client: invoice.client_name,
    currency: invoice.currency,
    lines: invoice.lines,
    totalMinor: invoice.total_minor,
  });
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.number}.pdf"` },
  });
}
