import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

/**
 * Posts this month's recurring bills that are due (their day has come) and not yet posted.
 * Only the current month is posted, so turning a bill on never back-fills old months.
 */
export async function postDueBills(c: PoolClient, userId: string, ws: string, today: string): Promise<number> {
  const month = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  const due = (await c.query<{ id: string; name: string; amount_minor: number; category: string; day_of_month: number }>(
    `select id, name, amount_minor, category, day_of_month from recurring_expenses
      where user_id = $1 and active and deleted_at is null and day_of_month <= $2 and (last_posted_month is null or last_posted_month < $3)`,
    [userId, dayOfMonth, month])).rows;
  for (const b of due) {
    const ref = `bill:${b.id}:${month}`;
    const exists = (await c.query(`select 1 from expenses where user_id = $1 and source_ref = $2 and deleted_at is null`, [userId, ref])).rowCount;
    if (!exists) {
      await c.query(
        `insert into expenses (id, workspace_id, user_id, spent_on, amount_minor, category, note, source, source_ref)
         values ($1, $2, $3, $4, $5, $6, $7, 'bill', $8)`,
        [randomUUID(), ws, userId, `${month}-${String(b.day_of_month).padStart(2, '0')}`, b.amount_minor, b.category, b.name, ref]);
    }
    await c.query(`update recurring_expenses set last_posted_month = $2 where id = $1`, [b.id, month]);
  }
  return due.length;
}

/* ---------- Bank CSV import ---------- */

export interface CsvRow { day: string; note: string; amountMinor: number; category: string; ref: string }

const KEYWORDS: [string, RegExp][] = [
  ['food', /swiggy|zomato|restaurant|cafe|coffee|starbucks|dominos|pizza|food|bakery|kfc|mcdonald|grocer|bigbasket|blinkit|zepto|dmart/i],
  ['transport', /uber|ola|rapido|metro|irctc|railway|fuel|petrol|diesel|hpcl|bpcl|indian oil|parking|fastag|toll|redbus|cab/i],
  ['shopping', /amazon|flipkart|myntra|ajio|nykaa|meesho|store|mall|shopping|decathlon|ikea/i],
  ['bills', /electric|bescom|tneb|water|gas|airtel|jio|vodafone|\bvi\b|bsnl|broadband|internet|rent|insurance|emi|loan|maintenance|recharge/i],
  ['health', /pharma|apollo|medplus|hospital|clinic|doctor|lab|diagnos|1mg|netmeds|gym|cult/i],
  ['fun', /netflix|prime video|hotstar|spotify|bookmyshow|pvr|inox|movie|game|steam|youtube premium/i],
  ['study', /udemy|coursera|book|school|college|tuition|fees|exam/i],
];
export function guessCategory(text: string): string {
  for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat;
  return 'other';
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Dates as YYYY-MM-DD, DD/MM/YYYY, DD-MM-YY or "15 Oct 2026". Day-first, as Indian and UK banks write them. */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '');
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return fmt(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})$/);
  if (m) { const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; if (mo) return fmt(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, +m[1]); }
  return null;
}
function fmt(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const num = (v: string | undefined) => {
  if (!v) return NaN;
  const neg = /^\(.*\)$/.test(v.trim()) || /\bdr\b/i.test(v);
  const n = Number(v.replace(/[^\d.-]/g, ''));
  return neg ? -Math.abs(n) : n;
};

/**
 * Reads a bank statement CSV. Finds the date, description and amount (or withdrawal/debit) columns
 * by their headings. Only money going out becomes an expense; deposits and credits are skipped.
 */
export function parseBankCsv(text: string): { rows: CsvRow[]; skipped: number; error?: string } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0, error: 'The file is empty.' };
  const sep = (lines.slice(0, 5).join('').match(/;/g)?.length ?? 0) > (lines.slice(0, 5).join('').match(/,/g)?.length ?? 0) ? ';' : ',';
  // The heading row is the first one that mentions a date and an amount-like column (banks often add a preamble).
  let headerAt = lines.findIndex(l => /date/i.test(l) && /(amount|debit|withdraw|dr\b)/i.test(l));
  if (headerAt < 0) return { rows: [], skipped: 0, error: 'Could not find the column headings. The file needs Date and Amount (or Debit / Withdrawal) columns.' };
  const head = splitCsvLine(lines[headerAt], sep).map(h => h.toLowerCase());
  const find = (re: RegExp) => head.findIndex(h => re.test(h));
  const iDate = find(/(txn|transaction|value|posting)?\s*date/);
  const iDesc = find(/narration|description|details|particulars|remarks|merchant|payee|memo/);
  const iDebit = find(/withdraw|debit|dr\b|paid out|money out/);
  const iCredit = find(/deposit|credit|cr\b|paid in|money in/);
  const iAmount = find(/^amount|amount\s*\(|txn amount|transaction amount|^amt/);
  if (iDate < 0 || (iDebit < 0 && iAmount < 0)) return { rows: [], skipped: 0, error: 'Could not find the Date and Amount columns.' };

  const body = lines.slice(headerAt + 1).map(l => splitCsvLine(l, sep));
  const amountsNegativeForSpend = iDebit < 0 && body.some(r => num(r[iAmount]) < 0);
  const rows: CsvRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const day = parseBankDate(r[iDate] ?? '');
    let amount = iDebit >= 0 ? num(r[iDebit]) : num(r[iAmount]);
    if (iDebit < 0 && amountsNegativeForSpend) amount = amount < 0 ? -amount : NaN;
    if (iDebit >= 0 && (!Number.isFinite(amount) || amount === 0) && iCredit >= 0) amount = NaN;
    if (!day || !Number.isFinite(amount) || amount <= 0 || amount > 9_999_999) { skipped++; continue; }
    const note = (iDesc >= 0 ? r[iDesc] : '').replace(/\s+/g, ' ').slice(0, 120);
    const amountMinor = Math.round(Math.abs(amount) * 100);
    const ref = 'csv:' + createHash('sha1').update(`${day}|${note}|${amountMinor}`).digest('hex').slice(0, 24);
    rows.push({ day, note, amountMinor, category: guessCategory(note), ref });
  }
  return { rows, skipped };
}
