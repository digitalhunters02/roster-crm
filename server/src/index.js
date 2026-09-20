import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, all, run, initSchema } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4350;

const ar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
  const b = req.body || {};
  const missing = missingField(b, ['company_name', 'industry', 'contact_name', 'contact_email', 'contact_phone', 'address', 'owner_user_id', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const info = await run(`
    INSERT INTO clients (company_name, industry, contact_name, contact_email, contact_phone, address, owner_user_id, status, notes)
    VALUES (@company_name, @industry, @contact_name, @contact_email, @contact_phone, @address, @owner_user_id, @status, @notes) RETURNING id
  `, {
    company_name: b.company_name, industry: b.industry, contact_name: b.contact_name, contact_email: b.contact_email,
    contact_phone: b.contact_phone, address: b.address, owner_user_id: b.owner_user_id, status: b.status, notes: b.notes || null,
  });
  res.status(201).json(await clientRow(info.rows[0].id));
}));

app.put('/api/clients/:id', ar(async (req, res) => {
  const existing = await clientRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['company_name', 'industry', 'contact_name', 'contact_email', 'contact_phone', 'address', 'owner_user_id', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  await run(`
    UPDATE clients SET company_name = @company_name, industry = @industry, contact_name = @contact_name, contact_email = @contact_email,
      contact_phone = @contact_phone, address = @address, owner_user_id = @owner_user_id, status = @status, notes = @notes
    WHERE id = @id
  `, {
    id: req.params.id, company_name: b.company_name, industry: b.industry, contact_name: b.contact_name, contact_email: b.contact_email,
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
  const b = req.body || {};
  const missing = missingField(b, ['client_id', 'title', 'employment_type', 'pay_range', 'location', 'status', 'owner_user_id', 'opened_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('clients', b.client_id))) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const info = await run(`
    INSERT INTO jobs (client_id, title, employment_type, pay_range, location, status, owner_user_id, opened_date, notes)
    VALUES (@client_id, @title, @employment_type, @pay_range, @location, @status, @owner_user_id, @opened_date, @notes) RETURNING id
  `, {
    client_id: b.client_id, title: b.title, employment_type: b.employment_type, pay_range: b.pay_range, location: b.location,
    status: b.status, owner_user_id: b.owner_user_id, opened_date: b.opened_date, notes: b.notes || null,
  });
  res.status(201).json(await jobRow(info.rows[0].id));
}));

app.put('/api/jobs/:id', ar(async (req, res) => {
  const existing = await jobRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['client_id', 'title', 'employment_type', 'pay_range', 'location', 'status', 'owner_user_id', 'opened_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('clients', b.client_id))) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  await run(`
    UPDATE jobs SET client_id = @client_id, title = @title, employment_type = @employment_type, pay_range = @pay_range,
      location = @location, status = @status, owner_user_id = @owner_user_id, opened_date = @opened_date, notes = @notes
    WHERE id = @id
  `, {
    id: req.params.id, client_id: b.client_id, title: b.title, employment_type: b.employment_type, pay_range: b.pay_range,
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

app.post('/api/candidates', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['name', 'email', 'phone', 'current_title', 'current_employer', 'skills', 'source', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const info = await run(`
    INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, resume_summary, source, owner_user_id, created_at)
    VALUES (@name, @email, @phone, @current_title, @current_employer, @skills, @resume_summary, @source, @owner_user_id, @created_at) RETURNING id
  `, {
    name: b.name, email: b.email, phone: b.phone, current_title: b.current_title, current_employer: b.current_employer,
    skills: b.skills, resume_summary: b.resume_summary || null, source: b.source, owner_user_id: b.owner_user_id,
    created_at: b.created_at || new Date().toISOString().slice(0, 10),
  });
  res.status(201).json(await candidateRow(info.rows[0].id));
}));

app.put('/api/candidates/:id', ar(async (req, res) => {
  const existing = await candidateRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['name', 'email', 'phone', 'current_title', 'current_employer', 'skills', 'source', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('users', b.owner_user_id))) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  await run(`
    UPDATE candidates SET name = @name, email = @email, phone = @phone, current_title = @current_title, current_employer = @current_employer,
      skills = @skills, resume_summary = @resume_summary, source = @source, owner_user_id = @owner_user_id
    WHERE id = @id
  `, {
    id: req.params.id, name: b.name, email: b.email, phone: b.phone, current_title: b.current_title, current_employer: b.current_employer,
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
  res.status(201).json(await submissionRow(info.rows[0].id));
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
  res.json(await submissionRow(req.params.id));
}));

app.patch('/api/submissions/:id/stage', ar(async (req, res) => {
  const existing = await submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { stage } = req.body || {};
  if (!SUBMISSION_STAGES.includes(stage)) return res.status(400).json({ error: 'invalid stage' });
  await run(`UPDATE submissions SET stage = ? WHERE id = ?`, stage, req.params.id);
  res.json(await submissionRow(req.params.id));
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
  res.status(201).json(await placementRow(info.rows[0].id));
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
  SELECT t.*, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title
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

app.post('/api/timesheets', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['placement_id', 'period_start', 'period_end', 'hours', 'amount', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('placements', b.placement_id))) return res.status(400).json({ error: 'placement_id does not reference a real placement' });

  const info = await run(`
    INSERT INTO timesheets_invoices (placement_id, period_start, period_end, hours, amount, status)
    VALUES (@placement_id, @period_start, @period_end, @hours, @amount, @status) RETURNING id
  `, {
    placement_id: b.placement_id, period_start: b.period_start, period_end: b.period_end,
    hours: Number(b.hours) || 0, amount: Number(b.amount) || 0, status: b.status,
  });
  res.status(201).json(await timesheetRow(info.rows[0].id));
}));

app.put('/api/timesheets/:id', ar(async (req, res) => {
  const existing = await timesheetRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['placement_id', 'period_start', 'period_end', 'hours', 'amount', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!(await rowExists('placements', b.placement_id))) return res.status(400).json({ error: 'placement_id does not reference a real placement' });

  await run(`
    UPDATE timesheets_invoices SET placement_id = @placement_id, period_start = @period_start, period_end = @period_end,
      hours = @hours, amount = @amount, status = @status
    WHERE id = @id
  `, {
    id: req.params.id, placement_id: b.placement_id, period_start: b.period_start, period_end: b.period_end,
    hours: Number(b.hours) || 0, amount: Number(b.amount) || 0, status: b.status,
  });
  res.json(await timesheetRow(req.params.id));
}));

app.delete('/api/timesheets/:id', ar(async (req, res) => {
  const existing = await timesheetRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  await run(`DELETE FROM timesheets_invoices WHERE id = ?`, req.params.id);
  res.status(204).end();
}));

// -------------------- activities (dashboard feed) --------------------
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
app.get('/api/automations', ar(async (req, res) => {
  res.json(await all(`SELECT * FROM automations ORDER BY name`));
}));

app.post('/api/automations', ar(async (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['name', 'trigger_desc', 'action_desc']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });

  const info = await run(`
    INSERT INTO automations (name, trigger_desc, action_desc, active, runs_30d)
    VALUES (@name, @trigger_desc, @action_desc, @active, 0) RETURNING id
  `, {
    name: b.name, trigger_desc: b.trigger_desc, action_desc: b.action_desc, active: b.active === false ? 0 : 1,
  });
  res.status(201).json(await get(`SELECT * FROM automations WHERE id = ?`, info.rows[0].id));
}));

app.patch('/api/automations/:id/active', ar(async (req, res) => {
  const existing = await get(`SELECT * FROM automations WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { active } = req.body || {};
  await run(`UPDATE automations SET active = ? WHERE id = ?`, active ? 1 : 0, req.params.id);
  res.json(await get(`SELECT * FROM automations WHERE id = ?`, req.params.id));
}));

app.delete('/api/automations/:id', ar(async (req, res) => {
  const existing = await get(`SELECT * FROM automations WHERE id = ?`, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  await run(`DELETE FROM automations WHERE id = ?`, req.params.id);
  res.status(204).end();
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
  const interviewsThisWeek = (await get(`
    SELECT COUNT(*) AS n FROM interviews WHERE substr(scheduled_at, 1, 10) BETWEEN '2026-09-14' AND '2026-09-20'
  `)).n;

  const placementsRecent = (await get(`
    SELECT COUNT(*) AS n FROM placements WHERE start_date BETWEEN '2026-08-01' AND '2026-09-15'
  `)).n;

  const feesFromNewPlacements = (await get(`
    SELECT COALESCE(SUM(placement_fee), 0) AS v FROM placements WHERE start_date BETWEEN '2026-08-01' AND '2026-09-15'
  `)).v;
  const paidTimesheetRevenue = (await get(`
    SELECT COALESCE(SUM(amount), 0) AS v FROM timesheets_invoices WHERE status = 'Paid' AND period_end BETWEEN '2026-08-01' AND '2026-09-15'
  `)).v;
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
      (DATE '2026-09-15' - j.opened_date::date) AS days_open
    FROM jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.status = 'Open'
    ORDER BY days_open DESC
    LIMIT 5
  `);

  res.json({
    kpis: { openJobs, activePipelineCandidates, interviewsThisWeek, placementsRecent, revenueRecent },
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

  res.json({
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

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Roster API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
