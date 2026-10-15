import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface EntryRow { project_id: string; project_name: string; client_name: string | null; hourly_rate_minor: number; start_min: number; end_min: number; billable: boolean; user_id?: string; user_name?: string; user_email?: string }

export interface ReportLine { project: string; client: string; hours: number; billableHours: number; rateMinor: number; amountMinor: number }

/** Totals per project. Amount = billable hours x hourly rate, in minor units (paise, cents). */
export function reportLines(entries: EntryRow[]): ReportLine[] {
  const byProject = new Map<string, ReportLine & { minutes: number; billable: number }>();
  for (const e of entries) {
    const minutes = e.end_min - e.start_min;
    const row = byProject.get(e.project_id) ?? {
      project: e.project_name, client: e.client_name ?? '-', hours: 0, billableHours: 0,
      rateMinor: e.hourly_rate_minor, amountMinor: 0, minutes: 0, billable: 0,
    };
    row.minutes += minutes;
    if (e.billable) row.billable += minutes;
    byProject.set(e.project_id, row);
  }
  return [...byProject.values()]
    .map(r => ({
      project: r.project, client: r.client, hours: r.minutes / 60, billableHours: r.billable / 60,
      rateMinor: r.rateMinor, amountMinor: Math.round((r.billable * r.rateMinor) / 60),
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.project.localeCompare(b.project));
}

/** Money as plain text with a currency code, e.g. "INR 1,234.50". Standard PDF fonts cannot draw symbols like the rupee sign. */
export function moneyText(minor: number, currency: string): string {
  const amount = (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${amount}`;
}

export const hoursText = (h: number) => h.toFixed(2);

/** Minutes as "3h 05m". */
export function hmText(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return `\uFEFF${rows.map(r => r.map(csvCell).join(',')).join('\r\n')}`;
}

/** Only characters that the standard PDF fonts can draw. Anything else becomes "?". */
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

export async function invoicePdf(o: {
  number: string; issued: string; from: string; to: string; business: string; client: string;
  currency: string; lines: ReportLine[]; totalMinor: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.2);
  const muted = rgb(0.42, 0.44, 0.56);
  let page: PDFPage = doc.addPage([595, 842]);
  let y = 790;

  const text = (t: string, x: number, size: number, f: PDFFont = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });
  const newPageIfNeeded = (need: number) => {
    if (y - need < 60) { page = doc.addPage([595, 842]); y = 790; }
  };

  text('Invoice', 50, 22, bold); y -= 26;
  text(o.number, 50, 12, font, muted); y -= 30;
  text(`Issued: ${o.issued}`, 50, 10, font, muted);
  text(`From: ${o.business}`, 330, 10, font);
  y -= 14;
  text(`Period: ${o.from} to ${o.to}`, 50, 10, font, muted);
  text(`Billed to: ${o.client}`, 330, 10, font);
  y -= 40;

  page.drawRectangle({ x: 50, y: y - 4, width: 495, height: 20, color: rgb(0.95, 0.96, 0.98) });
  text('Project', 56, 10, bold); text('Hours', 330, 10, bold); text('Rate / hour', 390, 10, bold); text('Amount', 490, 10, bold);
  y -= 26;

  for (const line of o.lines) {
    newPageIfNeeded(20);
    text(line.project, 56, 10);
    text(line.billableHours.toFixed(2), 330, 10);
    text(moneyText(line.rateMinor, o.currency), 390, 9);
    text(moneyText(line.amountMinor, o.currency), 490, 9);
    y -= 18;
  }
  if (o.lines.length === 0) { text('No billable time in this period.', 56, 10, font, muted); y -= 18; }

  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.8, color: rgb(0.85, 0.86, 0.9) });
  y -= 22;
  text(`Total due: ${moneyText(o.totalMinor, o.currency)}`, 380, 13, bold);
  y -= 40;
  text('Generated from timesheets in My Buddy. Taxes and payment terms are not included.', 50, 8, font, muted);

  return doc.save();
}

export async function reportPdf(o: { title: string; period: string; currency: string; lines: ReportLine[]; totalMinor: number; totalHours: number }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.2);
  const muted = rgb(0.42, 0.44, 0.56);
  let page: PDFPage = doc.addPage([595, 842]);
  let y = 790;
  const text = (t: string, x: number, size: number, f: PDFFont = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });

  text(o.title, 50, 20, bold); y -= 22;
  text(o.period, 50, 10, font, muted); y -= 30;
  page.drawRectangle({ x: 50, y: y - 4, width: 495, height: 20, color: rgb(0.95, 0.96, 0.98) });
  text('Project', 56, 10, bold); text('Client', 230, 10, bold); text('Hours', 370, 10, bold); text('Amount', 470, 10, bold);
  y -= 26;
  for (const l of o.lines) {
    if (y < 80) { page = doc.addPage([595, 842]); y = 790; }
    text(l.project, 56, 10); text(l.client, 230, 10); text(l.billableHours.toFixed(2), 370, 10);
    text(moneyText(l.amountMinor, o.currency), 470, 9);
    y -= 18;
  }
  y -= 14;
  text(`Total hours: ${o.totalHours.toFixed(2)}`, 50, 11, bold);
  text(`Billable total: ${moneyText(o.totalMinor, o.currency)}`, 330, 11, bold);
  return doc.save();
}

export interface PersonLine { person: string; minutes: number; billableMinutes: number; amountMinor: number }

/** Totals per employee across all projects. Amount uses each project's hourly rate. */
export function employeeSummary(entries: EntryRow[]): PersonLine[] {
  const byPerson = new Map<string, PersonLine>();
  for (const e of entries) {
    const key = e.user_id ?? 'unknown';
    const minutes = e.end_min - e.start_min;
    const row = byPerson.get(key) ?? { person: e.user_name || e.user_email || 'Unknown', minutes: 0, billableMinutes: 0, amountMinor: 0 };
    row.minutes += minutes;
    if (e.billable) {
      row.billableMinutes += minutes;
      row.amountMinor += Math.round((minutes * e.hourly_rate_minor) / 60);
    }
    byPerson.set(key, row);
  }
  return [...byPerson.values()].sort((a, b) => b.amountMinor - a.amountMinor || a.person.localeCompare(b.person));
}

/** Team CSV rows: one row per employee and project. */
export function employeeProjectRows(entries: EntryRow[]): (string | number)[][] {
  const map = new Map<string, { person: string; project: string; client: string; minutes: number; rate: number; amount: number }>();
  for (const e of entries.filter(x => x.billable)) {
    const key = `${e.user_id}|${e.project_id}`;
    const minutes = e.end_min - e.start_min;
    const row = map.get(key) ?? { person: e.user_name || e.user_email || 'Unknown', project: e.project_name, client: e.client_name ?? '-', minutes: 0, rate: e.hourly_rate_minor, amount: 0 };
    row.minutes += minutes;
    row.amount += Math.round((minutes * e.hourly_rate_minor) / 60);
    map.set(key, row);
  }
  return [
    ['Employee', 'Project', 'Client', 'Billable hours', 'Rate per hour', 'Amount'],
    ...[...map.values()].map(r => [r.person, r.project, r.client, hoursText(r.minutes / 60), (r.rate / 100).toFixed(2), (r.amount / 100).toFixed(2)]),
  ];
}
