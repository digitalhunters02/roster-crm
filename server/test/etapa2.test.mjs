// Etapa 2 (plano Essencial): portal do cliente, margem e fatura, e-mail/SMS com modelos, histórico com WhatsApp.
// Needs a local Postgres:  TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/etapa2.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const DB = `roster_e2_${process.pid}_${Date.now() % 100000}`;
const urlOf = (db) => ADMIN_URL.replace(/\/[^/]*$/, `/${db}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
const OUTBOX = path.join(os.tmpdir(), `roster-outbox-${process.pid}.jsonl`);
const SID = 'AC' + 'a1'.repeat(16), AUTH = 'twilio-auth-token-secret-1234';

let admin; const servers = []; let twilio, twilioHits = [];
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); s.on('error', reject); });

async function start(extraEnv = {}) {
  const port = await freePort();
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: urlOf(DB), JWT_SECRET: 'test-secret-test-secret-123',
    BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, BOOTSTRAP_OWNER_NAME: 'Olivia Owner',
    FRONTEND_URL: 'http://app.test', PUBLIC_URL: 'http://app.test', SMTP_HOST: '', AUTOMATION_EMAILS: '0',
  };
  for (const k of ['LICENSED_PLAN', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_API_BASE', 'ADMIN_SUMMARY_KEY', 'MAIL_OUTBOX_FILE']) delete env[k];
  Object.assign(env, extraEnv);
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; proc.stdout.on('data', (d) => { logs += d; }); proc.stderr.on('data', (d) => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const srv = {
    base, proc, logs: () => logs,
    stop: () => new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); }),
    async call(method, url, { token, body, headers, form } = {}) {
      const h = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
      const r = await fetch(base + url, { method, headers: h, body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* texto */ }
      return { status: r.status, json, text };
    },
  };
  servers.push(srv);
  srv.token = (await srv.call('POST', '/api/auth/login', { body: { email: OWNER.email, password: OWNER.pass } })).json?.token;
  return srv;
}
async function stop(srv) { await srv.stop(); servers.splice(servers.indexOf(srv), 1); }
async function sql(text, params) { const c = new pg.Client({ connectionString: urlOf(DB) }); await c.connect(); try { return (await c.query(text, params)).rows; } finally { await c.end(); } }
const outbox = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`CREATE DATABASE ${DB}`);
  const s = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: urlOf(DB) }, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  // fake Twilio: accepts only the right SID/token
  twilio = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
      const ok = req.headers.authorization === `Basic ${Buffer.from(`${SID}:${AUTH}`).toString('base64')}`;
      twilioHits.push({ method: req.method, url: req.url, ok, form: Object.fromEntries(new URLSearchParams(b)) });
      res.setHeader('Content-Type', 'application/json');
      if (!ok) { res.statusCode = 401; return res.end(JSON.stringify({ message: 'Authenticate' })); }
      if (req.method === 'POST') return res.end(JSON.stringify({ sid: 'SM' + crypto.randomBytes(8).toString('hex'), status: 'queued' }));
      res.end(JSON.stringify({ sid: SID }));
    });
  });
  await new Promise((r) => twilio.listen(0, '127.0.0.1', r));
});
after(async () => {
  for (const s of servers) if (s.proc.exitCode === null && s.proc.signalCode === null) await s.stop();
  twilio?.close();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.end(); fs.rmSync(OUTBOX, { force: true });
});

const ctx = {};

test('Basic plan: the client portal and messaging are closed, a portal link goes quiet', async () => {
  const s = await start({ LICENSED_PLAN: 'basico' });
  const T = s.token;
  const c = await s.call('POST', '/api/clients', { token: T, body: { company_name: 'Basic Co' } });
  assert.equal((await s.call('GET', `/api/clients/${c.json.id}/portal`, { token: T })).status, 402);
  assert.equal((await s.call('POST', `/api/clients/${c.json.id}/portal/enable`, { token: T })).status, 402);
  assert.equal((await s.call('GET', '/api/message-templates', { token: T })).status, 402);
  const cand = await s.call('POST', '/api/candidates', { token: T, body: { name: 'Basic Person', email: 'b@example.com' } });
  assert.equal((await s.call('POST', `/api/candidates/${cand.json.id}/messages`, { token: T, body: { channel: 'email', body: 'hi' } })).status, 402);
  // a link that was live on a higher plan stops working after a downgrade
  await sql(`UPDATE clients SET portal_token = 'tok_downgraded_aaaaaaaaaaaaaaaa', portal_enabled = TRUE WHERE id = $1`, [c.json.id]);
  const pub = await s.call('GET', '/api/portal/tok_downgraded_aaaaaaaaaaaaaaaa');
  assert.equal(pub.status, 404); assert.equal(pub.json.code, 'portal_unavailable');
  await stop(s);
});

test('Essential plan: portal link, shortlist without contact details, feedback and Activity entry', async () => {
  const s = await start({ LICENSED_PLAN: 'essencial', MAIL_OUTBOX_FILE: OUTBOX, TWILIO_API_BASE: `http://127.0.0.1:${twilio.address().port}` });
  ctx.s = s; const T = s.token;
  const cl = (await s.call('POST', '/api/clients', { token: T, body: { company_name: 'Acme Logistics', contact_name: 'Dana Client', contact_email: 'dana@acme.test' } })).json;
  const other = (await s.call('POST', '/api/clients', { token: T, body: { company_name: 'Other Co', contact_email: 'x@other.test' } })).json;
  const job = (await s.call('POST', '/api/jobs', { token: T, body: { client_id: cl.id, title: 'Forklift Operator' } })).json;
  const job2 = (await s.call('POST', '/api/jobs', { token: T, body: { client_id: other.id, title: 'Cook' } })).json;
  const cand = (await s.call('POST', '/api/candidates', { token: T, body: { name: 'Maria Silva', email: 'maria@example.com', phone: '(512) 555-0142', current_title: 'Forklift driver', current_employer: 'Secret Employer LLC', skills: 'forklift, OSHA' } })).json;
  const today = new Date().toISOString().slice(0, 10);
  const sub = (await s.call('POST', '/api/submissions', { token: T, body: { candidate_id: cand.id, job_id: job.id, stage: 'Submitted to Client', owner_user_id: cand.owner_user_id, submitted_date: today } })).json;
  const hidden = (await s.call('POST', '/api/submissions', { token: T, body: { candidate_id: cand.id, job_id: job.id, stage: 'Screened', owner_user_id: cand.owner_user_id, submitted_date: today } })).json;
  const foreign = (await s.call('POST', '/api/submissions', { token: T, body: { candidate_id: cand.id, job_id: job2.id, stage: 'Submitted to Client', owner_user_id: cand.owner_user_id, submitted_date: today } })).json;
  Object.assign(ctx, { cl, other, job, cand, sub, hidden, foreign });

  assert.deepEqual((await s.call('GET', `/api/clients/${cl.id}/portal`, { token: T })).json.enabled, false);
  const en = await s.call('POST', `/api/clients/${cl.id}/portal/enable`, { token: T });
  assert.equal(en.status, 200); assert.equal(en.json.enabled, true); assert.ok(en.json.token.length >= 30);
  assert.equal(en.json.path, `/#/portal/${en.json.token}`);
  ctx.token = en.json.token;
  assert.equal((await s.call('POST', `/api/clients/${cl.id}/portal/enable`, { token: T })).json.token, ctx.token, 'enable again keeps the same link');

  const page = await s.call('GET', `/api/portal/${ctx.token}`);
  assert.equal(page.status, 200, page.text);
  assert.equal(page.json.client.company_name, 'Acme Logistics');
  assert.equal(page.json.candidates.length, 1, 'only stages the client should see, only their own jobs');
  const row = page.json.candidates[0];
  assert.equal(row.name, 'Maria Silva'); assert.equal(row.job_title, 'Forklift Operator');
  assert.ok(!page.text.includes('maria@example.com') && !page.text.includes('555-0142') && !page.text.includes('Secret Employer'), 'no contact details or employer');
  assert.equal((await s.call('GET', '/api/portal/short')).status, 404);

  // feedback
  assert.equal((await s.call('POST', `/api/portal/${ctx.token}/feedback`, { body: { submission_id: sub.id, decision: 'maybe' } })).status, 400);
  assert.equal((await s.call('POST', `/api/portal/${ctx.token}/feedback`, { body: { submission_id: foreign.id, decision: 'interested' } })).status, 404, 'another client\'s candidate');
  assert.equal((await s.call('POST', `/api/portal/${ctx.token}/feedback`, { body: { submission_id: hidden.id, decision: 'interested' } })).status, 404, 'not shown stage');
  const fb = await s.call('POST', `/api/portal/${ctx.token}/feedback`, { body: { submission_id: sub.id, decision: 'interested', note: 'Can she start Monday?', by_name: 'Dana' } });
  assert.equal(fb.status, 200, fb.text);
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}`)).json.candidates[0].decision, 'interested');
  const staff = (await s.call('GET', `/api/clients/${cl.id}/portal`, { token: T })).json;
  assert.equal(staff.feedback[0].decision, 'interested'); assert.equal(staff.feedback[0].candidate_name, 'Maria Silva');
  const acts = (await s.call('GET', '/api/activities', { token: T })).json;
  assert.ok(acts.some((a) => a.type === 'Portal' && /interested in Maria Silva/.test(a.subject)), 'shows in the Activity feed');

  // rotate / disable
  const rot = await s.call('POST', `/api/clients/${cl.id}/portal/rotate`, { token: T });
  assert.notEqual(rot.json.token, ctx.token);
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}`)).status, 404, 'the old link is dead');
  ctx.token = rot.json.token;
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}`)).status, 200);
  await s.call('POST', `/api/clients/${cl.id}/portal/disable`, { token: T });
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}`)).status, 404);
  assert.equal((await s.call('POST', `/api/clients/${cl.id}/portal/explode`, { token: T })).status, 400);
  await s.call('POST', `/api/clients/${cl.id}/portal/enable`, { token: T });
});

test('timesheets: amount from the bill rate, cost and margin, invoice data, client approval and dispute', async () => {
  const s = ctx.s, T = s.token;
  const today = new Date().toISOString().slice(0, 10);
  const pl = (await s.call('POST', '/api/placements', { token: T, body: { submission_id: ctx.sub.id, candidate_id: ctx.cand.id, client_id: ctx.cl.id, job_id: ctx.job.id, start_date: today, pay_rate: 20, bill_rate: 30, placement_fee: 0, status: 'Active' } })).json;
  // amount left blank -> hours x bill rate
  const ts = await s.call('POST', '/api/timesheets', { token: T, body: { placement_id: pl.id, period_start: '2026-09-01', period_end: '2026-09-14', hours: 80, status: 'Draft' } });
  assert.equal(ts.status, 201, ts.text);
  assert.equal(ts.json.amount, 2400); assert.equal(ts.json.cost, 1600); assert.equal(ts.json.margin, 800);
  assert.equal(ts.json.pay_rate, 20); assert.equal(ts.json.bill_rate, 30);
  ctx.ts = ts.json;
  // a hand-typed amount still wins
  const manual = await s.call('POST', '/api/timesheets', { token: T, body: { placement_id: pl.id, period_start: '2026-09-15', period_end: '2026-09-28', hours: 10, amount: 500, status: 'Draft' } });
  assert.equal(manual.json.amount, 500); assert.equal(manual.json.margin, 300);

  // a draft is invisible to the client
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}`)).json.timesheets.length, 0);
  const inv = (await s.call('GET', `/api/timesheets/${ts.json.id}/invoice`, { token: T })).json;
  assert.equal(inv.number, `INV-${String(ts.json.id).padStart(4, '0')}`);
  assert.equal(inv.total, 2400); assert.equal(inv.line.hours, 80); assert.equal(inv.line.rate, 30);
  assert.equal(inv.client.company_name, 'Acme Logistics'); assert.equal(inv.due_date, '2026-09-29');
  assert.equal((await s.call('GET', '/api/timesheets/99999/invoice', { token: T })).status, 404);

  // payment link on the agency profile: only http(s)
  assert.equal((await s.call('PUT', '/api/company-profile', { token: T, body: { payment_url: 'javascript:alert(1)' } })).status, 400);
  const prof = await s.call('PUT', '/api/company-profile', { token: T, body: { name: 'Crestline Talent', email: 'billing@crestline.test', payment_url: 'https://pay.crestline.test/invoice', payment_note: 'Net 15. ACH details on request.' } });
  assert.equal(prof.status, 200, prof.text);
  assert.equal((await s.call('GET', `/api/timesheets/${ts.json.id}/invoice`, { token: T })).json.payment_url, 'https://pay.crestline.test/invoice');

  // send the invoice: needs the portal, sets Sent, e-mails the portal link
  await s.call('POST', `/api/clients/${ctx.cl.id}/portal/disable`, { token: T });
  const no = await s.call('POST', `/api/timesheets/${ts.json.id}/send-invoice`, { token: T });
  assert.equal(no.status, 409); assert.equal(no.json.code, 'portal_disabled');
  await s.call('POST', `/api/clients/${ctx.cl.id}/portal/enable`, { token: T });
  const sent = await s.call('POST', `/api/timesheets/${ts.json.id}/send-invoice`, { token: T });
  assert.equal(sent.status, 200, sent.text); assert.equal(sent.json.status, 'Sent'); assert.ok(sent.json.invoice_sent_at);
  const mail = outbox().at(-1);
  assert.equal(mail.to[0].address, 'dana@acme.test');
  assert.ok(mail.text.includes(`http://app.test/#/portal/${ctx.token}`), 'portal link in the e-mail');
  assert.ok(mail.text.includes('Pay online: https://pay.crestline.test/invoice'));
  assert.match(mail.subject, /^Invoice INV-\d{4} from Crestline Talent$/);
  assert.equal(mail.replyTo?.[0]?.address ?? mail.replyTo, 'billing@crestline.test');

  // the client sees it now
  const page = (await s.call('GET', `/api/portal/${ctx.token}`)).json;
  assert.equal(page.timesheets.length, 1); assert.equal(page.timesheets[0].amount, 2400);
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}/invoices/${ts.json.id}`)).json.total, 2400);
  const manualInv = manual.json.id;
  assert.equal((await s.call('GET', `/api/portal/${ctx.token}/invoices/${manualInv}`)).status, 404, 'a draft invoice is not readable through the portal');

  // approve / dispute
  const A = `/api/portal/${ctx.token}/timesheets/${ts.json.id}`;
  assert.equal((await s.call('POST', `${A}/approve`, { body: {} })).status, 400, 'type your name');
  assert.equal((await s.call('POST', `${A}/dispute`, { body: { note: ' ' } })).status, 400);
  assert.equal((await s.call('POST', `${A}/approve`, { body: { by_name: 'Dana Client' } })).status, 200);
  let row = (await s.call('GET', '/api/timesheets', { token: T })).json.find((r) => r.id === ts.json.id);
  assert.equal(row.client_approved_by, 'Dana Client'); assert.ok(row.client_approved_at);
  // the agency changes the hours: the approval no longer stands
  await s.call('PUT', `/api/timesheets/${ts.json.id}`, { token: T, body: { placement_id: pl.id, period_start: '2026-09-01', period_end: '2026-09-14', hours: 76, status: 'Sent' } });
  row = (await s.call('GET', '/api/timesheets', { token: T })).json.find((r) => r.id === ts.json.id);
  assert.equal(row.amount, 2280); assert.equal(row.client_approved_at, null);
  assert.equal((await s.call('POST', `${A}/dispute`, { body: { note: 'Hours look high on Friday', by_name: 'Dana' } })).status, 200);
  row = (await s.call('GET', '/api/timesheets', { token: T })).json.find((r) => r.id === ts.json.id);
  assert.equal(row.client_dispute_note, 'Hours look high on Friday');
  const acts = (await s.call('GET', '/api/activities', { token: T })).json;
  assert.ok(acts.some((a) => /disputed INV-/.test(a.subject)) && acts.some((a) => /approved INV-/.test(a.subject)));
  // paid invoices cannot be touched by the client
  await sql(`UPDATE timesheets_invoices SET status = 'Paid' WHERE id = $1`, [ts.json.id]);
  assert.equal((await s.call('POST', `${A}/approve`, { body: { by_name: 'Dana Client' } })).status, 409);
  // another client's token cannot reach this timesheet
  const ot = (await s.call('POST', `/api/clients/${ctx.other.id}/portal/enable`, { token: T })).json.token;
  assert.equal((await s.call('POST', `/api/portal/${ot}/timesheets/${ts.json.id}/approve`, { body: { by_name: 'Eve Hacker' } })).status, 404);
  assert.equal((await s.call('GET', `/api/portal/${ot}/invoices/${ts.json.id}`)).status, 404);
});

test('templates, preview with placeholders, e-mail send and history', async () => {
  const s = ctx.s, T = s.token;
  const tpls = (await s.call('GET', '/api/message-templates', { token: T })).json;
  assert.ok(tpls.length >= 5 && tpls.some((t) => t.name === 'Interview invitation'));
  const mine = await s.call('POST', '/api/message-templates', { token: T, body: { name: 'Offer follow-up', channel: 'sms', body: 'Hi {{first_name}}, any news on {{job_title}} at {{client}}?' } });
  assert.equal(mine.status, 201);
  assert.equal((await s.call('PUT', `/api/message-templates/${mine.json.id}`, { token: T, body: { name: 'Offer follow-up 2', channel: 'any', body: 'x {{name}}' } })).json.name, 'Offer follow-up 2');
  assert.equal((await s.call('POST', '/api/message-templates', { token: T, body: { name: '', body: '' } })).status, 400);
  assert.equal((await s.call('DELETE', `/api/message-templates/${mine.json.id}`, { token: T })).status, 204);
  assert.equal((await s.call('DELETE', `/api/message-templates/${mine.json.id}`, { token: T })).status, 404);

  const P = `/api/candidates/${ctx.cand.id}/messages`;
  const pv = await s.call('POST', `${P}/preview`, { token: T, body: { submission_id: ctx.sub.id, subject: 'Role at {{client}}', body: 'Hi {{first_name}}, {{recruiter}} from {{agency}}: {{job_title}} at {{client}}. {{unknown_thing}}' } });
  assert.equal(pv.json.subject, 'Role at Acme Logistics');
  assert.match(pv.json.body, /^Hi Maria, Olivia Owner from Crestline Talent: Forklift Operator at Acme Logistics\./);
  assert.deepEqual(pv.json.missing, ['unknown_thing']);

  // e-mail
  const em = await s.call('POST', P, { token: T, body: { submission_id: ctx.sub.id, channel: 'email', subject: 'Interview for {{job_title}}', body: 'Hi {{first_name}}, can you interview Monday?' } });
  assert.equal(em.status, 201, em.text);
  const mail = outbox().at(-1);
  assert.equal(mail.to[0].address, 'maria@example.com'); assert.equal(mail.subject, 'Interview for Forklift Operator');
  assert.equal(mail.from.name, 'Crestline Talent'); assert.equal(mail.text, 'Hi Maria, can you interview Monday?');
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'email', body: '  ' } })).status, 400);
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'fax', body: 'x' } })).status, 400);
  const hist = (await s.call('GET', P, { token: T })).json;
  assert.equal(hist.history.at(-1).channel, 'email'); assert.equal(hist.history.at(-1).direction, 'out');
  assert.equal(hist.channels.email.ready, true); assert.equal(hist.channels.sms.ready, false);
});

test('SMS through the agency\'s own Twilio: connect, send, replies, STOP / START, signature check', async () => {
  const s = ctx.s, T = s.token;
  const P = `/api/candidates/${ctx.cand.id}/messages`;
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'sms', body: 'hello' } })).json.code, 'sms_not_connected');

  const staffMade = await s.call('POST', '/api/accounts', { token: T, body: { name: 'Staff Sam', email: 'sam@example.com', password: 'Temp-pass-12345' } });
  assert.equal(staffMade.status, 201, staffMade.text);
  const sam = (await s.call('POST', '/api/auth/login', { body: { email: 'sam@example.com', password: 'Temp-pass-12345' } })).json.token;
  assert.equal((await s.call('POST', '/api/integrations/sms/connect', { token: sam, body: { account_sid: SID, auth_token: AUTH, from_number: '+15125550100' } })).status, 403, 'only the owner connects');

  const body = (o) => ({ account_sid: SID, auth_token: AUTH, from_number: '(512) 555-0100', ...o });
  assert.equal((await s.call('POST', '/api/integrations/sms/connect', { token: T, body: body({ account_sid: 'nope' }) })).json.code, 'invalid_sid');
  assert.equal((await s.call('POST', '/api/integrations/sms/connect', { token: T, body: body({ auth_token: 'short' }) })).json.code, 'invalid_token');
  assert.equal((await s.call('POST', '/api/integrations/sms/connect', { token: T, body: body({ from_number: '123' }) })).json.code, 'invalid_phone');
  const bad = await s.call('POST', '/api/integrations/sms/connect', { token: T, body: body({ auth_token: 'wrong-wrong-wrong-wrong' }) });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'twilio_rejected');
  const ok = await s.call('POST', '/api/integrations/sms/connect', { token: T, body: body() });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.from_number, '+15125550100');
  assert.ok(!ok.text.includes(AUTH), 'the token never comes back');
  const st = await s.call('GET', '/api/integrations/sms/status', { token: T });
  assert.equal(st.json.connected, true); assert.ok(!st.text.includes(AUTH)); assert.equal(st.json.webhook_url, 'http://app.test/api/integrations/sms/webhook');
  const stored = (await sql(`SELECT auth_token_enc FROM sms_connection`))[0].auth_token_enc;
  assert.ok(stored.startsWith('v1:') && !stored.includes(AUTH), 'encrypted at rest');

  // first message carries the opt-out line, the second does not
  twilioHits = [];
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'sms', body: 'Hi {{first_name}}, new shift Monday.' } })).status, 201);
  let hit = twilioHits.find((h) => h.method === 'POST');
  assert.equal(hit.ok, true); assert.equal(hit.form.To, '+15125550142'); assert.equal(hit.form.From, '+15125550100');
  assert.equal(hit.form.Body, 'Hi Maria, new shift Monday. Reply STOP to opt out.');
  twilioHits = [];
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'sms', body: 'Second one' } })).status, 201);
  assert.equal(twilioHits.find((h) => h.method === 'POST').form.Body, 'Second one');
  // bad phone
  const nophone = (await s.call('POST', '/api/candidates', { token: T, body: { name: 'No Phone', phone: '12' } })).json;
  assert.equal((await s.call('POST', `/api/candidates/${nophone.id}/messages`, { token: T, body: { channel: 'sms', body: 'hi' } })).json.code, 'no_contact');

  // webhook: signature
  const URL_ = 'http://app.test/api/integrations/sms/webhook';
  const sign = (params) => crypto.createHmac('sha1', AUTH).update(URL_ + Object.keys(params).sort().map((k) => k + params[k]).join('')).digest('base64');
  const reply = (Body) => { const p = { From: '+15125550142', To: '+15125550100', Body, MessageSid: 'SM' + crypto.randomBytes(6).toString('hex') }; return s.call('POST', '/api/integrations/sms/webhook', { form: p, headers: { 'X-Twilio-Signature': sign(p) } }); };
  const forged = await s.call('POST', '/api/integrations/sms/webhook', { form: { From: '+15125550142', Body: 'STOP' }, headers: { 'X-Twilio-Signature': 'AAAA' } });
  assert.equal(forged.status, 403);
  assert.equal((await s.call('POST', '/api/integrations/sms/webhook', { form: { From: '+15125550142', Body: 'STOP' } })).status, 403, 'no signature at all');
  assert.equal((await sql(`SELECT sms_opt_out FROM candidates WHERE id = $1`, [ctx.cand.id]))[0].sms_opt_out, false);

  const r1 = await reply('Sounds good, I can start Monday');
  assert.equal(r1.status, 200); assert.match(r1.text, /<Response>/);
  let hist = (await s.call('GET', P, { token: T })).json.history;
  assert.ok(hist.some((h) => h.channel === 'sms' && h.direction === 'in' && /start Monday/.test(h.body)), 'the reply shows in the history');

  await reply('STOP');
  assert.equal((await sql(`SELECT sms_opt_out FROM candidates WHERE id = $1`, [ctx.cand.id]))[0].sms_opt_out, true);
  const blocked = await s.call('POST', P, { token: T, body: { channel: 'sms', body: 'still there?' } });
  assert.equal(blocked.status, 409); assert.equal(blocked.json.code, 'sms_opt_out');
  assert.equal((await s.call('GET', P, { token: T })).json.channels.sms.opted_out, true);
  await reply('START');
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'sms', body: 'welcome back' } })).status, 201);

  // WhatsApp history merges by the last 10 digits
  await sql(`INSERT INTO whatsapp_messages (id, wa_message_id, contact_phone, direction, body, status) VALUES ('w1', 'wamid.1', '15125550142', 'in', 'Hello from WhatsApp', 'received')`);
  hist = (await s.call('GET', P, { token: T })).json.history;
  assert.ok(hist.some((h) => h.channel === 'whatsapp' && h.body === 'Hello from WhatsApp'));
  assert.deepEqual(hist.map((h) => h.created_at), [...hist.map((h) => h.created_at)].sort((a, b) => new Date(a) - new Date(b)), 'oldest first');
  assert.equal((await s.call('POST', P, { token: T, body: { channel: 'whatsapp', body: 'hi' } })).json.code, 'whatsapp_not_connected');

  // disconnect
  assert.equal((await s.call('POST', '/api/integrations/sms/disconnect', { token: T })).json.connected, false);
  assert.equal((await s.call('POST', '/api/integrations/sms/webhook', { form: { From: '+1', Body: 'x' } })).status, 404);
});

test('portal write endpoints are rate limited', async () => {
  const s = ctx.s;
  let last;
  for (let i = 0; i < 25; i++) last = await s.call('POST', '/api/portal/nope_nope_nope_nope_nope_nope/feedback', { body: { decision: 'pass' } });
  assert.equal(last.status, 429);
  await stop(s);
});

test('free trial accounts cannot generate links or send messages', async () => {
  const s = await start({ LICENSED_PLAN: 'completo' });
  const r = await s.call('POST', '/api/demo-request', { body: { name: 'Pat Prospect', email: 'pat@prospect.test' } });
  assert.equal(r.status, 201, r.text);
  const D = r.json.token;
  const clients = (await s.call('GET', '/api/clients', { token: D })).json;
  const target = clients[0] || (await s.call('POST', '/api/clients', { token: D, body: { company_name: 'X' } })).json;
  assert.equal((await s.call('POST', `/api/clients/${target.id}/portal/enable`, { token: D })).json.code, 'demo_blocked');
  const cands = (await s.call('GET', '/api/candidates', { token: D })).json;
  const one = cands[0] || (await s.call('POST', '/api/candidates', { token: D, body: { name: 'Y', email: 'y@example.com' } })).json;
  assert.equal((await s.call('POST', `/api/candidates/${one.id}/messages`, { token: D, body: { channel: 'email', body: 'hi' } })).json.code, 'demo_blocked');
  assert.equal((await s.call('POST', '/api/integrations/sms/connect', { token: D, body: {} })).status, 403);
  await stop(s);
});
