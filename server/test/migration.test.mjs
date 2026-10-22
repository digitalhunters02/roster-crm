// Subir esta versão em cima do banco da produção anterior (Roster antigo + selo de plano, planos 49 / 119 / 249):
// o esquema se atualiza sozinho, a assinatura que já existe continua valendo e passa a seguir os planos novos (79 / 149 / 269).
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/migration.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const DB = `roster_mig_${process.pid}_${Date.now() % 100000}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); s.on('error', reject); });

let admin;
before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`CREATE DATABASE ${DB}`);
  const c = new pg.Client({ connectionString: DB_URL }); await c.connect();
  await c.query(fs.readFileSync(path.join(here, 'fixtures', 'schema.production-2026-10-20.sql'), 'utf8')); // o esquema como estava na produção
  await c.end();
});
after(async () => { await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); await admin.end(); });

async function boot(env) {
  const port = await freePort();
  const proc = spawn('node', [path.join(SRC, 'index.js')], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: DB_URL, JWT_SECRET: 'test-secret-test-secret-123', BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, FRONTEND_URL: 'http://app.test', SMTP_HOST: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; proc.stdout.on('data', (d) => { logs += d; }); proc.stderr.on('data', (d) => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const call = async (url, token) => { const r = await fetch(base + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* texto */ } return { status: r.status, json: j }; };
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: OWNER.email, password: OWNER.pass }) });
  const token = (await login.json()).token;
  return { call, token, logs: () => logs, stop: () => new Promise((r) => { proc.once('exit', r); proc.kill('SIGTERM'); }) };
}

test('banco da produção anterior: o esquema atualiza e a assinatura que já existia segue valendo nos planos novos', async () => {
  const STRIPE = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_BASICO: 'price_b', STRIPE_PRICE_ESSENCIAL: 'price_e', STRIPE_PRICE_COMPLETO: 'price_c' };
  const db = new pg.Client({ connectionString: DB_URL }); await db.connect();
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'subscription'`)).rows.map((r) => r.column_name);
  assert.ok(!cols.includes('billing_interval'), 'a produção anterior não tinha a coluna do período (mensal / anual)');
  // assinatura que um cliente já tinha pago no plano do meio (antes "Professional", US$119)
  await db.query(`INSERT INTO subscription (id, plan, status, stripe_customer_id, stripe_subscription_id) VALUES (1, 'essencial', 'active', 'cus_old', 'sub_old')`);

  let s = await boot(STRIPE);
  assert.ok(s.token, s.logs());
  const cols2 = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'subscription'`)).rows.map((r) => r.column_name);
  assert.ok(cols2.includes('billing_interval'), 'coluna acrescentada');
  let st = (await s.call('/api/billing/status', s.token)).json;
  assert.equal(st.plan, 'essencial'); assert.equal(st.source, 'stripe'); assert.equal(st.interval, 'month');
  assert.equal(st.limits.users, 8, 'o plano do meio passa a ter 8 logins (eram 10)');
  assert.equal((await s.call('/api/timesheets', s.token)).status, 200, 'o que o plano já tinha continua');
  assert.equal((await s.call('/api/signatures', s.token)).status, 402);
  assert.deepEqual(st.catalog.map((p) => p.price.month), [79, 149, 269]);
  await s.stop();

  // o plano de entrada (antes "Essential", US$49) segue como Basic; assinatura cancelada também
  await db.query(`UPDATE subscription SET plan = 'basico'`);
  s = await boot(STRIPE);
  st = (await s.call('/api/billing/status', s.token)).json;
  assert.equal(st.plan, 'basico'); assert.equal(st.limits.users, 3);
  assert.equal((await s.call('/api/timesheets', s.token)).status, 402);
  await s.stop();
  // sem nenhum Stripe configurado (como a instância da própria Impact Digital): tudo liberado
  s = await boot({});
  st = (await s.call('/api/billing/status', s.token)).json;
  assert.equal(st.plan, 'completo'); assert.equal(st.source, 'open');
  await s.stop();
  await db.end();
});
