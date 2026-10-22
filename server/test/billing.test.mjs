// Planos e cobrança de Roster (Basic 79 / Essential 149 / Complete 269): barreiras por rota, LICENSED_PLAN, checkout, webhook do Stripe
// (inclusive eventos de outro produto e eventos sem etiqueta), cancelamento e resumo do Harbor.
// Precisa de um Postgres local (cria e apaga um banco temporário), como auth.test.mjs.
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/billing.test.mjs
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
const DB_NAME = `roster_billing_${process.pid}_${Date.now() % 100000}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
const FREE_PATH = '/api/clients', MID_PATH = '/api/timesheets', TOP_PATH = '/api/signatures'; // Todos / Essential / Complete

let admin;
const servers = [];
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); s.on('error', reject); });

async function start(extraEnv = {}) {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: DB_URL, JWT_SECRET: 'test-secret-test-secret-123', BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, FRONTEND_URL: 'http://app.test', SMTP_HOST: '' };
  for (const k of ['LICENSED_PLAN', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_API_BASE']) delete env[k];
  Object.assign(env, extraEnv);
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; proc.stdout.on('data', (d) => { logs += d; }); proc.stderr.on('data', (d) => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const srv = {
    proc, logs: () => logs,
    stop: () => new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); }),
    async call(method, url, { token, body, headers, raw } = {}) {
      const r = await fetch(base + url, { method, headers: { ...(body || raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* texto */ }
      return { status: r.status, json, text };
    },
  };
  servers.push(srv);
  const login = (await srv.call('POST', '/api/auth/login', { body: { email: OWNER.email, password: OWNER.pass } })).json;
  srv.token = login.token;
  return srv;
}
async function stop(srv) { await srv.stop(); servers.splice(servers.indexOf(srv), 1); }

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  const seed = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: DB_URL, SEED_SAMPLE_DATA: "1" }, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
});
after(async () => {
  for (const s of servers) if (s.proc.exitCode === null && s.proc.signalCode === null) await s.stop();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`); await admin.end();
});

const mkStaff = (s, i) => s.call('POST', '/api/accounts', { token: s.token, body: { name: `Staff ${i}`, email: `staff${i}@example.com`, password: 'Temp-pass-12345' } });

test('sem Stripe e sem LICENSED_PLAN: tudo liberado (instalação nunca se tranca sozinha)', async () => {
  const s = await start();
  const st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.plan, 'completo'); assert.equal(st.configured, false); assert.equal(st.source, 'open');
  for (const p of [FREE_PATH, MID_PATH, TOP_PATH]) assert.notEqual((await s.call('GET', p, { token: s.token })).status, 402, p);
  assert.equal((await s.call('GET', '/api/billing/status')).status, 401, 'precisa de login');
  await stop(s);
});

test('LICENSED_PLAN manda: Basic trava o meio e o topo e limita os logins', async () => {
  const s = await start({ LICENSED_PLAN: 'basico' });
  const st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.plan, 'basico'); assert.equal(st.limits.users, 3); assert.equal(st.source, 'licensed');
  assert.notEqual((await s.call('GET', FREE_PATH, { token: s.token })).status, 402);
  const mid = await s.call('GET', MID_PATH, { token: s.token });
  assert.equal(mid.status, 402); assert.equal(mid.json.code, 'plan_required'); assert.equal(mid.json.requiredPlan, 'essencial');
  const top = await s.call('GET', TOP_PATH, { token: s.token });
  assert.equal(top.status, 402); assert.equal(top.json.requiredPlan, 'completo');
  assert.equal(st.features.timesheets, false); assert.equal(st.features.signatures, false);
  // limite de logins: o dono já conta como 1
  let last;
  for (let i = 1; i <= 3; i++) last = await mkStaff(s, i);
  assert.equal(last.status, 402); assert.equal(last.json.code, 'plan_limit'); assert.equal(last.json.limitKind, 'users'); assert.equal(last.json.requiredPlan, 'essencial');
  await stop(s);
});

test('Essential libera o meio e não o topo; Complete libera tudo (25 logins)', async () => {
  let s = await start({ LICENSED_PLAN: 'essencial' });
  assert.notEqual((await s.call('GET', MID_PATH, { token: s.token })).status, 402);
  assert.equal((await s.call('GET', TOP_PATH, { token: s.token })).status, 402);
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token })).json.limits.users, 8);
  await stop(s);
  s = await start({ LICENSED_PLAN: 'completo' });
  for (const p of [FREE_PATH, MID_PATH, TOP_PATH]) assert.notEqual((await s.call('GET', p, { token: s.token })).status, 402, p);
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token })).json.limits.users, 25);
  await stop(s);
});

test('Stripe: checkout, webhook assinado, upgrade, cancelamento e resumo do Harbor', async () => {
  const fake = { checkout: [], portal: 0, lineItemPrice: 'price_zzz' };
  const stripe = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url.startsWith('/v1/billing_portal')) { fake.portal++; return res.end(JSON.stringify({ url: 'https://portal.example.test/x' })); }
      if (req.url.startsWith('/v1/checkout/sessions/') && req.url.endsWith('/line_items')) return res.end(JSON.stringify({ data: [{ price: { id: fake.lineItemPrice, recurring: { interval: 'month' } } }] }));
      if (req.url.startsWith('/v1/checkout/sessions')) { fake.checkout.push(decodeURIComponent(b)); return res.end(JSON.stringify({ url: 'https://checkout.example.test/s' })); }
      if (req.url.startsWith('/v1/subscriptions/')) return res.end(JSON.stringify({ status: 'active', items: { data: [{ price: { unit_amount: 14900, recurring: { interval: 'month' } } }] }, current_period_end: 1893456000, cancel_at_period_end: false }));
      if (req.url.startsWith('/v1/customers/')) return res.end(JSON.stringify({ email: 'billing@example.com' }));
      res.end('{}');
    });
  });
  await new Promise((r) => stripe.listen(0, '127.0.0.1', r));
  const SECRET = 'whsec_test';
  const s = await start({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_API_BASE: `http://127.0.0.1:${stripe.address().port}`, ADMIN_SUMMARY_KEY: 'k'.repeat(24),
    STRIPE_PRICE_BASICO: 'price_b', STRIPE_PRICE_ESSENCIAL: 'price_e', STRIPE_PRICE_COMPLETO: 'price_c', STRIPE_PRICE_ESSENCIAL_ANUAL: 'price_ea' });
  const sign = (body) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`; };
  const hook = (obj, sig) => s.call('POST', '/api/billing/webhook', { raw: JSON.stringify(obj), headers: { 'stripe-signature': sig ?? sign(JSON.stringify(obj)) } });

  // sem assinatura do Stripe por trás: continua tudo liberado
  let st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.plan, 'completo'); assert.equal(st.configured, true);
  assert.deepEqual(st.yearlyAvailable, { basico: false, essencial: true, completo: false });
  assert.deepEqual(st.prices.essencial, { month: 149, year: 1609.2 });

  // checkout: só o dono; usa o preço certo; mensal e anual
  const staff = await mkStaff(s, 99);
  assert.equal(staff.status, 201);
  const staffLogin = (await s.call('POST', '/api/auth/login', { body: { email: 'staff99@example.com', password: 'Temp-pass-12345' } })).json;
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: staffLogin.token, body: { plan: 'essencial' } })).status, 403, 'equipe não escolhe plano');
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'essencial', interval: 'month' } })).status, 200);
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'essencial', interval: 'year' } })).status, 200);
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'completo', interval: 'year' } })).status, 400, 'sem preço anual no Stripe');
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'nope' } })).status, 400);
  assert.match(fake.checkout[0], /price_e/); assert.match(fake.checkout[1], /price_ea/);
  assert.equal((await s.call('POST', '/api/billing/portal', { token: s.token, body: {} })).status, 400, 'ainda sem assinatura');

  // webhook: assinatura errada é recusada; certa grava o plano
  const evt = { type: 'checkout.session.completed', data: { object: { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'essencial', interval: 'month', product: 'roster' } } } };
  assert.equal((await hook(evt, 't=1,v1=00')).status, 400);
  const old = Math.floor(Date.now() / 1000) - 3600; // evento antigo repetido (assinatura certa, hora velha)
  assert.equal((await hook(evt, `t=${old},v1=${crypto.createHmac('sha256', SECRET).update(`${old}.${JSON.stringify(evt)}`).digest('hex')}`)).status, 400, 'assinatura velha demais');
  // regra da casa (uma conta do Stripe para todos os produtos): evento de outro produto, ou sem etiqueta e com preço que não é do Roster, não mexe em nada
  const foreign = { type: 'checkout.session.completed', data: { object: { id: 'cs_f', customer: 'cus_f', subscription: 'sub_f', metadata: { plan: 'completo', interval: 'month', product: 'binder' } } } };
  const untaggedOther = { type: 'checkout.session.completed', data: { object: { id: 'cs_u', customer: 'cus_u', subscription: 'sub_u', metadata: { plan: 'completo' } } } }; // mesmo nome de plano, preço de outro produto
  assert.equal((await hook(foreign)).status, 200);
  assert.equal((await hook(untaggedOther)).status, 200);
  st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.source, 'open', 'nada mudou'); assert.equal(st.plan, 'completo');
  // sem etiqueta mas com o PREÇO do Roster (Payment Link): vale
  fake.lineItemPrice = 'price_e';
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_pl', customer: 'cus_pl', subscription: 'sub_pl', metadata: {} } } })).status, 200);
  st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.source, 'stripe'); assert.equal(st.plan, 'essencial');
  // a compra etiquetada do Roster troca a assinatura
  assert.equal((await hook(evt)).status, 200);
  st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.plan, 'essencial'); assert.equal(st.limits.users, 8); assert.equal(st.interval, 'month');
  assert.equal((await s.call('GET', TOP_PATH, { token: s.token })).status, 402, 'essencial não tem o topo');
  assert.notEqual((await s.call('GET', MID_PATH, { token: s.token })).status, 402);
  assert.equal((await s.call('POST', '/api/billing/portal', { token: s.token, body: {} })).status, 200);

  // resumo do Harbor com o valor real cobrado
  const sum = await s.call('GET', '/api/admin-summary', { headers: { 'x-admin-key': 'k'.repeat(24) } });
  assert.equal(sum.status, 200); assert.equal(sum.json.billingEnabled, true);
  assert.equal(sum.json.subscribers[0].plan, 'essencial'); assert.equal(sum.json.subscribers[0].amount, 14900 / 100);

  // upgrade pelo Stripe → completo; cancelamento → volta ao plano de entrada
  const up = { type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', metadata: { plan: 'completo' }, items: { data: [{ price: { id: 'price_c' } }] } } } };
  assert.equal((await hook(up)).status, 200);
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token })).json.plan, 'completo');
  // troca de plano pelo portal do Stripe: o preço muda e a etiqueta da compra original continua a antiga; vale o preço
  assert.equal((await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', metadata: { plan: 'completo', product: 'roster' }, items: { data: [{ price: { id: 'price_e', recurring: { interval: 'month' } } }] } } } })).status, 200);
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token })).json.plan, 'essencial', 'segue o preço, não a etiqueta antiga');
  // assinatura antiga num preço que já não está nas variáveis: segue a etiqueta
  assert.equal((await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', metadata: { plan: 'completo' }, items: { data: [{ price: { id: 'price_velho_249', recurring: { interval: 'month' } } }] } } } })).status, 200);
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token })).json.plan, 'completo');
  assert.equal((await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } })).status, 200);
  st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(st.plan, 'basico'); assert.equal(st.features.timesheets, false);
  assert.equal((await s.call('GET', MID_PATH, { token: s.token })).status, 402);
  // sem chave: o resumo recusa
  assert.equal((await s.call('GET', '/api/admin-summary', { headers: { 'x-admin-key': 'errada' } })).status, 401);
  await stop(s); stripe.close();
});
