// API tests for authentication. Needs a local Postgres; creates (and drops) a
// throwaway database, then runs the real server as a child process.
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const DB_NAME = `roster_auth_${process.pid}_${Date.now() % 100000}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASS = 'Owner-pass-12345';

let admin;
const servers = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

async function startServer(extraEnv = {}) {
  const port = await freePort();
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: DB_URL,
    JWT_SECRET: 'test-secret-test-secret-123',
    BOOTSTRAP_OWNER_EMAIL: OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD: OWNER_PASS,
    FRONTEND_URL: 'http://app.test',
    SMTP_HOST: '', ...extraEnv,
  };
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  proc.stdout.on('data', (d) => { logs += d; });
  proc.stderr.on('data', (d) => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  const srv = {
    base, proc, logs: () => logs,
    stop: () => new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); }),
    async call(method, url, { token, body, headers } = {}) {
      const r = await fetch(base + url, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: r.status, json, text, headers: r.headers };
    },
  };
  servers.push(srv);
  return srv;
}

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  const seed = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: DB_URL }, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
});

after(async () => {
  for (const s of servers) if (s.proc.exitCode === null && s.proc.signalCode === null) await s.stop();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.end();
});

let main;
let ownerToken;

test('boots and creates the bootstrap owner exactly once', async () => {
  main = await startServer();
  assert.match(main.logs(), new RegExp(`bootstrap owner created for ${OWNER_EMAIL}`));
  assert.ok(!main.logs().includes(OWNER_PASS), 'password must never be logged');
});

test('health is public', async () => {
  const r = await main.call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

const PROTECTED = [
  ['GET', '/api/clients'], ['POST', '/api/clients'], ['PUT', '/api/clients/1'], ['DELETE', '/api/clients/1'],
  ['GET', '/api/jobs'], ['POST', '/api/jobs'], ['GET', '/api/candidates'], ['DELETE', '/api/candidates/1'],
  ['GET', '/api/users'], ['GET', '/api/dashboard'], ['GET', '/api/reports'], ['GET', '/api/activities'],
  ['POST', '/api/automations'], ['GET', '/api/integrations/whatsapp/status'],
  ['POST', '/api/integrations/whatsapp/send'], ['POST', '/api/integrations/whatsapp/connect'],
  ['GET', '/api/integrations/whatsapp/conversations'], ['GET', '/api/accounts'], ['POST', '/api/accounts'],
  ['GET', '/api/auth/me'], ['POST', '/api/auth/change-password'], ['GET', '/api/does-not-exist'],
];

test('no token: protected routes (incl. mutating ones) answer 401', async () => {
  for (const [m, u] of PROTECTED) {
    const r = await main.call(m, u, m === 'GET' || m === 'DELETE' ? {} : { body: {} });
    assert.equal(r.status, 401, `${m} ${u} -> ${r.status}`);
  }
});

test('bad / forged / garbage token answers 401', async () => {
  for (const t of ['garbage', 'a.b.c', 'Bearer x']) {
    const r = await main.call('GET', '/api/clients', { token: t });
    assert.equal(r.status, 401);
  }
});

test('login: wrong password and unknown email get the same 401', async () => {
  const wrong = await main.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: 'nope-nope-nope' } });
  const unknown = await main.call('POST', '/api/auth/login', { body: { email: 'ghost@example.com', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.json.error, unknown.json.error);
  const missing = await main.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL } });
  assert.equal(missing.status, 400);
});

test('login ok: token opens protected routes, demo data intact', async () => {
  const r = await main.call('POST', '/api/auth/login', { body: { email: ' Owner@Example.com ', password: OWNER_PASS } });
  assert.equal(r.status, 200);
  assert.equal(r.json.account.role, 'owner');
  assert.equal(r.json.account.password_hash, undefined);
  ownerToken = r.json.token;
  const clients = await main.call('GET', '/api/clients', { token: ownerToken });
  assert.equal(clients.status, 200);
  assert.ok(clients.json.length >= 10, 'demo clients still there');
  const me = await main.call('GET', '/api/auth/me', { token: ownerToken });
  assert.equal(me.json.account.email, OWNER_EMAIL);
});

test('login rate limit per ip+email: 429 after repeated failures, even for the right password', async () => {
  const email = 'victim@example.com';
  for (let i = 0; i < 5; i++) {
    const r = await main.call('POST', '/api/auth/login', { body: { email, password: 'wrong-wrong-1' } });
    assert.equal(r.status, 401);
  }
  const blocked = await main.call('POST', '/api/auth/login', { body: { email, password: 'wrong-wrong-1' } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  // other emails from the same ip are not blocked by the per-pair limit
  const other = await main.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: OWNER_PASS } });
  assert.equal(other.status, 200);
});

test('forgot/reset flow: generic answer, single-use link, old sessions revoked', async () => {
  const known = await main.call('POST', '/api/auth/forgot', { body: { email: OWNER_EMAIL } });
  const unknown = await main.call('POST', '/api/auth/forgot', { body: { email: 'ghost2@example.com' } });
  assert.equal(known.status, 200);
  assert.deepEqual(known.json, unknown.json);
  assert.equal(known.json.emailConfigured, false);
  const m = main.logs().match(/http:\/\/app\.test\/#\/reset-password\?token=([a-f0-9]{64})/);
  assert.ok(m, 'reset link logged server-side when SMTP is not configured');
  const token = m[1];

  const short = await main.call('POST', '/api/auth/reset', { body: { token, password: 'short' } });
  assert.equal(short.status, 400);
  const bad = await main.call('POST', '/api/auth/reset', { body: { token: 'f'.repeat(64), password: 'Brand-new-pass-1' } });
  assert.equal(bad.status, 400);

  const ok = await main.call('POST', '/api/auth/reset', { body: { token, password: 'Brand-new-pass-1' } });
  assert.equal(ok.status, 200);
  const again = await main.call('POST', '/api/auth/reset', { body: { token, password: 'Another-pass-1234' } });
  assert.equal(again.status, 400, 'token is single use');

  assert.equal((await main.call('GET', '/api/clients', { token: ownerToken })).status, 401, 'old session revoked');
  const oldLogin = await main.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: OWNER_PASS } });
  assert.equal(oldLogin.status, 401);
  const newLogin = await main.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: 'Brand-new-pass-1' } });
  assert.equal(newLogin.status, 200);
  ownerToken = newLogin.json.token;
});

test('expired reset token is rejected', async () => {
  await main.call('POST', '/api/auth/forgot-password', { body: { email: OWNER_EMAIL } });
  const logs = main.logs();
  const all = [...logs.matchAll(/reset-password\?token=([a-f0-9]{64})/g)];
  const token = all[all.length - 1][1];
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  await db.query(`UPDATE accounts SET reset_token_expires = now() - interval '1 minute'`);
  await db.end();
  const r = await main.call('POST', '/api/auth/reset-password', { body: { token, password: 'Yet-another-pass-1' } });
  assert.equal(r.status, 400);
});

test('forgot is rate limited too', async () => {
  let last;
  for (let i = 0; i < 7; i++) last = await main.call('POST', '/api/auth/forgot', { body: { email: 'spam@example.com' } });
  assert.equal(last.status, 429);
});

test('change password: needs current, min 8, returns a working token', async () => {
  const t = ownerToken;
  assert.equal((await main.call('POST', '/api/auth/change-password', { token: t, body: { currentPassword: 'wrong-wrong-1', newPassword: 'Changed-pass-123' } })).status, 400);
  assert.equal((await main.call('POST', '/api/auth/change-password', { token: t, body: { currentPassword: 'Brand-new-pass-1', newPassword: 'short' } })).status, 400);
  const ok = await main.call('POST', '/api/auth/change-password', { token: t, body: { currentPassword: 'Brand-new-pass-1', newPassword: 'Changed-pass-123' } });
  assert.equal(ok.status, 200);
  assert.equal((await main.call('GET', '/api/clients', { token: t })).status, 401, 'old token revoked');
  assert.equal((await main.call('GET', '/api/clients', { token: ok.json.token })).status, 200);
  ownerToken = ok.json.token;
});

test('owner adds staff; staff works but cannot manage accounts or WhatsApp credentials', async () => {
  const bad = await main.call('POST', '/api/accounts', { token: ownerToken, body: { name: 'X', email: 'not-an-email', password: 'Temp-pass-1234' } });
  assert.equal(bad.status, 400);
  const created = await main.call('POST', '/api/accounts', { token: ownerToken, body: { name: 'Sam Staff', email: 'sam@example.com', password: 'Temp-pass-1234' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.role, 'staff');
  assert.equal(created.json.mustChangePassword, true);
  const dup = await main.call('POST', '/api/accounts', { token: ownerToken, body: { name: 'Sam', email: 'SAM@example.com', password: 'Temp-pass-1234' } });
  assert.equal(dup.status, 409);

  const login = await main.call('POST', '/api/auth/login', { body: { email: 'sam@example.com', password: 'Temp-pass-1234' } });
  assert.equal(login.status, 200);
  const st = login.json.token;
  assert.equal((await main.call('GET', '/api/clients', { token: st })).status, 200);
  assert.equal((await main.call('GET', '/api/accounts', { token: st })).status, 403);
  assert.equal((await main.call('POST', '/api/accounts', { token: st, body: { name: 'a', email: 'a@b.co', password: 'Temp-pass-1234' } })).status, 403);
  assert.equal((await main.call('POST', '/api/integrations/whatsapp/disconnect', { token: st, body: {} })).status, 403);
  const chg = await main.call('POST', '/api/auth/change-password', { token: st, body: { currentPassword: 'Temp-pass-1234', newPassword: 'Sams-own-pass-1' } });
  assert.equal(chg.status, 200);
  assert.equal(chg.json.account.mustChangePassword, false);

  const list = await main.call('GET', '/api/accounts', { token: ownerToken });
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 2);
  assert.equal((await main.call('DELETE', `/api/accounts/${list.json.find((a) => a.role === 'owner').id}`, { token: ownerToken })).status, 400);
  assert.equal((await main.call('DELETE', `/api/accounts/${created.json.id}`, { token: ownerToken })).status, 204);
  assert.equal((await main.call('GET', '/api/clients', { token: chg.json.token })).status, 401, 'deleted staff loses access');
});

test('WhatsApp webhook stays public: GET verify handshake and POST delivery', async () => {
  const noConn = await main.call('GET', '/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=abc');
  assert.equal(noConn.status, 403, 'answered by the handler (403), not the login gate (401)');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  await db.query(`INSERT INTO whatsapp_connection (id, phone_number_id, access_token, verify_token) VALUES (1, 'pn1', 'tok', 'my-verify-token') ON CONFLICT (id) DO UPDATE SET verify_token = 'my-verify-token'`);
  const good = await main.call('GET', '/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=my-verify-token&hub.challenge=abc123');
  assert.equal(good.status, 200);
  assert.equal(good.text, 'abc123');
  const wrong = await main.call('GET', '/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc123');
  assert.equal(wrong.status, 403);
  const post = await main.call('POST', '/api/integrations/whatsapp/webhook', {
    body: { entry: [{ changes: [{ value: { messages: [{ id: 'wamid.TEST1', from: '15555550100', type: 'text', text: { body: 'hello' } }] } }] }] },
  });
  assert.equal(post.status, 200);
  const row = await db.query(`SELECT body FROM whatsapp_messages WHERE wa_message_id = 'wamid.TEST1'`);
  assert.equal(row.rows[0]?.body, 'hello');
  await db.end();
});

test('bootstrap is idempotent: restart with a different env password keeps the real one', async () => {
  await main.stop();
  const again = await startServer({ BOOTSTRAP_OWNER_PASSWORD: 'Different-env-pass-9' });
  assert.ok(!/bootstrap owner created/.test(again.logs()), 'nothing created on the second boot');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  const n = await db.query(`SELECT COUNT(*)::int AS n FROM accounts WHERE lower(email) = $1`, [OWNER_EMAIL]);
  await db.end();
  assert.equal(n.rows[0].n, 1);
  const env = await again.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: 'Different-env-pass-9' } });
  assert.equal(env.status, 401, 'env password must not overwrite');
  const real = await again.call('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: 'Changed-pass-123' } });
  assert.equal(real.status, 200, 'password set through the app survives restarts');
  await again.stop();
});

test('WHATSAPP_APP_SECRET (optional) enforces Meta signatures on POST only', async () => {
  const crypto = await import('node:crypto');
  const s = await startServer({ WHATSAPP_APP_SECRET: 'meta-app-secret' });
  const body = JSON.stringify({ entry: [] });
  assert.equal((await s.call('POST', '/api/integrations/whatsapp/webhook', { body })).status, 403);
  const sig = 'sha256=' + crypto.createHmac('sha256', 'meta-app-secret').update(body).digest('hex');
  assert.equal((await s.call('POST', '/api/integrations/whatsapp/webhook', { body, headers: { 'x-hub-signature-256': sig } })).status, 200);
  await s.stop();
});

test('production refuses to start without JWT_SECRET', async () => {
  const r = spawnSync('node', [path.join(SRC, 'index.js')], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '', DATABASE_URL: DB_URL, PORT: '0' },
    encoding: 'utf8', timeout: 15000,
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /JWT_SECRET/);
});
