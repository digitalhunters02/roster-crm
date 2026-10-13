// The demo / free-trial instance runs on sample data (the made-up "Crestline Talent Partners" agency). Its dates were
// written for 15 Sep 2026; this keeps them moving with the calendar so "this week" and "last 30 days" on the Dashboard
// are never empty on the demo. It only touches an instance that really holds the sample data (the Northwind sample client).
import { get, run } from './db.js';

const SAMPLE_ANCHOR = '2026-09-15';
const dayOnly = (d = new Date()) => d.toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

// [table, column, plain 'YYYY-MM-DD' text?]  false = starts with a date and keeps the rest (time of day)
const DATE_COLUMNS = [
  ['jobs', 'opened_date', true], ['candidates', 'created_at', true], ['submissions', 'submitted_date', true],
  ['placements', 'start_date', true], ['placements', 'end_date', true],
  ['timesheets_invoices', 'period_start', true], ['timesheets_invoices', 'period_end', true],
  ['interviews', 'scheduled_at', false], ['activities', 'occurred_at', false],
];

export async function shiftSampleDates(days) {
  if (!days) return;
  for (const [table, col, plain] of DATE_COLUMNS) {
    const expr = plain
      ? `to_char(${col}::date + $1::int, 'YYYY-MM-DD')`
      : `to_char(substr(${col}, 1, 10)::date + $1::int, 'YYYY-MM-DD') || substr(${col}, 11)`;
    await run(`UPDATE ${table} SET ${col} = ${expr} WHERE ${col} ~ '^\\d{4}-\\d{2}-\\d{2}'`, [days]);
  }
}

export async function rollSampleDates() {
  const isSample = await get(`SELECT 1 FROM clients WHERE company_name = 'Northwind Analytics' LIMIT 1`);
  if (!isSample) return 0;
  const row = await get(`SELECT value FROM app_meta WHERE key = 'sample_anchor'`);
  const anchor = row?.value || SAMPLE_ANCHOR;
  const days = diffDays(dayOnly(), anchor);
  if (days < 1) {
    if (!row) await run(`INSERT INTO app_meta (key, value) VALUES ('sample_anchor', $1) ON CONFLICT DO NOTHING`, [anchor]);
    return 0;
  }
  await shiftSampleDates(days);
  await run(`INSERT INTO app_meta (key, value) VALUES ('sample_anchor', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [dayOnly()]);
  return days;
}
