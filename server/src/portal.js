// Client portal: the agency's client opens a private link (no login) to see the candidates submitted to them,
// say "interested" / "pass", approve or dispute timesheets and open invoices. Essential plan and up.
// The link is a random token the agency can rotate or switch off at any time. The page never shows a
// candidate's e-mail, phone or current employer.
import crypto from 'node:crypto';
import { get, all, run } from './db.js';
import { effectivePlan, allowsFeature } from './billing.js';
import { makeLimiter } from './auth.js';
import { readProfile } from './profile.js';

export const PORTAL_STAGES = ['Submitted to Client', 'Client Interview', 'Offer'];
export const INVOICE_TERMS_DAYS = 15; // same window the "timesheet overdue" rule uses

const newToken = () => crypto.randomBytes(24).toString('base64url');
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const invoiceNumber = (id) => `INV-${String(id).padStart(4, '0')}`;

function addDays(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Everything an invoice page needs (the same JSON feeds the print view and the client portal).
export async function buildInvoice(timesheetId, clientId = null) {
  const t = await get(`
    SELECT t.*, p.bill_rate, p.client_id, cd.name AS candidate_name, j.title AS job_title,
      c.company_name, c.contact_name, c.contact_email, c.address AS client_address
    FROM timesheets_invoices t
    JOIN placements p ON p.id = t.placement_id
    JOIN candidates cd ON cd.id = p.candidate_id
    JOIN clients c ON c.id = p.client_id
    JOIN jobs j ON j.id = p.job_id
    WHERE t.id = $1`, [timesheetId]);
  if (!t || (clientId !== null && Number(t.client_id) !== Number(clientId))) return null;
  const a = await readProfile();
  const issue = t.invoice_sent_at ? new Date(t.invoice_sent_at).toISOString().slice(0, 10) : String(t.period_end).slice(0, 10);
  return {
    id: t.id,
    number: invoiceNumber(t.id),
    status: t.status,
    issue_date: issue,
    due_date: addDays(issue, INVOICE_TERMS_DAYS),
    terms_days: INVOICE_TERMS_DAYS,
    period_start: t.period_start,
    period_end: t.period_end,
    agency: { name: a.name, address: a.address, phone: a.phone, email: a.email, logo: a.logo },
    client: { company_name: t.company_name, contact_name: t.contact_name, contact_email: t.contact_email, address: t.client_address },
    line: { description: `${t.job_title} - ${t.candidate_name}`, hours: Number(t.hours) || 0, rate: money(t.bill_rate), amount: money(t.amount) },
    total: money(t.amount),
    payment_url: a.payment_url || '',
    payment_note: a.payment_note || '',
    client_approved_at: t.client_approved_at,
    client_approved_by: t.client_approved_by,
    client_dispute_note: t.client_dispute_note,
  };
}

async function portalClient(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 80) return null;
  const c = await get(`SELECT id, company_name, contact_name, owner_user_id FROM clients WHERE portal_token = $1 AND portal_enabled = TRUE`, [token]);
  if (!c) return null;
  if (!allowsFeature(await effectivePlan(), 'portal')) return null; // plan dropped: the link goes quiet
  return c;
}

async function logActivity(client, subject, notes, ownerUserId) {
  const owner = ownerUserId || client.owner_user_id;
  await run(`INSERT INTO activities (type, subject, related_type, related_id, owner_user_id, occurred_at, notes) VALUES ('Portal', $1, 'client', $2, $3, $4, $5)`,
    [subject, client.id, owner, new Date().toISOString(), notes || null]);
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

export function mountPortalPublic(app, ar) {
  const reads = makeLimiter({ windowMs: 60_000, max: 90 });
  const writes = makeLimiter({ windowMs: 60_000, max: 20 });
  const limit = (lim, key) => (req, res, next) => {
    const k = `${key}:${req.ip}`;
    const wait = lim.blockedFor(k);
    if (wait) { res.set('Retry-After', String(wait)); return res.status(429).json({ error: 'Too many requests. Try again in a moment.', code: 'rate_limited' }); }
    lim.hit(k);
    next();
  };
  const gone = (res) => res.status(404).json({ error: 'This link is not active. Ask your recruiter for a new one.', code: 'portal_unavailable' });

  app.get('/api/portal/:token', limit(reads, 'pr'), ar(async (req, res) => {
    const c = await portalClient(req.params.token);
    if (!c) return gone(res);
    const a = await readProfile();
    const candidates = await all(`
      SELECT s.id AS submission_id, s.stage, s.submitted_date, j.title AS job_title,
        cd.name, cd.current_title, cd.skills, cd.resume_summary,
        (SELECT f.decision FROM portal_feedback f WHERE f.submission_id = s.id ORDER BY f.id DESC LIMIT 1) AS decision,
        (SELECT f.note FROM portal_feedback f WHERE f.submission_id = s.id ORDER BY f.id DESC LIMIT 1) AS decision_note
      FROM submissions s
      JOIN jobs j ON j.id = s.job_id
      JOIN candidates cd ON cd.id = s.candidate_id
      WHERE j.client_id = $1 AND s.stage = ANY($2)
      ORDER BY s.submitted_date DESC, s.id DESC`, [c.id, PORTAL_STAGES]);
    const timesheets = await all(`
      SELECT t.id, t.period_start, t.period_end, t.hours, t.amount, t.status, t.client_approved_at, t.client_approved_by, t.client_dispute_note,
        cd.name AS candidate_name, j.title AS job_title
      FROM timesheets_invoices t
      JOIN placements p ON p.id = t.placement_id
      JOIN candidates cd ON cd.id = p.candidate_id
      JOIN jobs j ON j.id = p.job_id
      WHERE p.client_id = $1 AND t.status <> 'Draft'
      ORDER BY t.period_end DESC, t.id DESC`, [c.id]);
    res.json({
      client: { company_name: c.company_name, contact_name: c.contact_name },
      agency: { name: a.name, email: a.email, phone: a.phone, logo: a.logo },
      candidates,
      timesheets: timesheets.map((t) => ({ ...t, number: invoiceNumber(t.id), hours: Number(t.hours), amount: money(t.amount) })),
    });
  }));

  app.post('/api/portal/:token/feedback', limit(writes, 'pw'), ar(async (req, res) => {
    const c = await portalClient(req.params.token);
    if (!c) return gone(res);
    const decision = req.body?.decision;
    if (!['interested', 'pass'].includes(decision)) return res.status(400).json({ error: 'Choose "Interested" or "Pass".', code: 'invalid_decision' });
    const sub = await get(`SELECT s.id, s.owner_user_id, cd.name FROM submissions s JOIN jobs j ON j.id = s.job_id JOIN candidates cd ON cd.id = s.candidate_id
      WHERE s.id = $1 AND j.client_id = $2 AND s.stage = ANY($3)`, [Number(req.body?.submission_id) || 0, c.id, PORTAL_STAGES]);
    if (!sub) return res.status(404).json({ error: 'Candidate not found.', code: 'not_found' });
    const note = clean(req.body?.note, 500);
    const by = clean(req.body?.by_name, 80) || c.contact_name;
    await run(`INSERT INTO portal_feedback (submission_id, decision, note, by_name) VALUES ($1, $2, $3, $4)`, [sub.id, decision, note || null, by]);
    await logActivity(c, `${c.company_name} ${decision === 'interested' ? 'is interested in' : 'passed on'} ${sub.name}`, [by && `By ${by}`, note].filter(Boolean).join(' - '), sub.owner_user_id);
    res.json({ ok: true, decision });
  }));

  async function timesheetFor(c, id) {
    return get(`SELECT t.* FROM timesheets_invoices t JOIN placements p ON p.id = t.placement_id WHERE t.id = $1 AND p.client_id = $2 AND t.status <> 'Draft'`, [Number(id) || 0, c.id]);
  }

  app.post('/api/portal/:token/timesheets/:id/approve', limit(writes, 'pw'), ar(async (req, res) => {
    const c = await portalClient(req.params.token);
    if (!c) return gone(res);
    const t = await timesheetFor(c, req.params.id);
    if (!t) return res.status(404).json({ error: 'Timesheet not found.', code: 'not_found' });
    if (t.status === 'Paid') return res.status(409).json({ error: 'This invoice is already paid.', code: 'already_paid' });
    const by = clean(req.body?.by_name, 80);
    if (by.length < 2) return res.status(400).json({ error: 'Type your name to approve.', code: 'name_required' });
    await run(`UPDATE timesheets_invoices SET client_approved_at = now(), client_approved_by = $2, client_dispute_note = NULL WHERE id = $1`, [t.id, by]);
    await logActivity(c, `${c.company_name} approved ${invoiceNumber(t.id)}`, `By ${by}`);
    res.json({ ok: true });
  }));

  app.post('/api/portal/:token/timesheets/:id/dispute', limit(writes, 'pw'), ar(async (req, res) => {
    const c = await portalClient(req.params.token);
    if (!c) return gone(res);
    const t = await timesheetFor(c, req.params.id);
    if (!t) return res.status(404).json({ error: 'Timesheet not found.', code: 'not_found' });
    if (t.status === 'Paid') return res.status(409).json({ error: 'This invoice is already paid.', code: 'already_paid' });
    const note = clean(req.body?.note, 500);
    if (note.length < 3) return res.status(400).json({ error: 'Tell us what looks wrong.', code: 'note_required' });
    const by = clean(req.body?.by_name, 80) || c.contact_name;
    await run(`UPDATE timesheets_invoices SET client_dispute_note = $2, client_approved_at = NULL, client_approved_by = NULL WHERE id = $1`, [t.id, note]);
    await logActivity(c, `${c.company_name} disputed ${invoiceNumber(t.id)}`, [by && `By ${by}`, note].filter(Boolean).join(' - '));
    res.json({ ok: true });
  }));

  app.get('/api/portal/:token/invoices/:id', limit(reads, 'pr'), ar(async (req, res) => {
    const c = await portalClient(req.params.token);
    if (!c) return gone(res);
    const inv = await timesheetFor(c, req.params.id) && await buildInvoice(Number(req.params.id), c.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found.', code: 'not_found' });
    res.json(inv);
  }));
}

// Staff side (login + Essential plan are applied by the caller): switch the link on / rotate / off.
export function mountPortalStaff(app, ar, { requirePlan, blockDemo }) {
  const guard = [requirePlan('portal')];
  const read = async (id) => get(`SELECT id, company_name, portal_token, portal_enabled FROM clients WHERE id = $1`, [Number(id) || 0]);
  const shape = (c) => ({ enabled: !!(c.portal_enabled && c.portal_token), token: c.portal_enabled ? c.portal_token : null, path: c.portal_enabled && c.portal_token ? `/#/portal/${c.portal_token}` : null });

  app.get('/api/clients/:id/portal', ...guard, ar(async (req, res) => {
    const c = await read(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const feedback = await all(`
      SELECT f.id, f.decision, f.note, f.by_name, f.created_at, cd.name AS candidate_name, j.title AS job_title
      FROM portal_feedback f
      JOIN submissions s ON s.id = f.submission_id
      JOIN jobs j ON j.id = s.job_id
      JOIN candidates cd ON cd.id = s.candidate_id
      WHERE j.client_id = $1 ORDER BY f.id DESC LIMIT 20`, [c.id]);
    res.json({ ...shape(c), feedback });
  }));

  app.post('/api/clients/:id/portal/:action', blockDemo, ...guard, ar(async (req, res) => {
    const c = await read(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const act = req.params.action;
    if (act === 'enable') {
      if (!c.portal_token) await run(`UPDATE clients SET portal_token = $2, portal_enabled = TRUE WHERE id = $1`, [c.id, newToken()]);
      else await run(`UPDATE clients SET portal_enabled = TRUE WHERE id = $1`, [c.id]);
    } else if (act === 'rotate') {
      await run(`UPDATE clients SET portal_token = $2, portal_enabled = TRUE WHERE id = $1`, [c.id, newToken()]);
    } else if (act === 'disable') {
      await run(`UPDATE clients SET portal_enabled = FALSE WHERE id = $1`, [c.id]);
    } else return res.status(400).json({ error: 'Unknown action' });
    res.json(shape(await read(c.id)));
  }));
}
