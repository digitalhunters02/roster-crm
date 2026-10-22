// Complete-plan tools that need no outside service: documents with expiry dates (a reminder list), payroll hours export (CSV),
// suggested candidates for a job, offices, and the AI routes.
import { get, all, run } from './db.js';
import * as ai from './ai.js';

export const DOC_TYPES = ['I-9', 'W-4', 'Photo ID', 'Driver license', 'Certification', 'Background check', 'Drug screen', 'Other'];
export const DOC_STATUSES = ['Requested', 'Received', 'Verified'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s) => { if (!ISO.test(s || '')) return false; const d = new Date(`${s}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const STOP = new Set('a an and are as at be by for from in is it of on or the to with we you your our will can has have this that who any all'.split(' '));
const words = (s) => [...new Set(String(s || '').toLowerCase().split(/[^a-z0-9+#.]+/).map((w) => w.replace(/^[.]+|[.]+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w)))];

export function mountTools(app, ar, { requirePlan, blockDemo, requireOwner }) {
  // Each area asks for its own feature (planConfig.js FEATURE_MIN_PLAN), so the plan map has one place to change.
  const documents = requirePlan('documents'), payroll = requirePlan('payroll'), suggestions = requirePlan('suggestions'), offices = requirePlan('offices'), aiPlan = requirePlan('ai');

  // ---------------- documents with expiry (reminder list only) ----------------
  app.get('/api/documents/meta', ar(async (_req, res) => res.json({ types: DOC_TYPES, statuses: DOC_STATUSES })));

  app.get('/api/documents/expiring', documents, ar(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    res.json(await all(`SELECT d.*, c.name AS candidate_name FROM candidate_documents d JOIN candidates c ON c.id = d.candidate_id
      WHERE d.expires_on IS NOT NULL AND d.expires_on <= $1 ORDER BY d.expires_on, d.id LIMIT 200`, [limit]));
  }));

  app.get('/api/candidates/:id/documents', documents, ar(async (req, res) => {
    res.json(await all(`SELECT * FROM candidate_documents WHERE candidate_id = $1 ORDER BY id`, [Number(req.params.id) || 0]));
  }));

  function docInput(b) {
    const doc_type = DOC_TYPES.includes(b?.doc_type) ? b.doc_type : null;
    const status = DOC_STATUSES.includes(b?.status) ? b.status : 'Requested';
    const expires_on = b?.expires_on ? String(b.expires_on).slice(0, 10) : null;
    return { doc_type, status, expires_on, notes: String(b?.notes || '').trim().slice(0, 300) || null, bad: !doc_type ? 'Choose the document type.' : expires_on && !validDay(expires_on) ? 'The expiry date is not valid.' : '' };
  }
  app.post('/api/candidates/:id/documents', documents, blockDemo, ar(async (req, res) => {
    const cand = await get(`SELECT id FROM candidates WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!cand) return res.status(404).json({ error: 'not found' });
    const d = docInput(req.body);
    if (d.bad) return res.status(400).json({ error: d.bad, code: 'invalid_document' });
    const r = await run(`INSERT INTO candidate_documents (candidate_id, doc_type, status, expires_on, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [cand.id, d.doc_type, d.status, d.expires_on, d.notes]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/documents/:id', documents, blockDemo, ar(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const cur = await get(`SELECT * FROM candidate_documents WHERE id = $1`, [id]);
    if (!cur) return res.status(404).json({ error: 'not found' });
    const d = docInput({ ...cur, ...req.body });
    if (d.bad) return res.status(400).json({ error: d.bad, code: 'invalid_document' });
    const r = await run(`UPDATE candidate_documents SET doc_type = $2, status = $3, expires_on = $4, notes = $5 WHERE id = $1 RETURNING *`, [id, d.doc_type, d.status, d.expires_on, d.notes]);
    // a renewed date can warn again
    if (d.expires_on !== cur.expires_on) await run(`DELETE FROM automation_runs WHERE related_type = 'document' AND related_id = $1`, [id]);
    res.json(r.rows[0]);
  }));
  app.delete('/api/documents/:id', documents, blockDemo, ar(async (req, res) => {
    const r = await run(`DELETE FROM candidate_documents WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  }));

  // ---------------- payroll hours export (CSV) ----------------
  // Hours and gross pay (hours x pay rate) for the payroll provider. It is an export of numbers the agency typed:
  // Roster does not compute taxes, withholdings or overtime rules.
  app.get('/api/timesheets/payroll-export', payroll, ar(async (req, res) => {
    const from = validDay(req.query.from) ? req.query.from : '0000-01-01';
    const to = validDay(req.query.to) ? req.query.to : '9999-12-31';
    const rows = await all(`
      SELECT cd.name AS worker, cd.email, c.company_name AS client, j.title AS job, t.id, t.period_start, t.period_end, t.hours,
        p.pay_rate, ROUND((t.hours * p.pay_rate)::numeric, 2) AS gross_pay, p.bill_rate, t.amount AS billed, t.status
      FROM timesheets_invoices t JOIN placements p ON p.id = t.placement_id JOIN candidates cd ON cd.id = p.candidate_id
      JOIN clients c ON c.id = p.client_id JOIN jobs j ON j.id = p.job_id
      WHERE t.period_end >= $1 AND t.period_end <= $2 AND t.status <> 'Draft'
      ORDER BY cd.name, t.period_start, t.id`, [from, to]);
    const head = ['Worker', 'Email', 'Client', 'Job', 'Invoice', 'Period start', 'Period end', 'Hours', 'Pay rate', 'Gross pay (hours x rate)', 'Bill rate', 'Billed', 'Status'];
    const lines = [head, ...rows.map((r) => [r.worker, r.email, r.client, r.job, `INV-${String(r.id).padStart(4, '0')}`, r.period_start, r.period_end, r.hours, r.pay_rate, r.gross_pay, r.bill_rate, r.billed, r.status])];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="roster-payroll-hours.csv"` })
      .send('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n');
  }));

  // ---------------- suggested candidates for a job (keyword match, no AI cost) ----------------
  app.get('/api/jobs/:id/suggestions', suggestions, ar(async (req, res) => {
    const job = await get(`SELECT j.*, c.industry AS client_industry FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1`, [Number(req.params.id) || 0]);
    if (!job) return res.status(404).json({ error: 'not found' });
    const jobWords = words(`${job.title} ${job.title} ${job.notes || ''} ${job.location || ''}`);
    const cands = await all(`SELECT id, name, current_title, skills, resume_summary FROM candidates
      WHERE id NOT IN (SELECT candidate_id FROM submissions WHERE job_id = $1) AND id NOT IN (SELECT candidate_id FROM placements WHERE status = 'Active')`, [job.id]);
    const titleWords = new Set(words(job.title));
    const out = cands.map((c) => {
      const own = new Set([...words(c.current_title), ...words(c.skills), ...words(c.resume_summary)]);
      const hit = jobWords.filter((w) => own.has(w));
      const score = hit.length + hit.filter((w) => titleWords.has(w)).length; // title words count double
      return { id: c.id, name: c.name, current_title: c.current_title, skills: c.skills, matched: hit.slice(0, 8), score };
    }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10);
    res.json(out);
  }));

  // ---------------- offices ----------------
  app.get('/api/offices', ar(async (_req, res) => {
    res.json(await all(`SELECT o.*, (SELECT COUNT(*) FROM users u WHERE u.office_id = o.id) AS user_count,
      (SELECT COUNT(*) FROM jobs j WHERE j.office_id = o.id) AS job_count, (SELECT COUNT(*) FROM candidates c WHERE c.office_id = o.id) AS candidate_count,
      (SELECT COUNT(*) FROM clients c WHERE c.office_id = o.id) AS client_count FROM offices o ORDER BY o.name`));
  }));
  const officeInput = (b) => ({ name: String(b?.name || '').trim().slice(0, 80), city: String(b?.city || '').trim().slice(0, 80) || null });
  app.post('/api/offices', offices, requireOwner, ar(async (req, res) => {
    const o = officeInput(req.body);
    if (!o.name) return res.status(400).json({ error: 'Give the office a name.', code: 'name_required' });
    if (await get(`SELECT 1 FROM offices WHERE lower(name) = lower($1)`, [o.name])) return res.status(409).json({ error: 'There is already an office with that name.', code: 'duplicate' });
    const r = await run(`INSERT INTO offices (name, city) VALUES ($1, $2) RETURNING *`, [o.name, o.city]);
    res.status(201).json(r.rows[0]);
  }));
  app.put('/api/offices/:id', offices, requireOwner, ar(async (req, res) => {
    const o = officeInput(req.body);
    if (!o.name) return res.status(400).json({ error: 'Give the office a name.', code: 'name_required' });
    const r = await run(`UPDATE offices SET name = $2, city = $3 WHERE id = $1 RETURNING *`, [Number(req.params.id) || 0, o.name, o.city]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  }));
  app.delete('/api/offices/:id', offices, requireOwner, ar(async (req, res) => {
    const r = await run(`DELETE FROM offices WHERE id = $1`, [Number(req.params.id) || 0]); // records keep existing, just without an office
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  }));
  app.put('/api/users/:id/office', offices, requireOwner, ar(async (req, res) => {
    const officeId = req.body?.office_id ? Number(req.body.office_id) : null;
    if (officeId && !(await get(`SELECT 1 FROM offices WHERE id = $1`, [officeId]))) return res.status(400).json({ error: 'Office not found.', code: 'office_not_found' });
    const r = await run(`UPDATE users SET office_id = $2 WHERE id = $1 RETURNING id, office_id`, [Number(req.params.id) || 0, officeId]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  }));

  // ---------------- AI ----------------
  app.get('/api/ai/status', ar(async (_req, res) => res.json({ configured: ai.isConfigured(), ...(await ai.usage()) })));
  const aiGate = [aiPlan, blockDemo];
  const needAi = (_req, res, next) => (ai.isConfigured() ? next() : res.status(503).json({ error: 'The AI is not turned on on this server yet. Ask your administrator.', code: 'ai_not_configured' }));
  const aiFail = (res, e) => res.status(e.status || 502).json({ error: e.message, code: e.code || 'ai_failed' });

  app.post('/api/ai/candidate-summary', ...aiGate, needAi, ar(async (req, res) => {
    const c = req.body?.candidate_id ? await get(`SELECT * FROM candidates WHERE id = $1`, [Number(req.body.candidate_id) || 0]) : req.body?.fields;
    if (!c || !String(c.name || '').trim()) return res.status(400).json({ error: 'Choose a candidate with a name.', code: 'candidate_required' });
    try { res.json({ text: await ai.candidateSummary(c), ...(await ai.usage()) }); } catch (e) { aiFail(res, e); }
  }));
  app.post('/api/ai/job-description', ...aiGate, needAi, ar(async (req, res) => {
    const j = req.body?.job_id ? await get(`SELECT j.*, c.industry AS client_industry FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1`, [Number(req.body.job_id) || 0]) : req.body?.fields;
    if (!j || !String(j.title || '').trim()) return res.status(400).json({ error: 'Type the job title first.', code: 'title_required' });
    try { res.json({ text: await ai.jobDescription(j), ...(await ai.usage()) }); } catch (e) { aiFail(res, e); }
  }));
}
