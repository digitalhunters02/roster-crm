// Public API (read, plus adding candidates) with API keys, and outgoing webhooks. Complete plan, managed by the owner.
//   API:      Authorization: Bearer rk_...   (or X-API-Key)   GET /api/v1/{candidates|jobs|clients|submissions|placements|timesheets}  POST /api/v1/candidates
//   Webhooks: POST to the agency's URL with X-Roster-Signature: sha256=HMAC(secret, "<timestamp>.<body>") and X-Roster-Timestamp.
//   Events:   candidate.created  submission.stage_changed  placement.created  timesheet.status_changed
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { get, all, run } from './db.js';
import { effectivePlan, allowsFeature } from './billing.js';
import { encrypt, decrypt } from './secretBox.js';
import { makeLimiter } from './auth.js';

export const EVENTS = ['candidate.created', 'submission.stage_changed', 'placement.created', 'timesheet.status_changed'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- URL safety: a webhook must not be able to call the server's own network ----------
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === '1'; // tests only
async function checkUrl(raw) {
  let u; try { u = new URL(raw); } catch { return 'Enter a full address that starts with https://'; }
  if (u.protocol !== 'https:' && !(allowPrivate() && u.protocol === 'http:')) return 'The address must start with https://';
  if (u.username || u.password) return 'The address cannot contain a user name or password.';
  if (allowPrivate()) return '';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!ips.length) return 'Could not find that address.';
  if (ips.some(isPrivateIp)) return 'That address points to a private network and cannot be used.';
  return '';
}

// ---------- outgoing webhooks ----------
async function deliver(hook, event, body, attempt = 1) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', decrypt(hook.secret_enc)).update(`${ts}.${body}`).digest('hex');
  let code = null, error = null, ok = false;
  try {
    const bad = await checkUrl(hook.url); // re-checked at send time (DNS can change)
    if (bad) throw new Error(bad);
    const r = await fetch(hook.url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Roster-Webhook/1', 'X-Roster-Event': event, 'X-Roster-Timestamp': ts, 'X-Roster-Signature': `sha256=${sig}` }, body });
    code = r.status; ok = r.status >= 200 && r.status < 300;
    if (!ok) error = `HTTP ${r.status}`;
  } catch (e) { error = String(e.message || e).slice(0, 200); }
  if (!ok && attempt < 2) { await new Promise((r) => setTimeout(r, Number(process.env.WEBHOOK_RETRY_MS) || 2000)); return deliver(hook, event, body, attempt + 1); }
  await run(`INSERT INTO webhook_deliveries (webhook_id, event, status_code, ok, error, attempts) VALUES ($1,$2,$3,$4,$5,$6)`, [hook.id, event, code, ok, error, attempt]);
  await run(`DELETE FROM webhook_deliveries WHERE webhook_id = $1 AND id NOT IN (SELECT id FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY id DESC LIMIT 50)`, [hook.id]).catch(() => {});
  return { ok, code, error };
}

// Never throws and never waits: a webhook must not slow down or break the save that caused it.
export function emit(event, data) {
  (async () => {
    if (!allowsFeature(await effectivePlan(), 'api')) return;
    const hooks = await all(`SELECT * FROM webhooks WHERE active = TRUE`);
    const body = JSON.stringify({ id: crypto.randomUUID(), event, created_at: new Date().toISOString(), data });
    for (const h of hooks) if (h.events === '*' || h.events.split(',').includes(event)) deliver(h, event, body).catch(() => {});
  })().catch((e) => console.error('webhook emit:', e.message));
}

// ---------- public API ----------
const RESOURCES = {
  candidates: `SELECT id, name, email, phone, current_title, current_employer, skills, resume_summary, source, created_at, office_id FROM candidates`,
  jobs: `SELECT id, client_id, title, employment_type, pay_range, location, status, opened_date, notes, office_id FROM jobs`,
  clients: `SELECT id, company_name, industry, contact_name, contact_email, contact_phone, address, status, office_id FROM clients`,
  submissions: `SELECT id, candidate_id, job_id, stage, submitted_date, notes FROM submissions`,
  placements: `SELECT id, submission_id, candidate_id, client_id, job_id, start_date, end_date, pay_rate, bill_rate, placement_fee, status FROM placements`,
  timesheets: `SELECT id, placement_id, period_start, period_end, hours, amount, status FROM timesheets_invoices`,
};

export function mountPublicApi(app, ar) {
  const limiter = makeLimiter({ windowMs: 60_000, max: 120 });
  app.use('/api/v1', ar(async (req, res, next) => {
    const raw = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.get('x-api-key') || '';
    const key = raw.startsWith('rk_') ? await get(`SELECT id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`, [sha(raw)]) : null;
    if (!key) return res.status(401).json({ error: 'Missing or invalid API key.', code: 'invalid_api_key' });
    const wait = limiter.blockedFor(`k${key.id}`);
    if (wait) { res.set('Retry-After', String(wait)); return res.status(429).json({ error: 'Too many requests.', code: 'rate_limited' }); }
    limiter.hit(`k${key.id}`);
    if (!allowsFeature(await effectivePlan(), 'api')) return res.status(402).json({ error: 'The API is part of the Complete plan.', code: 'plan_required', requiredPlan: 'completo' });
    run(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [key.id]).catch(() => {});
    next();
  }));

  app.get('/api/v1/:resource', ar(async (req, res) => {
    const sql = RESOURCES[req.params.resource];
    if (!sql) return res.status(404).json({ error: 'Unknown resource.', code: 'not_found' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const rows = await all(`${sql} ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset]);
    res.json({ data: rows, limit, offset, has_more: rows.length === limit });
  }));

  app.post('/api/v1/candidates', ar(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 160);
    if (!name) return res.status(400).json({ error: 'name is required', code: 'name_required' });
    const owner = await get(`SELECT id FROM users ORDER BY id LIMIT 1`);
    if (!owner) return res.status(409).json({ error: 'Add a recruiter first.', code: 'no_recruiter' });
    const s = (v, n) => String(v ?? '').trim().slice(0, n);
    const r = await run(`INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, resume_summary, source, owner_user_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [name, s(b.email, 160), s(b.phone, 40), s(b.current_title, 160), s(b.current_employer, 160), s(b.skills, 600), s(b.resume_summary, 2500) || null, s(b.source, 40) || 'API', owner.id, new Date().toISOString().slice(0, 10)]);
    const row = await get(`${RESOURCES.candidates} WHERE id = $1`, [r.rows[0].id]);
    emit('candidate.created', row);
    res.status(201).json(row);
  }));
}

// ---------- owner screens: keys and webhooks ----------
export function mountIntegrationsAdmin(app, ar, { requirePlan, requireOwner, blockDemo }) {
  const gate = [requirePlan('api'), requireOwner];

  app.get('/api/api-keys', ...gate, ar(async (_req, res) => {
    res.json(await all(`SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys WHERE revoked_at IS NULL ORDER BY id DESC`));
  }));
  app.post('/api/api-keys', ...gate, blockDemo, ar(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Give the key a name.', code: 'name_required' });
    if ((await get(`SELECT COUNT(*) AS n FROM api_keys WHERE revoked_at IS NULL`)).n >= 10) return res.status(409).json({ error: 'You can have up to 10 active keys. Revoke one first.', code: 'too_many' });
    const secret = `rk_${crypto.randomBytes(24).toString('base64url')}`;
    const row = (await run(`INSERT INTO api_keys (name, key_prefix, key_hash) VALUES ($1,$2,$3) RETURNING id, name, key_prefix, created_at`, [name, secret.slice(0, 9), sha(secret)])).rows[0];
    res.status(201).json({ ...row, key: secret }); // shown once, only the hash is kept
  }));
  app.delete('/api/api-keys/:id', ...gate, ar(async (req, res) => {
    const r = await run(`UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [Number(req.params.id) || 0]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  }));

  app.get('/api/webhooks/events', ...gate, (_req, res) => res.json(EVENTS));
  app.get('/api/webhooks', ...gate, ar(async (_req, res) => {
    const hooks = await all(`SELECT id, url, events, active, created_at FROM webhooks ORDER BY id DESC`);
    for (const h of hooks) h.last = await get(`SELECT event, status_code, ok, error, created_at FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY id DESC LIMIT 1`, [h.id]);
    res.json(hooks);
  }));
  app.post('/api/webhooks', ...gate, blockDemo, ar(async (req, res) => {
    const url = String(req.body?.url || '').trim();
    const bad = await checkUrl(url);
    if (bad) return res.status(400).json({ error: bad, code: 'invalid_url' });
    const wanted = Array.isArray(req.body?.events) ? req.body.events.filter((e) => EVENTS.includes(e)) : [];
    const events = wanted.length && wanted.length < EVENTS.length ? wanted.join(',') : '*';
    if ((await get(`SELECT COUNT(*) AS n FROM webhooks`)).n >= 10) return res.status(409).json({ error: 'You can have up to 10 webhooks.', code: 'too_many' });
    const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
    const row = (await run(`INSERT INTO webhooks (url, events, secret_enc) VALUES ($1,$2,$3) RETURNING id, url, events, active, created_at`, [url, events, encrypt(secret)])).rows[0];
    res.status(201).json({ ...row, secret }); // shown once
  }));
  app.patch('/api/webhooks/:id', ...gate, ar(async (req, res) => {
    const r = await run(`UPDATE webhooks SET active = $2 WHERE id = $1 RETURNING id, url, events, active, created_at`, [Number(req.params.id) || 0, !!req.body?.active]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  }));
  app.delete('/api/webhooks/:id', ...gate, ar(async (req, res) => {
    const r = await run(`DELETE FROM webhooks WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  }));
  app.post('/api/webhooks/:id/test', ...gate, blockDemo, ar(async (req, res) => {
    const hook = await get(`SELECT * FROM webhooks WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!hook) return res.status(404).json({ error: 'not found' });
    res.json(await deliver(hook, 'ping', JSON.stringify({ id: crypto.randomUUID(), event: 'ping', created_at: new Date().toISOString(), data: {} })));
  }));
  app.get('/api/webhooks/:id/deliveries', ...gate, ar(async (req, res) => {
    res.json(await all(`SELECT id, event, status_code, ok, error, attempts, created_at FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY id DESC LIMIT 20`, [Number(req.params.id) || 0]));
  }));
}
