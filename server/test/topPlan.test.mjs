// PARA QUE SERVE: garante a regra "dono sempre no plano mais alto": sem Stripe e sem assinatura o plano em vigor é topPlan()
// (calculado pelo maior PLAN_RANK, nunca escrito à mão); LICENSED_PLAN=max dá o topo; um nome de plano válido em LICENSED_PLAN
// e a assinatura do cliente continuam mandando como antes. Roda dentro do processo, com um Postgres local (banco temporário).
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/topPlan.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const DB_NAME = `roster_topplan_${process.pid}_${Date.now() % 100000}`;
process.env.DATABASE_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

let admin, billing, planConfig, db, owner;
const reset = () => { delete process.env.LICENSED_PLAN; delete process.env.STRIPE_SECRET_KEY; };

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  db = await import('../src/db.js');
  await db.initSchema();
  billing = await import('../src/billing.js');
  planConfig = await import('../src/planConfig.js');
  owner = await import('../src/owner.js');
});
after(async () => {
  try { await db?.default.end(); } catch { /* já fechado */ }
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {});
  await admin.end();
});

test('sem Stripe e sem assinatura o plano em vigor é o topo calculado', async () => {
  reset();
  const { PLAN_RANK } = planConfig;
  const maior = Object.keys(PLAN_RANK).sort((a, b) => PLAN_RANK[b] - PLAN_RANK[a])[0];
  assert.equal(billing.topPlan(), maior);
  assert.equal(await billing.effectivePlan(), billing.topPlan());
  // Stripe configurado mas linha de assinatura sem assinatura de verdade (a instância da própria Impact Digital)
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  assert.equal(await billing.realPlan(), billing.topPlan());
  reset();
});

test('plano fictício de rank maior: o dono sobe sozinho, sem mudar código', async () => {
  reset();
  const before_ = billing.topPlan();
  planConfig.PLAN_RANK.zzteste = 99;
  try {
    assert.equal(billing.topPlan(), 'zzteste');
    assert.equal(await billing.effectivePlan(), 'zzteste');
    process.env.LICENSED_PLAN = 'max';
    assert.equal(await billing.effectivePlan(), 'zzteste');
    // "Ver como plano": o dono pode escolher o plano novo na prévia (a lista vem de PLAN_RANK)
    delete process.env.LICENSED_PLAN;
    assert.ok(Object.keys(planConfig.PLAN_RANK).includes('zzteste'));
    assert.equal(await owner.store.run({ plan: 'zzteste' }, () => billing.effectivePlan()), 'zzteste');
  } finally {
    delete planConfig.PLAN_RANK.zzteste;
    reset();
  }
  assert.equal(billing.topPlan(), before_);
  assert.equal(await billing.effectivePlan(), before_);
});

test('LICENSED_PLAN=max dá o topo, mesmo com assinatura de outro plano no banco', async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  await db.run(`UPDATE subscription SET stripe_subscription_id = 'sub_x', plan = 'basico', status = 'active' WHERE id = 1`);
  process.env.LICENSED_PLAN = 'max';
  assert.equal(billing.licensedPlan(), billing.topPlan());
  assert.equal(await billing.effectivePlan(), billing.topPlan());
  reset();
});

test('LICENSED_PLAN com nome válido continua dando exatamente esse plano (instalação de cliente)', async () => {
  reset();
  for (const p of Object.keys(planConfig.PLAN_RANK)) {
    process.env.LICENSED_PLAN = p;
    assert.equal(await billing.effectivePlan(), p);
  }
  process.env.LICENSED_PLAN = 'essencial';
  assert.equal(await billing.effectivePlan(), 'essencial');
  process.env.LICENSED_PLAN = 'nome-que-nao-existe';
  assert.equal(billing.licensedPlan(), null);
  reset();
});

test('cliente com assinatura do Stripe continua com o plano da assinatura', async () => {
  reset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  await db.run(`UPDATE subscription SET stripe_subscription_id = 'sub_x', plan = 'essencial', status = 'active' WHERE id = 1`);
  assert.equal(await billing.effectivePlan(), 'essencial');
  await db.run(`UPDATE subscription SET status = 'canceled' WHERE id = 1`);
  assert.equal(await billing.effectivePlan(), 'basico');
  reset();
});
