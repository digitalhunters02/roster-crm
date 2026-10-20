// Selo de plano: o servidor diz, para cada recurso, o plano mínimo e se o plano EM VIGOR já o libera.
// Também confere o "ver como plano" do dono (OWNER_EMAILS + X-Preview-Plan): selos, barreiras de rota e limite de logins seguem o plano visto,
// e cobrança / novo login / IA / WhatsApp ficam bloqueados (409) enquanto ele olha como outro plano.
//   TEST_PG_ADMIN_URL=postgres://harbor:harbortest@127.0.0.1:5432/postgres node --test server/test/planGates.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://harbor:harbortest@127.0.0.1:5432/postgres';
const DB_NAME = `selor_t_${crypto.randomBytes(4).toString('hex')}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);
const PORT = 7882; // porta reservada para este trabalho; cada servidor de teste substitui o anterior
process.env.DATABASE_URL ||= DB_URL; // billing.js abre o banco ao ser importado (nenhuma consulta é feita nos testes sem servidor)
const { publicGates, publicCatalog, minPlanForGate, seatGateFor } = await import('../src/billing.js');
const { makeGates } = await import('../src/planGates.js');
const { isOwnerEmail } = await import('../src/owner.js');
const OWNER = { email: 'dono@example.test', pass: 'Owner-pass-12345' };

const ORDER = ['basico', 'essencial', 'completo'];
// Esperado, escrito à mão (oráculo independente do código): recurso -> plano mínimo.
const MIN = {
  placements: 'essencial', timesheets: 'essencial', reports: 'essencial', careers: 'essencial', resume_ai: 'essencial',
  margin: 'completo', hours_export: 'completo', hours_portal: 'completo', automations: 'completo', whatsapp: 'completo',
  staff_essencial: 'essencial', staff_completo: 'completo', // vagas de login de equipe (3 / 10 / sem limite)
};
const expectedLocked = (plan) => Object.entries(MIN).filter(([, min]) => ORDER.indexOf(min) > ORDER.indexOf(plan)).map(([k]) => k).sort();
const lockedOf = (b) => Object.entries(b.gates).filter(([, v]) => v.locked).map(([k]) => k).sort();

test('mapa recurso -> plano mínimo (sem servidor)', () => {
  const g = publicGates();
  for (const [k, min] of Object.entries(MIN)) assert.equal(g[k].minPlan, min, k);
  assert.deepEqual(Object.keys(g).sort(), Object.keys(MIN).sort(), 'todo recurso tem teste');
  for (const plan of ORDER) {
    const locked = Object.entries(publicGates(plan)).filter(([, v]) => v.locked).map(([k]) => k).sort();
    assert.deepEqual(locked, expectedLocked(plan), plan);
  }
  assert.deepEqual(Object.values(publicGates('completo')).filter((v) => v.locked), [], 'Completo não tem nada bloqueado');
  assert.equal(publicGates('ouro').reports.locked, false, 'plano desconhecido cai no mais alto (nunca tranca)');
  assert.equal(minPlanForGate('nada'), null);
});

test('catálogo: ordem, nomes, preços (anual só quando ligado), limites e o que cada plano acrescenta', () => {
  const cat = publicCatalog();
  assert.deepEqual(cat.map((p) => p.key), ORDER);
  assert.deepEqual(cat.map((p) => p.name), ['Essential', 'Professional', 'Complete']);
  assert.deepEqual(cat.map((p) => p.price.month), [49, 119, 249]);
  assert.ok(cat.every((p) => p.price.year === undefined), 'sem preço anual ligado, não existe preço anual');
  assert.deepEqual(cat.map((p) => p.userLimit), [3, 10, null]);
  assert.deepEqual(cat[0].adds, []);
  assert.deepEqual(cat.flatMap((p) => p.adds).sort(), Object.keys(MIN).sort(), 'cada recurso entra em exatamente um plano');
  for (const p of cat) for (const g of p.adds) assert.equal(MIN[g], p.key, `${g} entra em ${p.key}`);
});

test('vaga de login: qual recurso destrava a próxima pessoa', () => {
  assert.equal(seatGateFor('basico', 2), null);
  assert.equal(seatGateFor('basico', 3), 'staff_essencial');
  assert.equal(seatGateFor('essencial', 9), null);
  assert.equal(seatGateFor('essencial', 10), 'staff_completo');
  assert.equal(seatGateFor('completo', 999), null);
});

test('makeGates e OWNER_EMAILS', () => {
  const PLANS = { a: { key: 'a', sold: true, rank: 0, x: 0 }, b: { key: 'b', sold: true, rank: 1, x: 5 } };
  const g = makeGates(PLANS, { grande: (p) => p.x > 1 }, 'a');
  assert.deepEqual(g.addsByPlan(), { a: [], b: ['grande'] });
  assert.equal(isOwnerEmail(' Dono@Example.test ', { OWNER_EMAILS: 'x@y.z, dono@example.test' }), true);
  assert.equal(isOwnerEmail('dono@example.test', {}), false, 'sem a variável ninguém é dono');
});

let admin, db;
let current = null;
before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  const seed = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: DB_URL }, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  db = new pg.Client({ connectionString: DB_URL }); await db.connect();
});
after(async () => {
  if (current) await current.stop();
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`); await admin.end();
});

async function start(extraEnv = {}) {
  if (current) { await current.stop(); current = null; }
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DATABASE_URL: DB_URL, JWT_SECRET: 'test-secret-test-secret-123', BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, FRONTEND_URL: 'http://app.test', SMTP_HOST: '' };
  for (const k of ['LICENSED_PLAN', 'OWNER_EMAILS', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_API_BASE', 'ANTHROPIC_API_KEY']) delete env[k];
  Object.assign(env, extraEnv);
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const srv = {
    stop: () => new Promise((resolve) => { if (proc.exitCode !== null) return resolve(); proc.once('exit', resolve); proc.kill('SIGTERM'); }),
    async call(method, url, { token, body, headers } = {}) {
      const r = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* texto */ }
      return { status: r.status, json, text };
    },
  };
  current = srv;
  srv.token = (await srv.call('POST', '/api/auth/login', { body: { email: OWNER.email, password: OWNER.pass } })).json.token;
  return srv;
}

test('/api/billing/status e /api/public/plans: cada plano vê os selos certos; Completo não vê nenhum', async () => {
  for (const plan of ORDER) {
    const s = await start({ LICENSED_PLAN: plan, STRIPE_PRICE_ESSENCIAL_ANUAL: 'price_ea' });
    const st = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
    assert.equal(st.plan, plan); assert.equal(st.previewPlan, null); assert.equal(st.owner, false);
    assert.deepEqual(lockedOf(st), expectedLocked(plan), plan);
    for (const [k, v] of Object.entries(st.gates)) assert.equal(v.minPlan, MIN[k], k);
    assert.deepEqual(st.catalog.find((p) => p.key === 'essencial').price, { month: 119, year: Math.round(119 * 12 * 0.9) }, 'anual aparece quando o preço anual está ligado');
    assert.equal(st.catalog.find((p) => p.key === 'basico').price.year, undefined);
    const pub = (await s.call('GET', '/api/public/plans')).json;
    assert.deepEqual(pub.catalog, st.catalog, 'mesma fonte');
    assert.equal(pub.gates.automations.minPlan, 'completo'); assert.equal(pub.gates.automations.locked, undefined, 'público não tem locked');
  }
});

test('dono vendo como cada plano: selos, barreiras de rota e limite de logins seguem o plano visto; cobrança e efeitos externos ficam bloqueados', async () => {
  const s = await start({ LICENSED_PLAN: 'completo', OWNER_EMAILS: 'DONO@example.test' });
  const hdr = (plan) => ({ 'X-Preview-Plan': plan });
  const plain = (await s.call('GET', '/api/billing/status', { token: s.token })).json;
  assert.equal(plain.owner, true); assert.equal(plain.previewPlan, null); assert.deepEqual(lockedOf(plain), []);
  const rows = { basico: [402, 402, 3], essencial: [200, 402, 10], completo: [200, 200, null] }; // /api/placements, /api/automations, limite de logins
  for (const plan of ORDER) {
    const st = (await s.call('GET', '/api/billing/status', { token: s.token, headers: hdr(plan) })).json;
    assert.equal(st.plan, plan); assert.equal(st.previewPlan, plan); assert.equal(st.realPlan, 'completo');
    assert.deepEqual(lockedOf(st), expectedLocked(plan), plan);
    assert.equal(st.userLimit, rows[plan][2]);
    assert.equal((await s.call('GET', '/api/placements', { token: s.token, headers: hdr(plan) })).status, rows[plan][0], `placements em ${plan}`);
    assert.equal((await s.call('GET', '/api/automations', { token: s.token, headers: hdr(plan) })).status, rows[plan][1], `automations em ${plan}`);
  }
  assert.equal((await s.call('GET', '/api/automations', { token: s.token })).status, 200, 'sem prévia volta ao plano real');
  assert.equal((await s.call('GET', '/api/billing/status', { token: s.token, headers: hdr('ouro') })).json.previewPlan, null, 'plano que não existe é ignorado');

  // em prévia: nada de cobrar, criar login, ler currículo com IA ou mandar WhatsApp
  const before = (await db.query(`SELECT COUNT(*)::int n FROM accounts`)).rows[0].n;
  for (const [method, url, body] of [['POST', '/api/billing/checkout', { plan: 'essencial' }], ['POST', '/api/billing/portal', {}], ['POST', '/api/accounts', { name: 'N', email: 'n@example.test', password: 'Temp-pass-12345' }],
    ['POST', '/api/candidates/parse-resume', { text: 'x'.repeat(80) }], ['POST', '/api/integrations/whatsapp/send', { to: '5511999999999', text: 'oi' }], ['POST', '/api/integrations/whatsapp/connect', { phoneNumberId: '1', accessToken: 'x' }]]) {
    const r = await s.call(method, url, { token: s.token, body, headers: hdr('completo') });
    assert.equal(r.status, 409, `${method} ${url} ${r.text}`);
    assert.equal(r.json.code, 'preview_readonly', url);
  }
  assert.equal((await db.query(`SELECT COUNT(*)::int n FROM accounts`)).rows[0].n, before, 'nenhum login criado');
  assert.equal((await db.query(`SELECT COUNT(*)::int n FROM subscription WHERE stripe_subscription_id IS NOT NULL`)).rows[0].n, 0, 'assinatura intocada');
  // fora da prévia vale a regra normal (sem Stripe: 400 e não 409)
  assert.equal((await s.call('POST', '/api/billing/checkout', { token: s.token, body: { plan: 'essencial' } })).status, 400);
  assert.equal((await s.call('POST', '/api/accounts', { token: s.token, body: { name: 'N', email: 'n@example.test', password: 'Temp-pass-12345' } })).status, 201);
});

test('quem não é dono não ganha nada com o cabeçalho (dono da empresa, equipe, ou ninguém em OWNER_EMAILS)', async () => {
  let s = await start({ LICENSED_PLAN: 'basico', OWNER_EMAILS: 'outro@example.test' });
  const hdr = { 'X-Preview-Plan': 'completo' };
  let st = (await s.call('GET', '/api/billing/status', { token: s.token, headers: hdr })).json;
  assert.equal(st.owner, false); assert.equal(st.previewPlan, null); assert.equal(st.plan, 'basico');
  assert.equal((await s.call('GET', '/api/automations', { token: s.token, headers: hdr })).status, 402, 'barreira continua valendo');
  const staff = await s.call('POST', '/api/accounts', { token: s.token, body: { name: 'Eq', email: 'eq@example.test', password: 'Temp-pass-12345' } });
  assert.equal(staff.status, 201);
  const sl = (await s.call('POST', '/api/auth/login', { body: { email: 'eq@example.test', password: 'Temp-pass-12345' } })).json;
  st = (await s.call('GET', '/api/billing/status', { token: sl.token, headers: hdr })).json;
  assert.equal(st.previewPlan, null); assert.equal(st.plan, 'basico');
  s = await start({ LICENSED_PLAN: 'basico' }); // sem OWNER_EMAILS
  st = (await s.call('GET', '/api/billing/status', { token: s.token, headers: hdr })).json;
  assert.equal(st.owner, false); assert.equal(st.previewPlan, null);
});
