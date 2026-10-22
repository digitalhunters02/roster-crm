// Recursos de Roster que vencem a concorrência (por plano; a fonte é FEATURE_MIN_PLAN em planConfig.js):
//   Essential e acima: página pública de vagas com candidatura que cai direto no funil, margem por cliente, link para o cliente
//   aprovar ou recusar as horas (junto com o portal do cliente: a decisão aparece nos mesmos selos "Client approved/disputed")
//   Complete: exportação CSV de horas e margem (a leitura de currículo por IA está em POST /api/candidates/parse-resume)
import crypto from 'node:crypto';
import { get, all, run } from './db.js';
import * as billing from './billing.js';
import { emit as emitWebhook } from './integrations.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Limitador simples por IP (em memória): candidatura e aprovação são públicas.
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'x';
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'rate_limited' });
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}
const applyLimiter = limiter(8, 60 * 60 * 1000);
const approveLimiter = limiter(30, 60 * 60 * 1000);

const featureOn = async (feature) => billing.allowsFeature(await billing.realPlan(), feature);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const csvCell = (v) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita fórmula ao abrir no Excel
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// ---------------------------------------------------------------- públicas
export function mountRosterPublic(app) {
  app.get('/api/public/careers', ar(async (_req, res) => {
    if (!(await featureOn('careers'))) return res.status(404).json({ error: 'Not available on this plan.', code: 'plan_required' });
    const jobs = await all(`SELECT j.id, j.title, j.employment_type, j.pay_range, j.location, j.opened_date, c.industry
      FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.status = 'Open' ORDER BY j.opened_date DESC, j.id DESC LIMIT 200`);
    res.json({ company: process.env.COMPANY_NAME || null, jobs });
  }));

  app.post('/api/public/careers/:id/apply', applyLimiter, ar(async (req, res) => {
    if (!(await featureOn('careers'))) return res.status(404).json({ error: 'Not available on this plan.', code: 'plan_required' });
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // isca para robôs: campo escondido preenchido
    const job = await get(`SELECT id, owner_user_id, status FROM jobs WHERE id = ?`, Number(req.params.id) || 0);
    if (!job || job.status !== 'Open') return res.status(404).json({ error: 'This job is no longer open.' });
    const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30);
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    const today = new Date().toISOString().slice(0, 10);
    let cand = await get(`SELECT id FROM candidates WHERE lower(email) = ?`, email);
    if (!cand) {
      const ins = await run(
        `INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, resume_summary, source, owner_user_id, created_at)
         VALUES (?, ?, ?, '', '', '', ?, 'Careers page', ?, ?) RETURNING id`,
        [name, email, phone, clean(b.message, 1000) || null, job.owner_user_id, today]
      );
      cand = ins.rows[0];
      emitWebhook('candidate.created', { id: cand.id, name, email, phone, source: 'Careers page', created_at: today });
    }
    const dup = await get(`SELECT id FROM submissions WHERE candidate_id = ? AND job_id = ?`, [cand.id, job.id]);
    if (!dup) {
      await run(`INSERT INTO submissions (candidate_id, job_id, stage, owner_user_id, submitted_date, notes) VALUES (?, ?, 'Sourced', ?, ?, ?)`,
        [cand.id, job.id, job.owner_user_id, today, 'Applied on the careers page']);
      emitWebhook('submission.stage_changed', { candidate_id: cand.id, job_id: job.id, stage: 'Sourced', previous_stage: null, submitted_date: today });
    }
    res.status(201).json({ ok: true });
  }));

  // Cliente aprova (ou recusa) as horas pelo link, sem login.
  app.get('/api/public/approval/:token', approveLimiter, ar(async (req, res) => {
    if (!(await featureOn('hours_portal'))) return res.status(404).json({ error: 'Not available on this plan.', code: 'plan_required' });
    const t = await timesheetByToken(req.params.token);
    if (!t) return res.status(404).json({ error: 'This approval link is not valid.' });
    res.json({ candidate: t.candidate_name, client: t.client_name, job: t.job_title, period_start: t.period_start, period_end: t.period_end, hours: t.hours, decision: decisionOf(t), decided_at: t.approved_at || t.client_approved_at });
  }));
  app.post('/api/public/approval/:token', approveLimiter, ar(async (req, res) => {
    if (!(await featureOn('hours_portal'))) return res.status(404).json({ error: 'Not available on this plan.', code: 'plan_required' });
    const t = await timesheetByToken(req.params.token);
    if (!t) return res.status(404).json({ error: 'This approval link is not valid.' });
    if (decisionOf(t)) return res.status(409).json({ error: 'This timesheet was already answered.', code: 'already_decided' });
    const name = clean(req.body?.name, 80);
    const decision = req.body?.decision === 'rejected' ? 'rejected' : req.body?.decision === 'approved' ? 'approved' : null;
    if (!decision) return res.status(400).json({ error: 'Choose approve or reject.' });
    if (name.length < 2) return res.status(400).json({ error: 'Please type your name.' });
    const note = clean(req.body?.note, 500) || null;
    // Grava a decisão nos campos do link (approval_*) E nos do portal do cliente (client_*): a tela de horas mostra os mesmos selos nos dois caminhos.
    await run(`UPDATE timesheets_invoices SET approval_decision = ?, approved_at = ?, approved_by = ?, approval_note = ?,
        client_approved_at = CASE WHEN ? = 'approved' THEN now() ELSE NULL END,
        client_approved_by = CASE WHEN ? = 'approved' THEN ? ELSE NULL END,
        client_dispute_note = CASE WHEN ? = 'approved' THEN NULL ELSE ? END,
        status = CASE WHEN ? = 'approved' AND status = 'Draft' THEN 'Sent' ELSE status END WHERE id = ?`,
      [decision, new Date().toISOString(), name, note, decision, decision, name, decision, note || 'Rejected from the approval link', decision, t.id]);
    res.json({ ok: true, decision });
  }));
}

// Já respondida pelo link ou pelo portal do cliente (aprovação). Recusa pelo portal não fecha: o cliente pode aprovar depois.
const decisionOf = (t) => t.approval_decision || (t.client_approved_at ? 'approved' : null);

async function timesheetByToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  return get(`SELECT t.*, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title
    FROM timesheets_invoices t JOIN placements p ON p.id = t.placement_id JOIN candidates cd ON cd.id = p.candidate_id
    JOIN clients c ON c.id = p.client_id JOIN jobs j ON j.id = p.job_id WHERE t.approval_token = ?`, token);
}

// ------------------------------------------------------- depois do login
const MARGIN_SQL = `SELECT t.id, t.period_start, t.period_end, t.hours, t.amount, t.status,
    COALESCE(t.approval_decision, CASE WHEN t.client_approved_at IS NOT NULL THEN 'approved' WHEN t.client_dispute_note IS NOT NULL THEN 'rejected' END) AS approval_decision,
    p.pay_rate, p.bill_rate, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title
  FROM timesheets_invoices t JOIN placements p ON p.id = t.placement_id JOIN candidates cd ON cd.id = p.candidate_id
  JOIN clients c ON c.id = p.client_id JOIN jobs j ON j.id = p.job_id`;

async function marginRows(from, to) {
  const rows = await all(`${MARGIN_SQL} WHERE (?::text IS NULL OR t.period_end >= ?) AND (?::text IS NULL OR t.period_start <= ?) ORDER BY t.period_end DESC`, [from || null, from || null, to || null, to || null]);
  return rows.map((r) => {
    const cost = Math.round(r.hours * r.pay_rate * 100) / 100;
    const margin = Math.round((r.amount - cost) * 100) / 100;
    return { ...r, cost, margin, margin_pct: r.amount > 0 ? Math.round((margin / r.amount) * 1000) / 10 : 0 };
  });
}

export function mountRosterPro(app) {
  const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

  app.get('/api/timesheets/margin', ar(async (req, res) => {
    const rows = await marginRows(dateOrNull(req.query.from), dateOrNull(req.query.to));
    const sum = (k) => Math.round(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) * 100) / 100;
    const byClient = new Map();
    for (const r of rows) {
      const c = byClient.get(r.client_name) || { client: r.client_name, hours: 0, billed: 0, cost: 0, margin: 0 };
      c.hours += r.hours; c.billed += r.amount; c.cost += r.cost; c.margin += r.margin; byClient.set(r.client_name, c);
    }
    const totals = { hours: sum('hours'), billed: sum('amount'), cost: sum('cost'), margin: sum('margin') };
    totals.margin_pct = totals.billed > 0 ? Math.round((totals.margin / totals.billed) * 1000) / 10 : 0;
    res.json({ totals, byClient: [...byClient.values()].map((c) => ({ ...c, hours: Math.round(c.hours * 100) / 100, billed: Math.round(c.billed * 100) / 100, cost: Math.round(c.cost * 100) / 100, margin: Math.round(c.margin * 100) / 100 })).sort((a, b) => b.margin - a.margin), rows });
  }));

  app.get('/api/timesheets/export', ar(async (req, res) => {
    const rows = await marginRows(dateOrNull(req.query.from), dateOrNull(req.query.to));
    const head = ['Candidate', 'Client', 'Job', 'Period start', 'Period end', 'Hours', 'Pay rate', 'Bill rate', 'Pay cost', 'Billed', 'Margin', 'Margin %', 'Status', 'Client approval'];
    const lines = [head, ...rows.map((r) => [r.candidate_name, r.client_name, r.job_title, r.period_start, r.period_end, r.hours, r.pay_rate, r.bill_rate, r.cost, r.amount, r.margin, r.margin_pct, r.status, r.approval_decision || ''])];
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="roster-hours.csv"');
    res.send(lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n');
  }));

  // Cria (ou renova) o link para o cliente aprovar as horas.
  app.post('/api/timesheets/:id/approval-link', billing.requirePlan('hours_portal'), ar(async (req, res) => {
    const t = await get(`SELECT id FROM timesheets_invoices WHERE id = ?`, Number(req.params.id) || 0);
    if (!t) return res.status(404).json({ error: 'not found' });
    const token = crypto.randomBytes(24).toString('base64url');
    await run(`UPDATE timesheets_invoices SET approval_token = ?, approval_decision = NULL, approved_at = NULL, approved_by = NULL, approval_note = NULL WHERE id = ?`, [token, t.id]);
    const base = (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');
    res.json({ token, url: `${base}/#/approve/${token}` });
  }));
}
