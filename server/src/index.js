import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { get, all, run, initSchema } from './db.js';
import crypto from 'node:crypto';
import * as whatsapp from './whatsapp.js';
import { requireAuth, requireOwner, blockDemo, bootstrapOwner, backfillRecruiters } from './auth.js';
import { publicAuthRoutes, accountRoutes, demoTrialRoute } from './authRoutes.js';
import { mountAdminSummary } from './adminSummary.js';
import { publicBillingRoutes, billingRoutes, billingStatus } from './billingRoutes.js';
import { effectivePlan, getSubscription, requirePlan, enforceLimit, getAdminSummary } from './billing.js';
import * as automationEngine from './automationEngine.js';
import { startDemoTrialScheduler } from './demoTrial.js';
import { rollSampleDates } from './sampleData.js';
import { parseResumeText } from './resumeParse.js';
import { createPhotoImportRouter, initPhotoImportSchema, startPhotoBilling } from './photoImportRouter.js';
import { sendNoticeEmail, sendEmail, isMailConfigured } from './mailer.js';
import { PROFILE_FIELDS, profileLimit, readProfile, isHttpUrl } from './profile.js';
import { mountPortalPublic, mountPortalStaff, buildInvoice, invoiceNumber } from './portal.js';
import { mountMessaging, mountSmsWebhook } from './messaging.js';
import { mountSignatures, startSignaturePoller } from './signatures.js';
import { mountTools } from './tools.js';
import { mountPublicApi, mountIntegrationsAdmin, emit as emitWebhook } from './integrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
// Behind Coolify's proxy: use the real client IP (login rate limit) and scheme.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS_ORIGINS (comma separated) restricts cross-origin callers; unset keeps
// the previous open behaviour. The app is same-origin in production and uses
// bearer tokens (no cookies), so this is defence in depth.
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
// rawBody is kept so the WhatsApp webhook signature can be verified.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

const PORT = process.env.PORT || 4350;

const ar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ==================== PUBLIC routes (no login) ====================
// Everything registered before `app.use('/api', requireAuth)` below is
// public. Keep this list short and intentional:
//   GET  /api/health                              uptime / Coolify check
//   POST /api/auth/login | forgot | reset         sign-in flow (rate limited)
//   GET/POST /api/integrations/whatsapp/webhook   Meta calls these directly
app.get('/api/health', ar(async (_req, res) => {
  await get('SELECT 1');
  res.json({ status: 'ok' });
}));

publicAuthRoutes(app, ar);
demoTrialRoute(app, ar);
publicBillingRoutes(app, ar);

// Client portal (private link, no login) and the SMS reply webhook Twilio calls. Both guard themselves (token / signature).
mountPortalPublic(app, ar);
mountSmsWebhook(app, ar);
// Public API with API keys (Complete plan): the key is the login.
mountPublicApi(app, ar);

// Machine-to-machine: Harbor reads this with X-Admin-Key (see adminSummary.js).
mountAdminSummary(app, ar, get, getAdminSummary);

// -------------------- WhatsApp webhook (public) --------------------
// Meta calls these directly (webhook verification handshake, then message
// delivery), so they can't carry our bearer token. GET is guarded by the
// verify token; POST is optionally guarded by Meta's X-Hub-Signature-256 when
// WHATSAPP_APP_SECRET is set (unset = accepted as before).
app.get('/api/integrations/whatsapp/webhook', ar(async (req, res) => {
  const conn = await whatsapp.getConnection();
  const challenge = whatsapp.verifyWebhook(req.query, conn?.verify_token);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
}));

app.post('/api/integrations/whatsapp/webhook', ar(async (req, res) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    const got = String(req.headers['x-hub-signature-256'] || '');
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(403);
  }
  await whatsapp.handleWebhookEvent(req.body);
  res.sendStatus(200);
}));

// ==================== everything below requires a login ====================
app.use('/api', requireAuth);

// "Importar de foto" (AI reads a photo/print, the person reviews before saving) + extra use by credits.
app.use('/api/photo-import', blockDemo);
app.use('/api/photo-import', createPhotoImportRouter({
  pool, requireAuth, requireAdmin: requireOwner, effectivePlan, getSubscription,
  planLimits: { basico: 0, essencial: 100, completo: 500 },
  kindsOpts: { contactTypes: ['business'], disableKinds: ['leads', 'expense'], clientsPage: 'clients' },
  adminWhere: "role = 'owner'", isAdmin: (a) => a?.role === 'owner',
  appName: 'Roster', sendNotice: sendNoticeEmail,
}));
billingRoutes(app, ar);

// ---------- plan gates and limits (see billing.js: PLAN_LIMITS / FEATURE_MIN_PLAN) ----------
// Timesheets & invoices and the WhatsApp inbox start at the Essential plan; the Basic plan has limits on
// users, candidates, open jobs and active automations. Without Stripe (or on Impact Digital's own demo) nothing is locked.
app.use('/api/timesheets', requirePlan('essencial'));
app.use(['/api/integrations/whatsapp/connect', '/api/integrations/whatsapp/conversations'], requirePlan('essencial'));
app.post('/api/integrations/whatsapp/send', blockDemo, requirePlan('essencial'));
app.use(['/api/message-templates', '/api/integrations/sms/connect', '/api/integrations/sms/disconnect'], requirePlan('essencial'));
app.use('/api/candidates/:id/messages', requirePlan('essencial'));
const countOf = (sql) => async () => Number((await get(sql)).n) || 0;
app.post('/api/accounts', enforceLimit('users', countOf(`SELECT COUNT(*) AS n FROM accounts WHERE is_demo_trial = FALSE`)));
app.post('/api/candidates', enforceLimit('candidates', countOf(`SELECT COUNT(*) AS n FROM candidates`)));
const openJobsLimit = enforceLimit('openJobs', countOf(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'Open'`));
app.post('/api/jobs', (req, res, next) => ((req.body?.status ?? 'Open') === 'Open' ? openJobsLimit(req, res, next) : next()));
const automationsLimit = enforceLimit('automations', countOf(`SELECT COUNT(*) AS n FROM automations WHERE active = 1`));
app.post('/api/automations', (req, res, next) => (req.body?.active === false ? next() : automationsLimit(req, res, next)));
app.patch('/api/automations/:id/active', (req, res, next) => (req.body?.active ? automationsLimit(req, res, next) : next()));
accountRoutes(app, ar);

// -------------------- agency profile (name, contact, logo): stored on the server, one per installation --------------------
app.get('/api/company-profile', ar(async (_req, res) => res.json(await readProfile())));
app.put('/api/company-profile', requireOwner, ar(async (req, res) => {
  const b = req.body || {};
  const cur = await readProfile();
  const next = { ...cur };
  for (const f of PROFILE_FIELDS) if (typeof b[f] === 'string') next[f] = b[f].trim().slice(0, profileLimit(f));
  if (next.payment_url && !isHttpUrl(next.payment_url)) {
    return res.status(400).json({ error: 'The payment link must start with https://', code: 'invalid_payment_url' });
  }
  if (typeof b.logo === 'string') {
    if (b.logo !== '' && !(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo) && b.logo.length <= 400_000)) {
      return res.status(400).json({ error: 'The logo must be a PNG, JPEG or WebP image under 300 KB.', code: 'invalid_logo' });
    }
    next.logo = b.logo;
  }
  await run(`INSERT INTO app_meta (key, value) VALUES ('company_profile', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(next)]);
  res.json(next);
}));

// -------------------- helpers --------------------
function missingField(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') return f;
  }
  return null;
}

async function rowExists(table, id) {
  if (id === undefined || id === null || id === '') return false;
  return !!(await get(`SELECT 1 FROM ${table} WHERE id = ?`, id));
}

async function countWhere(table, column, id) {
  return (await get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, id)).n;
}

// Optional office on clients, jobs and candidates (Complete plan creates the offices). Absent = keep what is there.
async function officeFrom(body, current) {
  if (body?.office_id === undefined) return { value: current ?? null };
  if (body.office_id === null || body.office_id === '') return { value: null };
  if (!(await rowExists('offices', body.office_id))) return { error: 'office_id does not reference a real office' };
  return { value: Number(body.office_id) };
}

// -------------------- users (read-only; Team card on Settings) --------------------
app.get('/api/users', ar(async (req, res) => {
  res.json(await all(`SELECT * FROM users ORDER BY name`));
}));

// -------------------- clients --------------------
const CLIENT_SELECT = `
  SELECT c.*, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color,
    (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.status = 'Open') AS open_job_count,
    (SELECT COUNT(*) FROM placements p WHERE p.client_id = c.id) AS placement_count
  FROM clients c
  JOIN users u ON u.id = c.owner_user_id
`;
async function clientRow(id) {
  return get(`${CLIENT_SELECT} WHERE c.id = ?`, id);
}

app.get('/api/clients', ar(async (req, res) => {
  res.json(await all(`${CLIENT_SELECT} ORDER BY c.company_name`));
}));

app.post('/api/clients', ar(async (req, res) => {
  const b = { ...(req.body || {}), industry: req.body?.industry || '', contact_name: req.body?.contact_name || '', contact_email: req.body?.contact_email || '', contact_phone: req.body?.contact_phone || '', address: req.body?.address || '', status: req.body?.status || 'Active', owner_user_id: req.body?.owner_user_id || req.account?.user_id || null };
  const missing = missingField(b, ['company_name', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const office = await officeFrom(b, null);
  if (office.error) return res.status(400).json({ error: office.error });
  const info = await run(`
    INSERT INTO clients (company_name, industry, contact_name, contact_email, contact_phone, address, owner_user_id, status, notes, office_id)
    VALUES (@company_name, @industry, @contact_name, @contact_email, @contact_phone, @address, @owner_user_id, @status, @notes, @office_id) RETURNING id
  `, {
    office_id: office.value, company_name: b.company_name, industry: b.industry, contact_name: b.contact_name, contact_email: b.contact_email,
    contact_phone: b.contact_phone, address: b.address, owner_user_id: b.owner_user_id, status: b.status, notes: b.notes || null,
  });
  res.status(201).json(await clientRow(info.rows[0].id));
}));

app.put('/api/clients/:id', ar(async (req, res) => {
  const existing = await clientRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = { ...(req.body || {}), industry: req.body?.industry || '', contact_name: req.body?.contact_name || '', contact_email: req.body?.contact_email || '', contact_phone: req.body?.contact_phone || '', address: req.body?.address || '', status: req.body?.status || 'Active', owner_user_id: req.body?.owner_user_id || req.account?.user_id || null };
  const missing = missingField(b, ['company_name', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const office = await officeFrom(b, existing.office_id);
  if (office.error) return res.status(400).json({ error: office.error });
  await run(`
    UPDATE clients SET company_name = @company_name, industry = @industry, contact_name = @contact_name, contact_email = @contact_email,
      contact_phone = @contact_phone, address = @address, owner_user_id = @owner_user_id, status = @status, notes = @notes, office_id = @office_id
    WHERE id = @id
  `, {
    office_id: office.value, id: req.params.id, company_name: b.company_name, industry: b.industry, contact_name: b.contact_name, contact_email: b.contact_email,
    contact_phone: b.contact_phone, address: b.address, owner_user_id: b.owner_user_id, status: b.status, notes: b.notes || null,
  });
  res.json(await clientRow(req.params.id));
}));

app.delete('/api/clients/:id', ar(async (req, res) => {
  const existing = await clientRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['jobs', 'client_id', 'job'],
    ['placements', 'client_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = await countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this client.` });
  }
  await run(`DELETE FROM clients WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- jobs --------------------
const JOB_SELECT = `
  SELECT j.*, c.company_name AS client_name, c.industry AS client_industry,
    u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color,
    (SELECT COUNT(*) FROM submissions s WHERE s.job_id = j.id) AS submission_count
  FROM jobs j
  JOIN clients c ON c.id = j.client_id
  JOIN users u ON u.id = j.owner_user_id
`;
async function jobRow(id) {
  return get(`${JOB_SELECT} WHERE j.id = ?`, id);
}

app.get('/api/jobs', ar(async (req, res) => {
  res.json(await all(`${JOB_SELECT} ORDER BY j.opened_date DESC`));
}));

app.post('/api/jobs', ar(async (req, res) => {
  const b = { ...(req.body || {}), employment_type: req.body?.employment_type || 'Contract', pay_range: req.body?.pay_range || '', location: req.body?.location || '', status: req.body?.status || 'Open', owner_user_id: req.body?.owner_user_id || req.account?.user_id || null, opened_date: req.body?.opened_date || new Date().toISOString().slice(0, 10) };
  const missing = missingField(b, ['client_id', 'title', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('clients', b.client_id))) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const office = await officeFrom(b, null);
  if (office.error) return res.status(400).json({ error: office.error });
  const info = await run(`
    INSERT INTO jobs (client_id, title, employment_type, pay_range, location, status, owner_user_id, opened_date, notes, office_id)
    VALUES (@client_id, @title, @employment_type, @pay_range, @location, @status, @owner_user_id, @opened_date, @notes, @office_id) RETURNING id
  `, {
    office_id: office.value, client_id: b.client_id, title: b.title, employment_type: b.employment_type, pay_range: b.pay_range, location: b.location,
    status: b.status, owner_user_id: b.owner_user_id, opened_date: b.opened_date, notes: b.notes || null,
  });
  res.status(201).json(await jobRow(info.rows[0].id));
}));

app.put('/api/jobs/:id', ar(async (req, res) => {
  const existing = await jobRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = { ...(req.body || {}), employment_type: req.body?.employment_type || 'Contract', pay_range: req.body?.pay_range || '', location: req.body?.location || '', status: req.body?.status || 'Open', owner_user_id: req.body?.owner_user_id || req.account?.user_id || null, opened_date: req.body?.opened_date || new Date().toISOString().slice(0, 10) };
  const missing = missingField(b, ['client_id', 'title', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('clients', b.client_id))) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const office = await officeFrom(b, existing.office_id);
  if (office.error) return res.status(400).json({ error: office.error });
  await run(`
    UPDATE jobs SET client_id = @client_id, title = @title, employment_type = @employment_type, pay_range = @pay_range,
      location = @location, status = @status, owner_user_id = @owner_user_id, opened_date = @opened_date, notes = @notes, office_id = @office_id
    WHERE id = @id
  `, {
    office_id: office.value, id: req.params.id, client_id: b.client_id, title: b.title, employment_type: b.employment_type, pay_range: b.pay_range,
    location: b.location, status: b.status, owner_user_id: b.owner_user_id, opened_date: b.opened_date, notes: b.notes || null,
  });
  res.json(await jobRow(req.params.id));
}));

app.delete('/api/jobs/:id', ar(async (req, res) => {
  const existing = await jobRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['submissions', 'job_id', 'submission'],
    ['placements', 'job_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = await countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this job.` });
  }
  await run(`DELETE FROM jobs WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- candidates --------------------
const CANDIDATE_SELECT = `
  SELECT cd.*, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color,
    (SELECT COUNT(*) FROM submissions s WHERE s.candidate_id = cd.id) AS submission_count
  FROM candidates cd
  JOIN users u ON u.id = cd.owner_user_id
`;
async function candidateRow(id) {
  return get(`${CANDIDATE_SELECT} WHERE cd.id = ?`, id);
}

app.get('/api/candidates', ar(async (req, res) => {
  res.json(await all(`${CANDIDATE_SELECT} ORDER BY cd.created_at DESC`));
}));

// Resume text -> candidate fields (no AI, no cost). The recruiter reviews the result before saving.
app.post('/api/candidates/parse-resume', ar(async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (text.length < 20) return res.status(400).json({ error: 'Paste the resume text (at least a few lines).', code: 'resume_too_short' });
  res.json(parseResumeText(text));
}));

// A candidate only needs a name (hourly and field workers often have no title, employer or email).
function candidateDefaults(b, account) {
  return {
    ...b,
    email: b.email || '', phone: b.phone || '', current_title: b.current_title || '', current_employer: b.current_employer || '',
    skills: b.skills || '', source: b.source || 'Direct', owner_user_id: b.owner_user_id || account?.user_id || null,
  };
}

app.post('/api/candidates', ar(async (req, res) => {
  const b = candidateDefaults(req.body || {}, req.account);
  const missing = missingField(b, ['name', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const office = await officeFrom(b, null);
  if (office.error) return res.status(400).json({ error: office.error });
  const info = await run(`
    INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, resume_summary, source, owner_user_id, created_at, office_id)
    VALUES (@name, @email, @phone, @current_title, @current_employer, @skills, @resume_summary, @source, @owner_user_id, @created_at, @office_id) RETURNING id
  `, {
    office_id: office.value, name: b.name, email: b.email, phone: b.phone, current_title: b.current_title, current_employer: b.current_employer,
    skills: b.skills, resume_summary: b.resume_summary || null, source: b.source, owner_user_id: b.owner_user_id,
    created_at: b.created_at || new Date().toISOString().slice(0, 10),
  });
  if (b.source === 'Referral') {
    await automationEngine.fire('candidate_referral', { relatedType: 'candidate', relatedId: info.rows[0].id, ownerUserId: b.owner_user_id, subject: `New referral candidate: ${b.name}` });
  }
  const created = await candidateRow(info.rows[0].id);
  emitWebhook('candidate.created', created);
  res.status(201).json(created);
}));

app.put('/api/candidates/:id', ar(async (req, res) => {
  const existing = await candidateRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = candidateDefaults(req.body || {}, req.account);
  const missing = missingField(b, ['name', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const office = await officeFrom(b, existing.office_id);
  if (office.error) return res.status(400).json({ error: office.error });
  await run(`
    UPDATE candidates SET name = @name, email = @email, phone = @phone, current_title = @current_title, current_employer = @current_employer,
      skills = @skills, resume_summary = @resume_summary, source = @source, owner_user_id = @owner_user_id, office_id = @office_id
    WHERE id = @id
  `, {
    office_id: office.value, id: req.params.id, name: b.name, email: b.email, phone: b.phone, current_title: b.current_title, current_employer: b.current_employer,
    skills: b.skills, resume_summary: b.resume_summary || null, source: b.source, owner_user_id: b.owner_user_id,
  });
  res.json(await candidateRow(req.params.id));
}));

app.delete('/api/candidates/:id', ar(async (req, res) => {
  const existing = await candidateRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['submissions', 'candidate_id', 'submission'],
    ['placements', 'candidate_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = await countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this candidate.` });
  }
  await run(`DELETE FROM candidates WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- submissions --------------------
const SUBMISSION_SELECT = `
  SELECT s.*, cd.name AS candidate_name, cd.current_title AS candidate_title,
    j.title AS job_title, j.employment_type AS job_employment_type, c.company_name AS client_name,
    u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color
  FROM submissions s
  JOIN candidates cd ON cd.id = s.candidate_id
  JOIN jobs j ON j.id = s.job_id
  JOIN clients c ON c.id = j.client_id
  JOIN users u ON u.id = s.owner_user_id
`;
async function submissionRow(id) {
  return get(`${SUBMISSION_SELECT} WHERE s.id = ?`, id);
}
async function fireSubmitted(id) {
  const row = await submissionRow(id);
  if (!row) return;
  await automationEngine.fire('submission_submitted', { relatedType: 'submission', relatedId: row.id, ownerUserId: row.owner_user_id, subject: `${row.candidate_name} was submitted to ${row.client_name} for ${row.job_title}` });
}
const SUBMISSION_STAGES = ['Sourced', 'Screened', 'Submitted to Client', 'Client Interview', 'Offer', 'Placed', 'Rejected', 'Withdrawn'];

app.get('/api/submissions', ar(async (req, res) => {
  res.json(await all(`${SUBMISSION_SELECT} ORDER BY s.submitted_date DESC`));
}));

app.post('/api/submissions', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['candidate_id', 'job_id', 'stage', 'owner_user_id', 'submitted_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('candidates', b.candidate_id))) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!(await rowExists('jobs', b.job_id))) return res.status(400).json({ error: 'job_id does not reference a real job' });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });
  if (!SUBMISSION_STAGES.includes(b.stage)) return res.status(400).json({ error: 'invalid stage' });

  const info = await run(`
    INSERT INTO submissions (candidate_id, job_id, stage, owner_user_id, submitted_date, notes)
    VALUES (@candidate_id, @job_id, @stage, @owner_user_id, @submitted_date, @notes) RETURNING id
  `, {
    candidate_id: b.candidate_id, job_id: b.job_id, stage: b.stage, owner_user_id: b.owner_user_id,
    submitted_date: b.submitted_date, notes: b.notes || null,
  });
  if (b.stage === 'Submitted to Client') await fireSubmitted(info.rows[0].id);
  const made = await submissionRow(info.rows[0].id);
  emitWebhook('submission.stage_changed', { ...made, previous_stage: null });
  res.status(201).json(made);
}));

app.put('/api/submissions/:id', ar(async (req, res) => {
  const existing = await submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['candidate_id', 'job_id', 'stage', 'owner_user_id', 'submitted_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('candidates', b.candidate_id))) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!(await rowExists('jobs', b.job_id))) return res.status(400).json({ error: 'job_id does not reference a real job' });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });
  if (!SUBMISSION_STAGES.includes(b.stage)) return res.status(400).json({ error: 'invalid stage' });

  await run(`
    UPDATE submissions SET candidate_id = @candidate_id, job_id = @job_id, stage = @stage, owner_user_id = @owner_user_id,
      submitted_date = @submitted_date, notes = @notes
    WHERE id = @id
  `, {
    id: req.params.id, candidate_id: b.candidate_id, job_id: b.job_id, stage: b.stage, owner_user_id: b.owner_user_id,
    submitted_date: b.submitted_date, notes: b.notes || null,
  });
  if (b.stage === 'Submitted to Client' && existing.stage !== 'Submitted to Client') await fireSubmitted(req.params.id);
  const saved = await submissionRow(req.params.id);
  if (existing.stage !== b.stage) emitWebhook('submission.stage_changed', { ...saved, previous_stage: existing.stage });
  res.json(saved);
}));

app.patch('/api/submissions/:id/stage', ar(async (req, res) => {
  const existing = await submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { stage } = req.body || {};
  if (!SUBMISSION_STAGES.includes(stage)) return res.status(400).json({ error: 'invalid stage' });
  await run(`UPDATE submissions SET stage = ? WHERE id = ?`, stage, req.params.id);
  if (stage === 'Submitted to Client' && existing.stage !== 'Submitted to Client') await fireSubmitted(req.params.id);
  const moved = await submissionRow(req.params.id);
  if (existing.stage !== stage) emitWebhook('submission.stage_changed', { ...moved, previous_stage: existing.stage });
  res.json(moved);
}));

app.delete('/api/submissions/:id', ar(async (req, res) => {
  const existing = await submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['interviews', 'submission_id', 'interview'],
    ['placements', 'submission_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = await countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this submission.` });
  }
  await run(`DELETE FROM submissions WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- interviews --------------------
const INTERVIEW_SELECT = `
  SELECT i.*, cd.name AS candidate_name, j.title AS job_title, c.company_name AS client_name
  FROM interviews i
  JOIN submissions s ON s.id = i.submission_id
  JOIN candidates cd ON cd.id = s.candidate_id
  JOIN jobs j ON j.id = s.job_id
  JOIN clients c ON c.id = j.client_id
`;
async function interviewRow(id) {
  return get(`${INTERVIEW_SELECT} WHERE i.id = ?`, id);
}

app.get('/api/interviews', ar(async (req, res) => {
  res.json(await all(`${INTERVIEW_SELECT} ORDER BY i.scheduled_at DESC`));
}));

app.post('/api/interviews', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'interviewer_name', 'scheduled_at', 'type', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('submissions', b.submission_id))) return res.status(400).json({ error: 'submission_id does not reference a real submission' });

  const info = await run(`
    INSERT INTO interviews (submission_id, interviewer_name, scheduled_at, type, status, notes)
    VALUES (@submission_id, @interviewer_name, @scheduled_at, @type, @status, @notes) RETURNING id
  `, {
    submission_id: b.submission_id, interviewer_name: b.interviewer_name, scheduled_at: b.scheduled_at,
    type: b.type, status: b.status, notes: b.notes || null,
  });
  res.status(201).json(await interviewRow(info.rows[0].id));
}));

app.put('/api/interviews/:id', ar(async (req, res) => {
  const existing = await interviewRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'interviewer_name', 'scheduled_at', 'type', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('submissions', b.submission_id))) return res.status(400).json({ error: 'submission_id does not reference a real submission' });

  await run(`
    UPDATE interviews SET submission_id = @submission_id, interviewer_name = @interviewer_name, scheduled_at = @scheduled_at,
      type = @type, status = @status, notes = @notes
    WHERE id = @id
  `, {
    id: req.params.id, submission_id: b.submission_id, interviewer_name: b.interviewer_name, scheduled_at: b.scheduled_at,
    type: b.type, status: b.status, notes: b.notes || null,
  });
  if (b.status === 'Completed' && existing.status !== 'Completed') {
    const sub = await get(`SELECT owner_user_id FROM submissions WHERE id = ?`, b.submission_id);
    const who = await interviewRow(req.params.id);
    await automationEngine.fire('interview_completed', {
      relatedType: 'interview', relatedId: Number(req.params.id), ownerUserId: sub?.owner_user_id,
      subject: `Follow up with ${who.client_name} about ${who.candidate_name} (${who.job_title}) - interview finished`,
      occurredAt: new Date(Date.now() + 3 * 86400000).toISOString(), // the reminder is due in 3 days
    });
  }
  res.json(await interviewRow(req.params.id));
}));

app.delete('/api/interviews/:id', ar(async (req, res) => {
  const existing = await interviewRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  await run(`DELETE FROM interviews WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- placements --------------------
const PLACEMENT_SELECT = `
  SELECT p.*, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title, j.employment_type AS job_employment_type,
    (SELECT COUNT(*) FROM timesheets_invoices t WHERE t.placement_id = p.id) AS timesheet_count
  FROM placements p
  JOIN candidates cd ON cd.id = p.candidate_id
  JOIN clients c ON c.id = p.client_id
  JOIN jobs j ON j.id = p.job_id
`;
async function placementRow(id) {
  return get(`${PLACEMENT_SELECT} WHERE p.id = ?`, id);
}

app.get('/api/placements', ar(async (req, res) => {
  res.json(await all(`${PLACEMENT_SELECT} ORDER BY p.start_date DESC`));
}));

app.post('/api/placements', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'candidate_id', 'client_id', 'job_id', 'start_date', 'pay_rate', 'bill_rate', 'placement_fee', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('submissions', b.submission_id))) return res.status(400).json({ error: 'submission_id does not reference a real submission' });
  if (!(await rowExists('candidates', b.candidate_id))) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!(await rowExists('clients', b.client_id))) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!(await rowExists('jobs', b.job_id))) return res.status(400).json({ error: 'job_id does not reference a real job' });

  const info = await run(`
    INSERT INTO placements (submission_id, candidate_id, client_id, job_id, start_date, end_date, pay_rate, bill_rate, placement_fee, status)
    VALUES (@submission_id, @candidate_id, @client_id, @job_id, @start_date, @end_date, @pay_rate, @bill_rate, @placement_fee, @status) RETURNING id
  `, {
    submission_id: b.submission_id, candidate_id: b.candidate_id, client_id: b.client_id, job_id: b.job_id,
    start_date: b.start_date, end_date: b.end_date || null, pay_rate: Number(b.pay_rate) || 0,
    bill_rate: Number(b.bill_rate) || 0, placement_fee: Number(b.placement_fee) || 0, status: b.status,
  });
  const placed = await placementRow(info.rows[0].id);
  emitWebhook('placement.created', placed);
  res.status(201).json(placed);
}));

app.put('/api/placements/:id', ar(async (req, res) => {
  const existing = await placementRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'candidate_id', 'client_id', 'job_id', 'start_date', 'pay_rate', 'bill_rate', 'placement_fee', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('submissions', b.submission_id))) return res.status(400).json({ error: 'submission_id does not reference a real submission' });
  if (!(await rowExists('candidates', b.candidate_id))) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!(await rowExists('clients', b.client_id))) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!(await rowExists('jobs', b.job_id))) return res.status(400).json({ error: 'job_id does not reference a real job' });

  await run(`
    UPDATE placements SET submission_id = @submission_id, candidate_id = @candidate_id, client_id = @client_id, job_id = @job_id,
      start_date = @start_date, end_date = @end_date, pay_rate = @pay_rate, bill_rate = @bill_rate,
      placement_fee = @placement_fee, status = @status
    WHERE id = @id
  `, {
    id: req.params.id, submission_id: b.submission_id, candidate_id: b.candidate_id, client_id: b.client_id, job_id: b.job_id,
    start_date: b.start_date, end_date: b.end_date || null, pay_rate: Number(b.pay_rate) || 0,
    bill_rate: Number(b.bill_rate) || 0, placement_fee: Number(b.placement_fee) || 0, status: b.status,
  });
  res.json(await placementRow(req.params.id));
}));

app.delete('/api/placements/:id', ar(async (req, res) => {
  const existing = await placementRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const n = await countWhere('timesheets_invoices', 'placement_id', req.params.id);
  if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} timesheet${n === 1 ? '' : 's'}/invoice${n === 1 ? '' : 's'} still reference this placement.` });
  await run(`DELETE FROM placements WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- timesheets & invoicing --------------------
const TIMESHEET_SELECT = `
  SELECT t.*, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title,
    p.pay_rate, p.bill_rate, c.portal_enabled AS client_portal_enabled,
    ROUND((t.hours * p.pay_rate)::numeric, 2)::float8 AS cost,
    ROUND((t.amount - t.hours * p.pay_rate)::numeric, 2)::float8 AS margin
  FROM timesheets_invoices t
  JOIN placements p ON p.id = t.placement_id
  JOIN candidates cd ON cd.id = p.candidate_id
  JOIN clients c ON c.id = p.client_id
  JOIN jobs j ON j.id = p.job_id
`;
async function timesheetRow(id) {
  return get(`${TIMESHEET_SELECT} WHERE t.id = ?`, id);
}

app.get('/api/timesheets', ar(async (req, res) => {
  res.json(await all(`${TIMESHEET_SELECT} ORDER BY t.period_end DESC`));
}));

// The amount may be left blank: it becomes hours x the placement's bill rate.
async function timesheetAmount(b, placementId) {
  if (b.amount !== undefined && b.amount !== null && b.amount !== '') return Number(b.amount) || 0;
  const p = await get(`SELECT bill_rate FROM placements WHERE id = ?`, placementId);
  return Math.round((Number(b.hours) || 0) * (Number(p?.bill_rate) || 0) * 100) / 100;
}

app.post('/api/timesheets', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['placement_id', 'period_start', 'period_end', 'hours', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('placements', b.placement_id))) return res.status(400).json({ error: 'placement_id does not reference a real placement' });

  const info = await run(`
    INSERT INTO timesheets_invoices (placement_id, period_start, period_end, hours, amount, status)
    VALUES (@placement_id, @period_start, @period_end, @hours, @amount, @status) RETURNING id
  `, {
    placement_id: b.placement_id, period_start: b.period_start, period_end: b.period_end,
    hours: Number(b.hours) || 0, amount: await timesheetAmount(b, b.placement_id), status: b.status,
  });
  res.status(201).json(await timesheetRow(info.rows[0].id));
}));

app.put('/api/timesheets/:id', ar(async (req, res) => {
  const existing = await timesheetRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['placement_id', 'period_start', 'period_end', 'hours', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('placements', b.placement_id))) return res.status(400).json({ error: 'placement_id does not reference a real placement' });

  const amount = await timesheetAmount(b, b.placement_id);
  await run(`
    UPDATE timesheets_invoices SET placement_id = @placement_id, period_start = @period_start, period_end = @period_end,
      hours = @hours, amount = @amount, status = @status
    WHERE id = @id
  `, {
    id: req.params.id, placement_id: b.placement_id, period_start: b.period_start, period_end: b.period_end,
    hours: Number(b.hours) || 0, amount, status: b.status,
  });
  if (existing.status !== b.status) emitWebhook('timesheet.status_changed', { id: Number(req.params.id), previous_status: existing.status, status: b.status });
  // The client approved a different number: the approval no longer stands.
  if (Number(existing.hours) !== (Number(b.hours) || 0) || Number(existing.amount) !== amount) {
    await run(`UPDATE timesheets_invoices SET client_approved_at = NULL, client_approved_by = NULL WHERE id = ?`, req.params.id);
  }
  res.json(await timesheetRow(req.params.id));
}));

// Invoice data for the print page (INV-0001 style number, agency details, client, one line, total, due date, "Pay online" link).
app.get('/api/timesheets/:id/invoice', ar(async (req, res) => {
  const inv = await buildInvoice(Number(req.params.id) || 0);
  if (!inv) return res.status(404).json({ error: 'not found' });
  res.json(inv);
}));

// E-mails the invoice to the client's contact with their private portal link. Draft becomes Sent.
app.post('/api/timesheets/:id/send-invoice', blockDemo, ar(async (req, res) => {
  const t = await timesheetRow(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const client = await get(`SELECT c.* FROM clients c JOIN placements p ON p.client_id = c.id WHERE p.id = ?`, t.placement_id);
  if (!client.contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.contact_email)) return res.status(400).json({ error: 'This client has no valid contact e-mail. Add it on the Clients page.', code: 'no_contact_email' });
  if (!client.portal_enabled || !client.portal_token) return res.status(409).json({ error: 'Turn on the client portal for this client first (Clients page).', code: 'portal_disabled' });
  if (!isMailConfigured()) return res.status(503).json({ error: 'E-mail is not set up on this server yet. Ask your administrator.', code: 'email_not_configured' });
  const a = await readProfile();
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const link = `${base}/#/portal/${client.portal_token}`;
  const num = invoiceNumber(t.id);
  const text = [
    `Hello ${client.contact_name || ''},`.replace(' ,', ','),
    '',
    `${a.name || 'Your staffing partner'} sent you invoice ${num} for ${t.candidate_name} (${t.job_title}), period ${t.period_start} to ${t.period_end}: ${Number(t.hours)} hours, total $${Number(t.amount).toFixed(2)}.`,
    '',
    'You can review, approve and print it here:',
    link,
    ...(a.payment_url ? ['', `Pay online: ${a.payment_url}`] : []),
    ...(a.payment_note ? ['', a.payment_note] : []),
    '',
    a.name || '',
  ].join('\n');
  await sendEmail({ to: client.contact_email, subject: `Invoice ${num} from ${a.name || 'your staffing partner'}`, text, replyTo: a.email || req.account?.email, fromName: a.name });
  await run(`UPDATE timesheets_invoices SET invoice_sent_at = now(), status = CASE WHEN status = 'Draft' THEN 'Sent' ELSE status END WHERE id = ?`, t.id);
  const after = await timesheetRow(t.id);
  if (after.status !== t.status) emitWebhook('timesheet.status_changed', { id: t.id, previous_status: t.status, status: after.status });
  res.json(after);
}));

app.delete('/api/timesheets/:id', ar(async (req, res) => {
  const existing = await timesheetRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  await run(`DELETE FROM timesheets_invoices WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- activities (dashboard feed) --------------------
mountPortalStaff(app, ar, { requirePlan, blockDemo });
mountMessaging(app, ar, { requireOwner, blockDemo });
mountSignatures(app, ar, { requirePlan, blockDemo });
mountTools(app, ar, { requirePlan, blockDemo, requireOwner });
mountIntegrationsAdmin(app, ar, { requirePlan, requireOwner, blockDemo });

app.get('/api/activities', ar(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const rows = await all(`
    SELECT a.*, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color
    FROM activities a
    JOIN users u ON u.id = a.owner_user_id
    ORDER BY a.occurred_at DESC
    LIMIT ?
  `, limit);
  res.json(rows);
}));

// -------------------- automations --------------------
const AUTOMATION_SELECT = `
  SELECT a.*, (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id AND r.ran_at > now() - interval '30 days') AS runs_30d_real
  FROM automations a`;
const shapeAutomation = (r) => ({ ...r, runs_30d: r.runs_30d_real, runnable: !!r.trigger_type });

app.get('/api/automations/catalog', ar(async (req, res) => {
  res.json(Object.entries(automationEngine.TRIGGERS).map(([id, t]) => ({ id, ...t })));
}));

app.get('/api/automations', ar(async (req, res) => {
  res.json((await all(`${AUTOMATION_SELECT} ORDER BY a.name`)).map(shapeAutomation));
}));

app.post('/api/automations', ar(async (req, res) => {
  const b = req.body || {};
  const t = automationEngine.TRIGGERS[b.trigger_type];
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'name is required' });
  if (!t) return res.status(400).json({ error: 'Choose what starts this rule', code: 'invalid_trigger' });
  const info = await run(`
    INSERT INTO automations (name, trigger_desc, action_desc, active, runs_30d, trigger_type, action_type)
    VALUES (@name, @trigger_desc, @action_desc, @active, 0, @trigger_type, 'notify') RETURNING id
  `, { name: b.name.trim(), trigger_desc: t.desc, action_desc: t.action, active: b.active === false ? 0 : 1, trigger_type: b.trigger_type });
  res.status(201).json(shapeAutomation(await get(`${AUTOMATION_SELECT} WHERE a.id = ?`, info.rows[0].id)));
}));

app.patch('/api/automations/:id/active', ar(async (req, res) => {
  const existing = await get(`SELECT * FROM automations WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { active } = req.body || {};
  if (active && !existing.trigger_type) return res.status(400).json({ error: 'This old rule has no trigger and cannot run. Delete it and create it again.', code: 'rule_not_runnable' });
  await run(`UPDATE automations SET active = ? WHERE id = ?`, active ? 1 : 0, req.params.id);
  res.json(shapeAutomation(await get(`${AUTOMATION_SELECT} WHERE a.id = ?`, req.params.id)));
}));

// Run the daily checks now (job open 30+ days, overdue timesheets) instead of waiting for the hourly pass.
app.post('/api/automations/run-now', ar(async (req, res) => {
  res.json({ fired: await automationEngine.runScheduled() });
}));

app.delete('/api/automations/:id', ar(async (req, res) => {
  const existing = await get(`SELECT * FROM automations WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  await run(`DELETE FROM automations WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- WhatsApp Business integration (one shared connection) --------------------
app.get('/api/integrations/whatsapp/status', ar(async (req, res) => {
  const conn = await whatsapp.getConnection();
  res.json({ connected: !!conn, displayPhone: conn?.display_phone || null });
}));

app.post('/api/integrations/whatsapp/connect', requireOwner, ar(async (req, res) => {
  const { phoneNumberId, accessToken, businessAccountId, verifyToken } = req.body || {};
  if (!phoneNumberId || !accessToken) {
    return res.status(400).json({ error: 'Phone Number ID and Access Token are required.' });
  }
  try {
    const displayPhone = await whatsapp.saveConnection({ phoneNumberId, accessToken, businessAccountId, verifyToken });
    res.json({ connected: true, displayPhone });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

app.post('/api/integrations/whatsapp/disconnect', requireOwner, ar(async (req, res) => {
  await whatsapp.disconnect();
  res.status(204).end();
}));

app.get('/api/integrations/whatsapp/conversations', ar(async (req, res) => {
  res.json(await whatsapp.listConversations());
}));

app.get('/api/integrations/whatsapp/conversations/:phone', ar(async (req, res) => {
  res.json(await whatsapp.getConversation(req.params.phone));
}));

app.post('/api/integrations/whatsapp/send', ar(async (req, res) => {
  const { to, text } = req.body || {};
  if (!to || !text) return res.status(400).json({ error: 'to and text are required' });
  try {
    await whatsapp.sendMessage(to, text);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

// -------------------- dashboard --------------------
app.get('/api/dashboard', ar(async (req, res) => {
  const openJobs = (await get(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'Open'`)).n;

  const activePipelineCandidates = (await get(`
    SELECT COUNT(DISTINCT candidate_id) AS n FROM submissions
    WHERE stage NOT IN ('Placed', 'Rejected', 'Withdrawn')
  `)).n;

  // scheduled_at is stored as text (e.g. '2026-07-22T10:00'); SQLite's date()
  // has no Postgres equivalent, so compare on the ISO date prefix instead.
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ((today.getUTCDay() + 6) % 7)));
  const weekStart = iso(monday), weekEnd = iso(new Date(monday.getTime() + 6 * 86400000));
  const recentFrom = iso(new Date(today.getTime() - 30 * 86400000)), todayIso = iso(today);
  const interviewsThisWeek = (await get(`
    SELECT COUNT(*) AS n FROM interviews WHERE substr(scheduled_at, 1, 10) BETWEEN ? AND ?
  `, weekStart, weekEnd)).n;

  const placementsRecent = (await get(`
    SELECT COUNT(*) AS n FROM placements WHERE start_date BETWEEN ? AND ?
  `, recentFrom, todayIso)).n;

  const feesFromNewPlacements = (await get(`
    SELECT COALESCE(SUM(placement_fee), 0) AS v FROM placements WHERE start_date BETWEEN ? AND ?
  `, recentFrom, todayIso)).v;
  const paidTimesheetRevenue = (await get(`
    SELECT COALESCE(SUM(amount), 0) AS v FROM timesheets_invoices WHERE status = 'Paid' AND period_end BETWEEN ? AND ?
  `, recentFrom, todayIso)).v;
  const revenueRecent = feesFromNewPlacements + paidTimesheetRevenue;

  const submissionsByStage = await all(`
    SELECT stage, COUNT(*) AS count FROM submissions GROUP BY stage
  `);

  const upcomingInterviews = await all(`
    SELECT i.id, i.type, i.status, i.scheduled_at, i.interviewer_name, cd.name AS candidate_name, j.title AS job_title, c.company_name AS client_name
    FROM interviews i
    JOIN submissions s ON s.id = i.submission_id
    JOIN candidates cd ON cd.id = s.candidate_id
    JOIN jobs j ON j.id = s.job_id
    JOIN clients c ON c.id = j.client_id
    WHERE i.status = 'Scheduled'
    ORDER BY i.scheduled_at ASC
    LIMIT 6
  `);

  const recentActivity = await all(`
    SELECT a.id, a.type, a.subject, a.related_type, a.occurred_at, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color
    FROM activities a
    JOIN users u ON u.id = a.owner_user_id
    ORDER BY a.occurred_at DESC
    LIMIT 8
  `);

  // opened_date and the reference date are both plain 'YYYY-MM-DD' text, so a
  // date cast + subtraction (Postgres yields an integer day count directly)
  // replaces SQLite's julianday() arithmetic.
  const openJobsAging = await all(`
    SELECT j.id, j.title, j.opened_date, c.company_name AS client_name,
      (?::date - j.opened_date::date) AS days_open
    FROM jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.status = 'Open'
    ORDER BY days_open DESC
    LIMIT 5
  `, todayIso);

  res.json({
    kpis: { openJobs, activePipelineCandidates, interviewsThisWeek, placementsRecent, revenueRecent },
    ranges: { weekStart, weekEnd, recentFrom, today: todayIso },
    submissionsByStage,
    upcomingInterviews,
    recentActivity,
    openJobsAging,
  });
}));

// -------------------- reports --------------------
app.get('/api/reports', ar(async (req, res) => {
  const funnelByStage = await all(`SELECT stage, COUNT(*) AS count FROM submissions GROUP BY stage`);

  const decided = (await get(`SELECT COUNT(*) AS n FROM submissions WHERE stage IN ('Placed', 'Rejected', 'Withdrawn')`)).n;
  const placed = (await get(`SELECT COUNT(*) AS n FROM submissions WHERE stage = 'Placed'`)).n;
  const placementRate = decided > 0 ? Math.round((placed / decided) * 100) : 0;

  const placementsByRecruiter = await all(`
    SELECT u.name AS recruiter_name, u.color AS recruiter_color, COUNT(p.id) AS placement_count, COALESCE(SUM(p.placement_fee), 0) AS total_fees
    FROM placements p
    JOIN submissions s ON s.id = p.submission_id
    JOIN users u ON u.id = s.owner_user_id
    GROUP BY u.id
    ORDER BY total_fees DESC
  `);

  // start_date is stored as 'YYYY-MM-DD' text, so the first 7 characters give
  // the 'YYYY-MM' month bucket without needing SQLite's strftime().
  const placementsByMonth = await all(`
    SELECT substr(start_date, 1, 7) AS month, COUNT(*) AS count, COALESCE(SUM(placement_fee), 0) AS total_fees
    FROM placements GROUP BY month ORDER BY month
  `);

  const jobsByStatus = await all(`SELECT status, COUNT(*) AS count FROM jobs GROUP BY status`);

  const invoiceAging = await all(`
    SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM timesheets_invoices GROUP BY status
  `);

  const totalPlacementFees = (await get(`SELECT COALESCE(SUM(placement_fee), 0) AS v FROM placements`)).v;
  const totalInvoiced = (await get(`SELECT COALESCE(SUM(amount), 0) AS v FROM timesheets_invoices`)).v;

  // Results per office (the office of a placement is the office of its job).
  const officeNames = new Map((await all(`SELECT id, name FROM offices`)).map((o) => [o.id, o.name]));
  const feeRows = await all(`SELECT j.office_id, COUNT(*) AS placement_count, COALESCE(SUM(p.placement_fee), 0) AS total_fees FROM placements p JOIN jobs j ON j.id = p.job_id GROUP BY j.office_id`);
  const billedRows = await all(`SELECT j.office_id, COALESCE(SUM(t.amount), 0) AS billed FROM timesheets_invoices t JOIN placements p ON p.id = t.placement_id JOIN jobs j ON j.id = p.job_id GROUP BY j.office_id`);
  const officeKeys = new Set([...feeRows, ...billedRows].map((r) => r.office_id ?? 0));
  const byOffice = [...officeKeys].map((k) => {
    const f = feeRows.find((r) => (r.office_id ?? 0) === k), bl = billedRows.find((r) => (r.office_id ?? 0) === k);
    return { office_id: k || null, office_name: k ? (officeNames.get(k) || '') : '', placement_count: f?.placement_count || 0, total_fees: Number(f?.total_fees) || 0, billed: Number(bl?.billed) || 0 };
  }).sort((x, y) => y.billed - x.billed);

  res.json({
    byOffice,
    funnelByStage,
    placementRate,
    placed,
    decided,
    placementsByRecruiter,
    placementsByMonth,
    jobsByStatus,
    invoiceAging,
    totalPlacementFees,
    totalInvoiced,
  });
}));

// Serve the built React app for every non-API route. Placed after all
// /api/* routes above so it only ever catches page loads, never API calls.
app.use(express.static(CLIENT_DIST));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

// Unknown /api paths (only reachable when signed in) and unhandled errors.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

initSchema()
  .then(() => initPhotoImportSchema(pool))
  .then(() => bootstrapOwner())
  .then(() => backfillRecruiters())
  .then(() => automationEngine.migrateAutomations())
  .then(() => rollSampleDates())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Roster API listening on http://localhost:${PORT}`);
    });
    startPhotoBilling({ pool, getSubscription });
    startDemoTrialScheduler();
    automationEngine.startAutomationScheduler();
    startSignaturePoller();
    setInterval(() => rollSampleDates().catch(() => {}), 6 * 60 * 60 * 1000).unref();
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
