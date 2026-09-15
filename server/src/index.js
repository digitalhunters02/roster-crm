import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4350;

// -------------------- helpers --------------------
function missingField(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') return f;
  }
  return null;
}

function rowExists(table, id) {
  if (id === undefined || id === null || id === '') return false;
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
}

function countWhere(table, column, id) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(id).n;
}

// -------------------- users (read-only; Team card on Settings) --------------------
app.get('/api/users', (req, res) => {
  res.json(db.prepare(`SELECT * FROM users ORDER BY name`).all());
});

// -------------------- clients --------------------
const CLIENT_SELECT = `
  SELECT c.*, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color,
    (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.status = 'Open') AS open_job_count,
    (SELECT COUNT(*) FROM placements p WHERE p.client_id = c.id) AS placement_count
  FROM clients c
  JOIN users u ON u.id = c.owner_user_id
`;
function clientRow(id) {
  return db.prepare(`${CLIENT_SELECT} WHERE c.id = ?`).get(id);
}

app.get('/api/clients', (req, res) => {
  res.json(db.prepare(`${CLIENT_SELECT} ORDER BY c.company_name`).all());
});

app.post('/api/clients', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['company_name', 'industry', 'contact_name', 'contact_email', 'contact_phone', 'address', 'owner_user_id', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const info = db.prepare(`
    INSERT INTO clients (company_name, industry, contact_name, contact_email, contact_phone, address, owner_user_id, status, notes)
    VALUES (@company_name, @industry, @contact_name, @contact_email, @contact_phone, @address, @owner_user_id, @status, @notes)
  `).run({
    company_name: b.company_name, industry: b.industry, contact_name: b.contact_name, contact_email: b.contact_email,
    contact_phone: b.contact_phone, address: b.address, owner_user_id: b.owner_user_id, status: b.status, notes: b.notes || null,
  });
  res.status(201).json(clientRow(info.lastInsertRowid));
});

app.put('/api/clients/:id', (req, res) => {
  const existing = clientRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['company_name', 'industry', 'contact_name', 'contact_email', 'contact_phone', 'address', 'owner_user_id', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  db.prepare(`
    UPDATE clients SET company_name = @company_name, industry = @industry, contact_name = @contact_name, contact_email = @contact_email,
      contact_phone = @contact_phone, address = @address, owner_user_id = @owner_user_id, status = @status, notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.id, company_name: b.company_name, industry: b.industry, contact_name: b.contact_name, contact_email: b.contact_email,
    contact_phone: b.contact_phone, address: b.address, owner_user_id: b.owner_user_id, status: b.status, notes: b.notes || null,
  });
  res.json(clientRow(req.params.id));
});

app.delete('/api/clients/:id', (req, res) => {
  const existing = clientRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['jobs', 'client_id', 'job'],
    ['placements', 'client_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this client.` });
  }
  db.prepare(`DELETE FROM clients WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- jobs --------------------
const JOB_SELECT = `
  SELECT j.*, c.company_name AS client_name, c.industry AS client_industry,
    u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color,
    (SELECT COUNT(*) FROM submissions s WHERE s.job_id = j.id) AS submission_count
  FROM jobs j
  JOIN clients c ON c.id = j.client_id
  JOIN users u ON u.id = j.owner_user_id
`;
function jobRow(id) {
  return db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id);
}

app.get('/api/jobs', (req, res) => {
  res.json(db.prepare(`${JOB_SELECT} ORDER BY j.opened_date DESC`).all());
});

app.post('/api/jobs', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['client_id', 'title', 'employment_type', 'pay_range', 'location', 'status', 'owner_user_id', 'opened_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('clients', b.client_id)) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const info = db.prepare(`
    INSERT INTO jobs (client_id, title, employment_type, pay_range, location, status, owner_user_id, opened_date, notes)
    VALUES (@client_id, @title, @employment_type, @pay_range, @location, @status, @owner_user_id, @opened_date, @notes)
  `).run({
    client_id: b.client_id, title: b.title, employment_type: b.employment_type, pay_range: b.pay_range, location: b.location,
    status: b.status, owner_user_id: b.owner_user_id, opened_date: b.opened_date, notes: b.notes || null,
  });
  res.status(201).json(jobRow(info.lastInsertRowid));
});

app.put('/api/jobs/:id', (req, res) => {
  const existing = jobRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['client_id', 'title', 'employment_type', 'pay_range', 'location', 'status', 'owner_user_id', 'opened_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('clients', b.client_id)) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  db.prepare(`
    UPDATE jobs SET client_id = @client_id, title = @title, employment_type = @employment_type, pay_range = @pay_range,
      location = @location, status = @status, owner_user_id = @owner_user_id, opened_date = @opened_date, notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.id, client_id: b.client_id, title: b.title, employment_type: b.employment_type, pay_range: b.pay_range,
    location: b.location, status: b.status, owner_user_id: b.owner_user_id, opened_date: b.opened_date, notes: b.notes || null,
  });
  res.json(jobRow(req.params.id));
});

app.delete('/api/jobs/:id', (req, res) => {
  const existing = jobRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['submissions', 'job_id', 'submission'],
    ['placements', 'job_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this job.` });
  }
  db.prepare(`DELETE FROM jobs WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- candidates --------------------
const CANDIDATE_SELECT = `
  SELECT cd.*, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color,
    (SELECT COUNT(*) FROM submissions s WHERE s.candidate_id = cd.id) AS submission_count
  FROM candidates cd
  JOIN users u ON u.id = cd.owner_user_id
`;
function candidateRow(id) {
  return db.prepare(`${CANDIDATE_SELECT} WHERE cd.id = ?`).get(id);
}

app.get('/api/candidates', (req, res) => {
  res.json(db.prepare(`${CANDIDATE_SELECT} ORDER BY cd.created_at DESC`).all());
});

app.post('/api/candidates', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['name', 'email', 'phone', 'current_title', 'current_employer', 'skills', 'source', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  const info = db.prepare(`
    INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, resume_summary, source, owner_user_id, created_at)
    VALUES (@name, @email, @phone, @current_title, @current_employer, @skills, @resume_summary, @source, @owner_user_id, @created_at)
  `).run({
    name: b.name, email: b.email, phone: b.phone, current_title: b.current_title, current_employer: b.current_employer,
    skills: b.skills, resume_summary: b.resume_summary || null, source: b.source, owner_user_id: b.owner_user_id,
    created_at: b.created_at || new Date().toISOString().slice(0, 10),
  });
  res.status(201).json(candidateRow(info.lastInsertRowid));
});

app.put('/api/candidates/:id', (req, res) => {
  const existing = candidateRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['name', 'email', 'phone', 'current_title', 'current_employer', 'skills', 'source', 'owner_user_id']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });

  db.prepare(`
    UPDATE candidates SET name = @name, email = @email, phone = @phone, current_title = @current_title, current_employer = @current_employer,
      skills = @skills, resume_summary = @resume_summary, source = @source, owner_user_id = @owner_user_id
    WHERE id = @id
  `).run({
    id: req.params.id, name: b.name, email: b.email, phone: b.phone, current_title: b.current_title, current_employer: b.current_employer,
    skills: b.skills, resume_summary: b.resume_summary || null, source: b.source, owner_user_id: b.owner_user_id,
  });
  res.json(candidateRow(req.params.id));
});

app.delete('/api/candidates/:id', (req, res) => {
  const existing = candidateRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['submissions', 'candidate_id', 'submission'],
    ['placements', 'candidate_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this candidate.` });
  }
  db.prepare(`DELETE FROM candidates WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

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
function submissionRow(id) {
  return db.prepare(`${SUBMISSION_SELECT} WHERE s.id = ?`).get(id);
}
const SUBMISSION_STAGES = ['Sourced', 'Screened', 'Submitted to Client', 'Client Interview', 'Offer', 'Placed', 'Rejected', 'Withdrawn'];

app.get('/api/submissions', (req, res) => {
  res.json(db.prepare(`${SUBMISSION_SELECT} ORDER BY s.submitted_date DESC`).all());
});

app.post('/api/submissions', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['candidate_id', 'job_id', 'stage', 'owner_user_id', 'submitted_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('candidates', b.candidate_id)) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!rowExists('jobs', b.job_id)) return res.status(400).json({ error: 'job_id does not reference a real job' });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });
  if (!SUBMISSION_STAGES.includes(b.stage)) return res.status(400).json({ error: 'invalid stage' });

  const info = db.prepare(`
    INSERT INTO submissions (candidate_id, job_id, stage, owner_user_id, submitted_date, notes)
    VALUES (@candidate_id, @job_id, @stage, @owner_user_id, @submitted_date, @notes)
  `).run({
    candidate_id: b.candidate_id, job_id: b.job_id, stage: b.stage, owner_user_id: b.owner_user_id,
    submitted_date: b.submitted_date, notes: b.notes || null,
  });
  res.status(201).json(submissionRow(info.lastInsertRowid));
});

app.put('/api/submissions/:id', (req, res) => {
  const existing = submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['candidate_id', 'job_id', 'stage', 'owner_user_id', 'submitted_date']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('candidates', b.candidate_id)) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!rowExists('jobs', b.job_id)) return res.status(400).json({ error: 'job_id does not reference a real job' });
  if (!rowExists('users', b.owner_user_id)) return res.status(400).json({ error: 'owner_user_id does not reference a real user' });
  if (!SUBMISSION_STAGES.includes(b.stage)) return res.status(400).json({ error: 'invalid stage' });

  db.prepare(`
    UPDATE submissions SET candidate_id = @candidate_id, job_id = @job_id, stage = @stage, owner_user_id = @owner_user_id,
      submitted_date = @submitted_date, notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.id, candidate_id: b.candidate_id, job_id: b.job_id, stage: b.stage, owner_user_id: b.owner_user_id,
    submitted_date: b.submitted_date, notes: b.notes || null,
  });
  res.json(submissionRow(req.params.id));
});

app.patch('/api/submissions/:id/stage', (req, res) => {
  const existing = submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { stage } = req.body || {};
  if (!SUBMISSION_STAGES.includes(stage)) return res.status(400).json({ error: 'invalid stage' });
  db.prepare(`UPDATE submissions SET stage = ? WHERE id = ?`).run(stage, req.params.id);
  res.json(submissionRow(req.params.id));
});

app.delete('/api/submissions/:id', (req, res) => {
  const existing = submissionRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const blockers = [
    ['interviews', 'submission_id', 'interview'],
    ['placements', 'submission_id', 'placement'],
  ];
  for (const [table, col, label] of blockers) {
    const n = countWhere(table, col, req.params.id);
    if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} ${label}${n === 1 ? '' : 's'} still reference this submission.` });
  }
  db.prepare(`DELETE FROM submissions WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- interviews --------------------
const INTERVIEW_SELECT = `
  SELECT i.*, cd.name AS candidate_name, j.title AS job_title, c.company_name AS client_name
  FROM interviews i
  JOIN submissions s ON s.id = i.submission_id
  JOIN candidates cd ON cd.id = s.candidate_id
  JOIN jobs j ON j.id = s.job_id
  JOIN clients c ON c.id = j.client_id
`;
function interviewRow(id) {
  return db.prepare(`${INTERVIEW_SELECT} WHERE i.id = ?`).get(id);
}

app.get('/api/interviews', (req, res) => {
  res.json(db.prepare(`${INTERVIEW_SELECT} ORDER BY i.scheduled_at DESC`).all());
});

app.post('/api/interviews', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'interviewer_name', 'scheduled_at', 'type', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('submissions', b.submission_id)) return res.status(400).json({ error: 'submission_id does not reference a real submission' });

  const info = db.prepare(`
    INSERT INTO interviews (submission_id, interviewer_name, scheduled_at, type, status, notes)
    VALUES (@submission_id, @interviewer_name, @scheduled_at, @type, @status, @notes)
  `).run({
    submission_id: b.submission_id, interviewer_name: b.interviewer_name, scheduled_at: b.scheduled_at,
    type: b.type, status: b.status, notes: b.notes || null,
  });
  res.status(201).json(interviewRow(info.lastInsertRowid));
});

app.put('/api/interviews/:id', (req, res) => {
  const existing = interviewRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'interviewer_name', 'scheduled_at', 'type', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('submissions', b.submission_id)) return res.status(400).json({ error: 'submission_id does not reference a real submission' });

  db.prepare(`
    UPDATE interviews SET submission_id = @submission_id, interviewer_name = @interviewer_name, scheduled_at = @scheduled_at,
      type = @type, status = @status, notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.id, submission_id: b.submission_id, interviewer_name: b.interviewer_name, scheduled_at: b.scheduled_at,
    type: b.type, status: b.status, notes: b.notes || null,
  });
  res.json(interviewRow(req.params.id));
});

app.delete('/api/interviews/:id', (req, res) => {
  const existing = interviewRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM interviews WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- placements --------------------
const PLACEMENT_SELECT = `
  SELECT p.*, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title, j.employment_type AS job_employment_type,
    (SELECT COUNT(*) FROM timesheets_invoices t WHERE t.placement_id = p.id) AS timesheet_count
  FROM placements p
  JOIN candidates cd ON cd.id = p.candidate_id
  JOIN clients c ON c.id = p.client_id
  JOIN jobs j ON j.id = p.job_id
`;
function placementRow(id) {
  return db.prepare(`${PLACEMENT_SELECT} WHERE p.id = ?`).get(id);
}

app.get('/api/placements', (req, res) => {
  res.json(db.prepare(`${PLACEMENT_SELECT} ORDER BY p.start_date DESC`).all());
});

app.post('/api/placements', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'candidate_id', 'client_id', 'job_id', 'start_date', 'pay_rate', 'bill_rate', 'placement_fee', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('submissions', b.submission_id)) return res.status(400).json({ error: 'submission_id does not reference a real submission' });
  if (!rowExists('candidates', b.candidate_id)) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!rowExists('clients', b.client_id)) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!rowExists('jobs', b.job_id)) return res.status(400).json({ error: 'job_id does not reference a real job' });

  const info = db.prepare(`
    INSERT INTO placements (submission_id, candidate_id, client_id, job_id, start_date, end_date, pay_rate, bill_rate, placement_fee, status)
    VALUES (@submission_id, @candidate_id, @client_id, @job_id, @start_date, @end_date, @pay_rate, @bill_rate, @placement_fee, @status)
  `).run({
    submission_id: b.submission_id, candidate_id: b.candidate_id, client_id: b.client_id, job_id: b.job_id,
    start_date: b.start_date, end_date: b.end_date || null, pay_rate: Number(b.pay_rate) || 0,
    bill_rate: Number(b.bill_rate) || 0, placement_fee: Number(b.placement_fee) || 0, status: b.status,
  });
  res.status(201).json(placementRow(info.lastInsertRowid));
});

app.put('/api/placements/:id', (req, res) => {
  const existing = placementRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['submission_id', 'candidate_id', 'client_id', 'job_id', 'start_date', 'pay_rate', 'bill_rate', 'placement_fee', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('submissions', b.submission_id)) return res.status(400).json({ error: 'submission_id does not reference a real submission' });
  if (!rowExists('candidates', b.candidate_id)) return res.status(400).json({ error: 'candidate_id does not reference a real candidate' });
  if (!rowExists('clients', b.client_id)) return res.status(400).json({ error: 'client_id does not reference a real client' });
  if (!rowExists('jobs', b.job_id)) return res.status(400).json({ error: 'job_id does not reference a real job' });

  db.prepare(`
    UPDATE placements SET submission_id = @submission_id, candidate_id = @candidate_id, client_id = @client_id, job_id = @job_id,
      start_date = @start_date, end_date = @end_date, pay_rate = @pay_rate, bill_rate = @bill_rate,
      placement_fee = @placement_fee, status = @status
    WHERE id = @id
  `).run({
    id: req.params.id, submission_id: b.submission_id, candidate_id: b.candidate_id, client_id: b.client_id, job_id: b.job_id,
    start_date: b.start_date, end_date: b.end_date || null, pay_rate: Number(b.pay_rate) || 0,
    bill_rate: Number(b.bill_rate) || 0, placement_fee: Number(b.placement_fee) || 0, status: b.status,
  });
  res.json(placementRow(req.params.id));
});

app.delete('/api/placements/:id', (req, res) => {
  const existing = placementRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const n = countWhere('timesheets_invoices', 'placement_id', req.params.id);
  if (n > 0) return res.status(409).json({ error: `Cannot delete: ${n} timesheet${n === 1 ? '' : 's'}/invoice${n === 1 ? '' : 's'} still reference this placement.` });
  db.prepare(`DELETE FROM placements WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- timesheets & invoicing --------------------
const TIMESHEET_SELECT = `
  SELECT t.*, cd.name AS candidate_name, c.company_name AS client_name, j.title AS job_title
  FROM timesheets_invoices t
  JOIN placements p ON p.id = t.placement_id
  JOIN candidates cd ON cd.id = p.candidate_id
  JOIN clients c ON c.id = p.client_id
  JOIN jobs j ON j.id = p.job_id
`;
function timesheetRow(id) {
  return db.prepare(`${TIMESHEET_SELECT} WHERE t.id = ?`).get(id);
}

app.get('/api/timesheets', (req, res) => {
  res.json(db.prepare(`${TIMESHEET_SELECT} ORDER BY t.period_end DESC`).all());
});

app.post('/api/timesheets', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['placement_id', 'period_start', 'period_end', 'hours', 'amount', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('placements', b.placement_id)) return res.status(400).json({ error: 'placement_id does not reference a real placement' });

  const info = db.prepare(`
    INSERT INTO timesheets_invoices (placement_id, period_start, period_end, hours, amount, status)
    VALUES (@placement_id, @period_start, @period_end, @hours, @amount, @status)
  `).run({
    placement_id: b.placement_id, period_start: b.period_start, period_end: b.period_end,
    hours: Number(b.hours) || 0, amount: Number(b.amount) || 0, status: b.status,
  });
  res.status(201).json(timesheetRow(info.lastInsertRowid));
});

app.put('/api/timesheets/:id', (req, res) => {
  const existing = timesheetRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const missing = missingField(b, ['placement_id', 'period_start', 'period_end', 'hours', 'amount', 'status']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });
  if (!rowExists('placements', b.placement_id)) return res.status(400).json({ error: 'placement_id does not reference a real placement' });

  db.prepare(`
    UPDATE timesheets_invoices SET placement_id = @placement_id, period_start = @period_start, period_end = @period_end,
      hours = @hours, amount = @amount, status = @status
    WHERE id = @id
  `).run({
    id: req.params.id, placement_id: b.placement_id, period_start: b.period_start, period_end: b.period_end,
    hours: Number(b.hours) || 0, amount: Number(b.amount) || 0, status: b.status,
  });
  res.json(timesheetRow(req.params.id));
});

app.delete('/api/timesheets/:id', (req, res) => {
  const existing = timesheetRow(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM timesheets_invoices WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- activities (dashboard feed) --------------------
app.get('/api/activities', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const rows = db.prepare(`
    SELECT a.*, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color
    FROM activities a
    JOIN users u ON u.id = a.owner_user_id
    ORDER BY a.occurred_at DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

// -------------------- automations --------------------
app.get('/api/automations', (req, res) => {
  res.json(db.prepare(`SELECT * FROM automations ORDER BY name`).all());
});

app.post('/api/automations', (req, res) => {
  const b = req.body || {};
  const missing = missingField(b, ['name', 'trigger_desc', 'action_desc']);
  if (missing) return res.status(400).json({ error: `${missing} is required` });

  const info = db.prepare(`
    INSERT INTO automations (name, trigger_desc, action_desc, active, runs_30d)
    VALUES (@name, @trigger_desc, @action_desc, @active, 0)
  `).run({
    name: b.name, trigger_desc: b.trigger_desc, action_desc: b.action_desc, active: b.active === false ? 0 : 1,
  });
  res.status(201).json(db.prepare(`SELECT * FROM automations WHERE id = ?`).get(info.lastInsertRowid));
});

app.patch('/api/automations/:id/active', (req, res) => {
  const existing = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { active } = req.body || {};
  db.prepare(`UPDATE automations SET active = ? WHERE id = ?`).run(active ? 1 : 0, req.params.id);
  res.json(db.prepare(`SELECT * FROM automations WHERE id = ?`).get(req.params.id));
});

app.delete('/api/automations/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM automations WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(`DELETE FROM automations WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

// -------------------- dashboard --------------------
app.get('/api/dashboard', (req, res) => {
  const openJobs = db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE status = 'Open'`).get().n;

  const activePipelineCandidates = db.prepare(`
    SELECT COUNT(DISTINCT candidate_id) AS n FROM submissions
    WHERE stage NOT IN ('Placed', 'Rejected', 'Withdrawn')
  `).get().n;

  const interviewsThisWeek = db.prepare(`
    SELECT COUNT(*) AS n FROM interviews WHERE date(scheduled_at) BETWEEN '2026-09-14' AND '2026-09-20'
  `).get().n;

  const placementsRecent = db.prepare(`
    SELECT COUNT(*) AS n FROM placements WHERE start_date BETWEEN '2026-08-01' AND '2026-09-15'
  `).get().n;

  const feesFromNewPlacements = db.prepare(`
    SELECT COALESCE(SUM(placement_fee), 0) AS v FROM placements WHERE start_date BETWEEN '2026-08-01' AND '2026-09-15'
  `).get().v;
  const paidTimesheetRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS v FROM timesheets_invoices WHERE status = 'Paid' AND period_end BETWEEN '2026-08-01' AND '2026-09-15'
  `).get().v;
  const revenueRecent = feesFromNewPlacements + paidTimesheetRevenue;

  const submissionsByStage = db.prepare(`
    SELECT stage, COUNT(*) AS count FROM submissions GROUP BY stage
  `).all();

  const upcomingInterviews = db.prepare(`
    SELECT i.id, i.type, i.status, i.scheduled_at, i.interviewer_name, cd.name AS candidate_name, j.title AS job_title, c.company_name AS client_name
    FROM interviews i
    JOIN submissions s ON s.id = i.submission_id
    JOIN candidates cd ON cd.id = s.candidate_id
    JOIN jobs j ON j.id = s.job_id
    JOIN clients c ON c.id = j.client_id
    WHERE i.status = 'Scheduled'
    ORDER BY i.scheduled_at ASC
    LIMIT 6
  `).all();

  const recentActivity = db.prepare(`
    SELECT a.id, a.type, a.subject, a.related_type, a.occurred_at, u.name AS owner_name, u.initials AS owner_initials, u.color AS owner_color
    FROM activities a
    JOIN users u ON u.id = a.owner_user_id
    ORDER BY a.occurred_at DESC
    LIMIT 8
  `).all();

  const openJobsAging = db.prepare(`
    SELECT j.id, j.title, j.opened_date, c.company_name AS client_name,
      CAST(julianday('2026-09-15') - julianday(j.opened_date) AS INTEGER) AS days_open
    FROM jobs j JOIN clients c ON c.id = j.client_id
    WHERE j.status = 'Open'
    ORDER BY days_open DESC
    LIMIT 5
  `).all();

  res.json({
    kpis: { openJobs, activePipelineCandidates, interviewsThisWeek, placementsRecent, revenueRecent },
    submissionsByStage,
    upcomingInterviews,
    recentActivity,
    openJobsAging,
  });
});

// -------------------- reports --------------------
app.get('/api/reports', (req, res) => {
  const funnelByStage = db.prepare(`SELECT stage, COUNT(*) AS count FROM submissions GROUP BY stage`).all();

  const decided = db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE stage IN ('Placed', 'Rejected', 'Withdrawn')`).get().n;
  const placed = db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE stage = 'Placed'`).get().n;
  const placementRate = decided > 0 ? Math.round((placed / decided) * 100) : 0;

  const placementsByRecruiter = db.prepare(`
    SELECT u.name AS recruiter_name, u.color AS recruiter_color, COUNT(p.id) AS placement_count, COALESCE(SUM(p.placement_fee), 0) AS total_fees
    FROM placements p
    JOIN submissions s ON s.id = p.submission_id
    JOIN users u ON u.id = s.owner_user_id
    GROUP BY u.id
    ORDER BY total_fees DESC
  `).all();

  const placementsByMonth = db.prepare(`
    SELECT strftime('%Y-%m', start_date) AS month, COUNT(*) AS count, COALESCE(SUM(placement_fee), 0) AS total_fees
    FROM placements GROUP BY month ORDER BY month
  `).all();

  const jobsByStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM jobs GROUP BY status`).all();

  const invoiceAging = db.prepare(`
    SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount FROM timesheets_invoices GROUP BY status
  `).all();

  const totalPlacementFees = db.prepare(`SELECT COALESCE(SUM(placement_fee), 0) AS v FROM placements`).get().v;
  const totalInvoiced = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS v FROM timesheets_invoices`).get().v;

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
});

app.listen(PORT, () => {
  console.log(`Roster API listening on http://localhost:${PORT}`);
});
