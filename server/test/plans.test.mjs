// Plans, limits, Stripe billing (with the product tag), the 3-day free trial, real automations, relative dates and resume reading.
// Needs a local Postgres; creates (and drops) throwaway databases and runs the real server as a child process.
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/plans.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const mk = (tag) => `roster_${tag}_${process.pid}_${Date.now() % 100000}`;
const EMPTY_DB = mk('empty'), SAMPLE_DB = mk('sample');
const urlOf = (db) => ADMIN_URL.replace(/\/[^/]*$/, `/${db}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
const WHSEC = 'whsec_roster_test';

let admin; const servers = []; const dbs = [];
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); s.on('error', reject); });

async function start(db, extraEnv = {}) {
  const port = await freePort();
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: urlOf(db), JWT_SECRET: 'test-secret-test-secret-123',
    BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, BOOTSTRAP_OWNER_NAME: 'Olivia Owner',
    FRONTEND_URL: 'http://app.test', SMTP_HOST: '', AUTOMATION_EMAILS: '0',
  };
  for (const k of ['LICENSED_PLAN', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_API_BASE', 'ADMIN_SUMMARY_KEY']) delete env[k];
  Object.assign(env, extraEnv);
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; proc.stdout.on('data', (d) => { logs += d; }); proc.stderr.on('data', (d) => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const srv = {
    base, proc, logs: () => logs,
    stop: () => new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); }),
    async call(method, url, { token, body, headers, raw } = {}) {
      const r = await fetch(base + url, { method, headers: { ...(body || raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* texto */ }
      return { status: r.status, json, text };
    },
  };
  servers.push(srv);
  srv.token = (await srv.call('POST', '/api/auth/login', { body: { email: OWNER.email, password: OWNER.pass } })).json?.token;
  return srv;
}
async function stop(srv) { await srv.stop(); servers.splice(servers.indexOf(srv), 1); }
async function sql(db, text, params) { const c = new pg.Client({ connectionString: urlOf(db) }); await c.connect(); try { return (await c.query(text, params)).rows; } finally { await c.end(); } }

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  for (const db of [EMPTY_DB, SAMPLE_DB]) { await admin.query(`CREATE DATABASE ${db}`); dbs.push(db); }
  const seed = (db, flag) => spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: urlOf(db), ...(flag ? { SEED_SAMPLE_DATA: '1' } : {}) }, encoding: 'utf8' });
  assert.equal(seed(EMPTY_DB, false).status, 0);
  const s2 = seed(SAMPLE_DB, true); assert.equal(s2.status, 0, s2.stderr);
});
after(async () => {
  for (const s of servers) if (s.proc.exitCode === null && s.proc.signalCode === null) await s.stop();
  for (const db of dbs) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await admin.end();
});

// ---------------------------------------------------------------- empty install, no limits
test('a customer install starts empty (no sample data) and the owner is also a recruiter', async () => {
  const s = await start(EMPTY_DB);
  assert.equal((await sql(EMPTY_DB, `SELECT COUNT(*)::int n FROM clients`))[0].n, 0, 'no sample clients');
  const users = (await s.call('GET', '/api/users', { token: s.token })).json;
  assert.equal(users.length, 1); assert.equal(users[0].name, 'Olivia Owner'); assert.equal(users[0].initials, 'OO');
  // only a name is needed for a candidate / company / job; the owner is filled in
  const c = await s.call('POST', '/api/clients', { token: s.token, body: { company_name: 'Acme Staffing Client' } });
  assert.equal(c.status, 201, c.text); assert.equal(c.json.owner_name, 'Olivia Owner');
  const cand = await s.call('POST', '/api/candidates', { token: s.token, body: { name: 'Maria Silva' } });
  assert.equal(cand.status, 201, cand.text);
  const job = await s.call('POST', '/api/jobs', { token: s.token, body: { client_id: c.json.id, title: 'Warehouse Associate' } });
  assert.equal(job.status, 201, job.text); assert.equal(job.json.status, 'Open');
  // dashboard on an empty-ish database does not break and uses today's dates
  const d = (await s.call('GET', '/api/dashboard', { token: s.token })).json;
  assert.equal(d.kpis.openJobs, 1); assert.equal(d.ranges.today, new Date().toISOString().slice(0, 10));
  assert.ok(d.ranges.weekStart <= d.ranges.today && d.ranges.today <= d.ranges.weekEnd);
  await stop(s);
});

test('plan tables: prices 79 / 149 / 269, yearly = 12 x monthly x 0.90 to the cent, nothing locked without Stripe', async () => {
  const s = await start(EMPTY_DB);
  const st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.deepEqual(st.prices.basico, { month: 79, year: 853.2 });
  assert.deepEqual(st.prices.essencial, { month: 149, year: 1609.2 });
  assert.deepEqual(st.prices.completo, { month: 269, year: 2905.2 });
  assert.equal(st.annualDiscount, 0.1); assert.equal(st.plan, 'completo'); assert.equal(st.source, 'open'); assert.equal(st.configured, false);
  assert.equal((await s.call('GET', '/api/timesheets', { token: s.token })).status, 200);
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'basico' } })).status, 400, 'no Stripe configured');
  await stop(s);
});

// ---------------------------------------------------------------- licensed Basic plan: limits and locked areas
test('Basic plan: timesheets and WhatsApp are locked, and users / open jobs / automations / candidates stop at the limit', async () => {
  const s = await start(EMPTY_DB, { LICENSED_PLAN: 'basico' });
  const T = s.token;
  const st = (await s.call('GET', '/api/billing/status', { token: T })).json;
  assert.equal(st.plan, 'basico'); assert.equal(st.source, 'licensed');
  assert.deepEqual(st.limits, { users: 3, candidates: 1000, openJobs: 25, automations: 2 });
  assert.equal(st.features.timesheets, false); assert.equal(st.features.whatsapp, false);
  const ts = await s.call('GET', '/api/timesheets', { token: T });
  assert.equal(ts.status, 402); assert.equal(ts.json.requiredPlan, 'essencial'); assert.equal(ts.json.code, 'plan_required');
  assert.equal((await s.call('GET', '/api/integrations/whatsapp/conversations', { token: T })).status, 402);
  assert.equal((await s.call('GET', '/api/integrations/whatsapp/status', { token: T })).status, 200, 'the status stays readable so the screen can explain the lock');

  // users: owner + 2 staff fit, the 4th login does not
  const mkStaff = (n) => s.call('POST', '/api/accounts', { token: T, body: { name: `Staff ${n}`, email: `staff${n}@example.com`, password: 'Temp-pass-12345' } });
  assert.equal((await mkStaff(1)).status, 201); assert.equal((await mkStaff(2)).status, 201);
  const over = await mkStaff(3);
  assert.equal(over.status, 402); assert.equal(over.json.code, 'plan_limit'); assert.equal(over.json.limitKind, 'users'); assert.equal(over.json.requiredPlan, 'essencial');
  assert.equal((await s.call('GET', '/api/users', { token: T })).json.length >= 3, true, 'each login became a recruiter');

  // automations: 2 active rules on Basic
  const client = (await s.call('POST', '/api/clients', { token: T, body: { company_name: 'Limit Co' } })).json;
  assert.equal((await s.call('POST', '/api/automations', { token: T, body: { name: 'No trigger' } })).status, 400, 'a rule needs a trigger');
  const rule = (n, t) => s.call('POST', '/api/automations', { token: T, body: { name: `Rule ${n}`, trigger_type: t } });
  assert.equal((await rule(1, 'submission_submitted')).status, 201);
  const r2 = await rule(2, 'job_open_30d'); assert.equal(r2.status, 201);
  const r3 = await rule(3, 'interview_completed'); assert.equal(r3.status, 402); assert.equal(r3.json.limitKind, 'automations');
  assert.equal((await s.call('POST', '/api/automations', { token: T, body: { name: 'Paused', trigger_type: 'candidate_referral', active: false } })).status, 201, 'a paused rule does not count');

  // open jobs: 25
  await sql(EMPTY_DB, `INSERT INTO jobs (client_id, title, employment_type, pay_range, location, status, owner_user_id, opened_date)
    SELECT $1, 'Job ' || g, 'Contract', '', '', 'Open', (SELECT id FROM users LIMIT 1), '2026-10-01' FROM generate_series(1, 24) g`, [client.id]);
  const openCount = (await sql(EMPTY_DB, `SELECT COUNT(*)::int n FROM jobs WHERE status = 'Open'`))[0].n;
  assert.ok(openCount >= 24);
  const need = 25 - openCount;
  for (let i = 0; i < need; i++) assert.equal((await s.call('POST', '/api/jobs', { token: T, body: { client_id: client.id, title: `Extra ${i}` } })).status, 201);
  const j26 = await s.call('POST', '/api/jobs', { token: T, body: { client_id: client.id, title: 'One too many' } });
  assert.equal(j26.status, 402); assert.equal(j26.json.limitKind, 'openJobs');
  assert.equal((await s.call('POST', '/api/jobs', { token: T, body: { client_id: client.id, title: 'Closed one', status: 'Filled' } })).status, 201, 'a filled job does not count');

  // candidates: 1000
  const have = (await sql(EMPTY_DB, `SELECT COUNT(*)::int n FROM candidates`))[0].n;
  await sql(EMPTY_DB, `INSERT INTO candidates (name, email, phone, current_title, current_employer, skills, source, owner_user_id, created_at)
    SELECT 'C' || g, '', '', '', '', '', 'Direct', (SELECT id FROM users LIMIT 1), '2026-10-01' FROM generate_series(1, $1::int) g`, [1000 - have]);
  const c1001 = await s.call('POST', '/api/candidates', { token: T, body: { name: 'Number 1001' } });
  assert.equal(c1001.status, 402); assert.equal(c1001.json.limitKind, 'candidates');
  await stop(s);
  // a bigger plan lifts the limits on the same data
  const e = await start(EMPTY_DB, { LICENSED_PLAN: 'essencial' });
  assert.equal((await e.call('GET', '/api/timesheets', { token: e.token })).status, 200);
  assert.equal((await e.call('POST', '/api/candidates', { token: e.token, body: { name: 'Number 1001' } })).status, 201);
  assert.equal((await e.call('GET', '/api/billing/status', { token: e.token })).json.limits.users, 8);
  await stop(e);
});

// ---------------------------------------------------------------- Stripe: checkout, webhook with the product tag
test('Stripe checkout uses the monthly or yearly price and tags the product; the webhook ignores other products', async () => {
  const seen = [];
  const stripe = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      seen.push({ url: req.url, body: Object.fromEntries(new URLSearchParams(b)) });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url.startsWith('/v1/checkout/sessions')) return res.end(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }));
      if (req.url.startsWith('/v1/billing_portal')) return res.end(JSON.stringify({ url: 'https://portal.stripe.test/p' }));
      res.end('{}');
    });
  });
  await new Promise((r) => stripe.listen(0, '127.0.0.1', r));
  const s = await start(EMPTY_DB, {
    STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_API_BASE: `http://127.0.0.1:${stripe.address().port}`,
    STRIPE_PRICE_BASICO: 'price_b', STRIPE_PRICE_ESSENCIAL: 'price_e', STRIPE_PRICE_COMPLETO: 'price_c', STRIPE_PRICE_ESSENCIAL_ANUAL: 'price_ea',
    ADMIN_SUMMARY_KEY: 'k'.repeat(24),
  });
  const T = s.token;
  const st0 = (await s.call('GET', '/api/billing/status', { token: T })).json;
  assert.equal(st0.configured, true); assert.deepEqual(st0.yearlyAvailable, { basico: false, essencial: true, completo: false });
  const lastCheckout = () => seen.filter((c) => c.url.startsWith('/v1/checkout/sessions')).at(-1)?.body;
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: T, body: { plan: 'essencial' } })).json.url, 'https://checkout.stripe.test/cs_1');
  let b = lastCheckout();
  assert.equal(b['line_items[0][price]'], 'price_e'); assert.equal(b['metadata[interval]'], 'month');
  assert.equal(b['metadata[product]'], 'roster'); assert.equal(b['subscription_data[metadata][product]'], 'roster');
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: T, body: { plan: 'essencial', interval: 'year' } })).status, 200);
  b = lastCheckout(); assert.equal(b['line_items[0][price]'], 'price_ea'); assert.equal(b['metadata[interval]'], 'year');
  const noYear = await s.call('POST', '/api/billing/checkout', { token: T, body: { plan: 'basico', interval: 'year' } });
  assert.equal(noYear.status, 400); assert.match(noYear.json.error, /yearly price/i);
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: T, body: { plan: 'gold' } })).status, 400);
  assert.equal((await s.call('POST', '/api/billing/portal', { token: T })).status, 400, 'nothing to manage yet');

  const sign = (raw) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac('sha256', WHSEC).update(`${t}.${raw}`).digest('hex')}`; };
  const hook = (event, sig) => { const raw = JSON.stringify(event); return s.call('POST', '/api/billing/webhook', { raw, headers: { 'stripe-signature': sig ?? sign(raw) } }); };
  const status = async () => (await s.call('GET', '/api/billing/status', { token: T })).json;
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: {} } }, 't=1,v1=00')).status, 400, 'bad signature');
  // another product of the same Stripe account
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', customer: 'cus_x', subscription: 'sub_x', metadata: { plan: 'basico', interval: 'month', product: 'binder' } } } });
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_y', customer: 'cus_y', subscription: 'sub_y', metadata: {} } } });
  assert.equal((await status()).source, 'open', 'foreign and unknown events change nothing');
  // our own purchase: yearly Essential
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_own', customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'essencial', interval: 'year', product: 'roster' } } } })).status, 200);
  let st = await status();
  assert.equal(st.plan, 'essencial'); assert.equal(st.source, 'stripe'); assert.equal(st.interval, 'year'); assert.equal(st.limits.users, 8);
  assert.equal((await s.call('GET', '/api/timesheets', { token: T })).status, 200);
  await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'canceled', metadata: { product: 'binder' }, items: { data: [] } } } });
  assert.equal((await status()).status, 'active', 'an update of another product does not touch our subscription');
  // downgrade by the customer portal: monthly Basic
  await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_b', recurring: { interval: 'month' } } }] } } } });
  st = await status(); assert.equal(st.plan, 'basico'); assert.equal(st.interval, 'month');
  assert.equal((await s.call('GET', '/api/timesheets', { token: T })).status, 402);
  // canceled: back to the Basic limits, the data stays
  await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
  st = await status(); assert.equal(st.status, 'canceled'); assert.equal(st.plan, 'basico');
  // a staff login cannot start a purchase (earlier tests left staff logins on this database: make room under the Basic limit)
  await sql(EMPTY_DB, `DELETE FROM accounts WHERE email LIKE 'staff%@example.com'`);
  await s.call('POST', '/api/accounts', { token: T, body: { name: 'Staff', email: 'staff@example.com', password: 'Temp-pass-12345' } });
  const staffTok = (await s.call('POST', '/api/auth/login', { body: { email: 'staff@example.com', password: 'Temp-pass-12345' } })).json.token;
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: staffTok, body: { plan: 'basico' } })).status, 403);
  await stop(s); stripe.close();
});

// ---------------------------------------------------------------- 3-day free trial
test('free trial: a temporary login on the sample data, rate limited, no AI or outgoing messages, ends after 3 days', async () => {
  const s = await start(SAMPLE_DB);
  const r = await s.call('POST', '/api/demo-request', { body: { name: 'Pat Prospect', email: 'Pat@Prospect.com' } });
  assert.equal(r.status, 201, r.text); assert.ok(r.json.token); assert.equal(r.json.account.isDemoTrial, true);
  const exp = new Date(r.json.account.demoExpiresAt).getTime() - Date.now();
  assert.ok(exp > 2.9 * 86400000 && exp < 3.1 * 86400000, 'about 3 days');
  const T = r.json.token;
  assert.equal((await s.call('GET', '/api/clients', { token: T })).status, 200, 'works on the sample data');
  assert.equal((await s.call('POST', '/api/photo-import/extract', { token: T, body: {} })).status, 403);
  const send = await s.call('POST', '/api/integrations/whatsapp/send', { token: T, body: { to: '+15551234567', body: 'hi' } });
  assert.equal(send.status, 403); assert.equal(send.json.code, 'demo_blocked');
  assert.equal((await s.call('GET', '/api/accounts', { token: T })).status, 403, 'staff-only: not an owner');
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: T, body: { plan: 'basico' } })).status, 403);
  // same person coming back mid-trial: same account, same countdown
  const again = await s.call('POST', '/api/demo-request', { body: { name: 'Pat', email: 'pat@prospect.com' } });
  assert.equal(again.status, 200); assert.equal(again.json.account.id, r.json.account.id);
  // a real customer's email is never overwritten
  assert.equal((await s.call('POST', '/api/demo-request', { body: { name: 'X', email: OWNER.email } })).status, 409);
  assert.equal((await s.call('POST', '/api/demo-request', { body: { name: 'X', email: 'nope' } })).status, 400);
  // trial logins do not count as users, and do not become recruiters
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token })).json.usage.users, 1);
  assert.equal((await sql(SAMPLE_DB, `SELECT COUNT(*)::int n FROM users WHERE lower(email) = 'pat@prospect.com'`))[0].n, 0);
  // time is up: the hourly cleanup removes the login (run the same function here)
  await sql(SAMPLE_DB, `UPDATE accounts SET demo_expires_at = now() - interval '1 minute' WHERE is_demo_trial`);
  process.env.DATABASE_URL = urlOf(SAMPLE_DB);
  const { cleanupExpiredDemoTrials } = await import('../src/demoTrial.js');
  assert.equal(await cleanupExpiredDemoTrials(), 1);
  await (await import('../src/db.js')).default.end(); // this process's own connection: close it before the database is dropped
  assert.equal((await s.call('GET', '/api/clients', { token: T })).status, 401, 'the old token stops working');
  // rate limit: 5 per window per address
  for (let i = 0; i < 6; i++) await s.call('POST', '/api/demo-request', { body: { name: 'Bot', email: `bot${i}@x.com` } });
  assert.equal((await s.call('POST', '/api/demo-request', { body: { name: 'Bot', email: 'bot9@x.com' } })).status, 429);
  await stop(s);
});

// ---------------------------------------------------------------- automations, dates, resume
test('sample dates follow the calendar; the dashboard counts what its ranges say', async () => {
  const s = await start(SAMPLE_DB);
  const d = (await s.call('GET', '/api/dashboard', { token: s.token })).json;
  const { weekStart, weekEnd, recentFrom, today } = d.ranges;
  assert.equal(today, new Date().toISOString().slice(0, 10));
  const n = async (text, p) => (await sql(SAMPLE_DB, text, p))[0].n;
  assert.equal(d.kpis.interviewsThisWeek, await n(`SELECT COUNT(*)::int n FROM interviews WHERE substr(scheduled_at,1,10) BETWEEN $1 AND $2`, [weekStart, weekEnd]));
  assert.equal(d.kpis.placementsRecent, await n(`SELECT COUNT(*)::int n FROM placements WHERE start_date BETWEEN $1 AND $2`, [recentFrom, today]));
  assert.ok(d.openJobsAging.every((j) => j.days_open >= 0), 'no job opened in the future');
  assert.equal((await sql(SAMPLE_DB, `SELECT value FROM app_meta WHERE key = 'sample_anchor'`))[0].value, today, 'the sample was moved up to today');
  await stop(s);
});

test('automations really run: a stage change, a finished interview and the daily checks write the Activity log once', async () => {
  const s = await start(SAMPLE_DB);
  const T = s.token;
  const rules = (await s.call('GET', '/api/automations', { token: T })).json;
  assert.ok(rules.every((r) => r.trigger_type || r.name), 'rules listed');
  assert.ok(rules.filter((r) => r.runnable).length >= 4, 'the sample rules were mapped to real triggers');
  const byTrigger = (t) => rules.find((r) => r.trigger_type === t);
  assert.ok(byTrigger('submission_submitted').active === 1);
  const activities = async () => (await s.call('GET', '/api/activities', { token: T })).json;

  // 1) submission moved to "Submitted to Client"
  const subs = (await s.call('GET', '/api/submissions', { token: T })).json;
  const target = subs.find((x) => x.stage === 'Screened') || subs.find((x) => x.stage !== 'Submitted to Client');
  assert.ok(target, 'a submission to move');
  const before = (await activities()).filter((a) => a.type === 'Automation').length;
  assert.equal((await s.call('PATCH', `/api/submissions/${target.id}/stage`, { token: T, body: { stage: 'Submitted to Client' } })).status, 200);
  let acts = (await activities()).filter((a) => a.type === 'Automation');
  assert.equal(acts.length, before + 1); assert.match(acts[0].subject, /was submitted to/);
  await s.call('PATCH', `/api/submissions/${target.id}/stage`, { token: T, body: { stage: 'Screened' } });
  await s.call('PATCH', `/api/submissions/${target.id}/stage`, { token: T, body: { stage: 'Submitted to Client' } });
  assert.equal((await activities()).filter((a) => a.type === 'Automation').length, before + 1, 'once per record: no repeats');
  const after = (await s.call('GET', '/api/automations', { token: T })).json.find((r) => r.trigger_type === 'submission_submitted');
  assert.equal(after.runs_30d, 1);

  // 2) interview finished -> follow-up reminder due in 3 days
  const iv = (await s.call('GET', '/api/interviews', { token: T })).json.find((x) => x.status === 'Scheduled');
  assert.ok(iv);
  const put = await s.call('PUT', `/api/interviews/${iv.id}`, { token: T, body: { submission_id: iv.submission_id, interviewer_name: iv.interviewer_name, scheduled_at: iv.scheduled_at, type: iv.type, status: 'Completed', notes: iv.notes } });
  assert.equal(put.status, 200, put.text);
  const reminder = (await activities()).find((a) => a.type === 'Automation' && /Follow up/.test(a.subject));
  assert.ok(reminder, 'follow-up reminder created');
  const due = new Date(reminder.occurred_at).getTime() - Date.now();
  assert.ok(due > 2.9 * 86400000 && due < 3.1 * 86400000, 'due in about 3 days');

  // 3) daily checks: jobs open 30+ days and overdue timesheets
  const sentBefore = (await sql(SAMPLE_DB, `SELECT COUNT(*)::int n FROM timesheets_invoices WHERE status = 'Sent' AND period_end::date <= current_date - 15`))[0].n;
  const run1 = (await s.call('POST', '/api/automations/run-now', { token: T })).json;
  assert.ok(run1.fired >= 1, 'something crossed the line');
  assert.equal((await sql(SAMPLE_DB, `SELECT COUNT(*)::int n FROM timesheets_invoices WHERE status = 'Sent' AND period_end::date <= current_date - 15`))[0].n, 0, `${sentBefore} overdue timesheets were marked Overdue`);
  assert.equal((await s.call('POST', '/api/automations/run-now', { token: T })).json.fired, 0, 'a second pass fires nothing new');

  // 4) a new rule from the catalog, paused and deleted; the catalog lists the triggers
  const cat = (await s.call('GET', '/api/automations/catalog', { token: T })).json;
  assert.deepEqual(cat.map((c) => c.id).sort(), ['candidate_referral', 'interview_completed', 'job_open_30d', 'submission_submitted', 'timesheet_overdue']);
  const created = await s.call('POST', '/api/automations', { token: T, body: { name: 'Ping me on referrals', trigger_type: 'candidate_referral' } });
  assert.equal(created.status, 201);
  const ref = await s.call('POST', '/api/candidates', { token: T, body: { name: 'Referred Rita', source: 'Referral' } });
  assert.equal(ref.status, 201);
  assert.ok((await activities()).some((a) => /New referral candidate: Referred Rita/.test(a.subject)));
  assert.equal((await s.call('PATCH', `/api/automations/${created.json.id}/active`, { token: T, body: { active: false } })).json.active, 0);
  assert.equal((await s.call('DELETE', `/api/automations/${created.json.id}`, { token: T })).status, 204);
  await stop(s);
});

test('simple resume reading fills the candidate form from pasted text (no AI)', async () => {
  const s = await start(EMPTY_DB);
  const text = `Carlos Eduardo Mendes
Senior Warehouse Supervisor
carlos.mendes@example.com | (512) 555-0187 | Austin, TX

Experience
Warehouse Supervisor at Northline Logistics (2019 - present)
Led a team of 22 forklift operators and cut shipping errors by 18%.

Skills: Forklift certified, Inventory control, OSHA 30, Spanish, Portuguese
Education: Austin Community College`;
  const r = await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.name, 'Carlos Eduardo Mendes'); assert.equal(r.json.email, 'carlos.mendes@example.com');
  assert.match(r.json.phone, /512.*555.*0187/); assert.match(r.json.current_title, /Warehouse Supervisor/i);
  assert.equal(r.json.current_employer, 'Northline Logistics');
  assert.match(r.json.skills, /Forklift certified/); assert.match(r.json.skills, /OSHA 30/);
  assert.equal((await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text: 'hi' } })).status, 400);
  assert.equal((await s.call('POST', '/api/candidates/parse-resume', { body: { text } })).status, 401);
  await stop(s);
});
