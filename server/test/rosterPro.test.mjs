// Recursos pro de Roster: página de vagas, aprovação de horas pelo cliente, margem e exportação.
// Precisa de um Postgres local (cria e apaga um banco temporário), como auth.test.mjs.
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/rosterPro.test.mjs
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
const DB_NAME = `roster_pro_${process.pid}_${Date.now() % 100000}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };

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
async function db_sql(text, params) { const c = new pg.Client({ connectionString: DB_URL }); await c.connect(); try { return (await c.query(text, params)).rows; } finally { await c.end(); } }
async function stop(srv) { await srv.stop(); servers.splice(servers.indexOf(srv), 1); }

before(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL }); await admin.connect();
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  const seed = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: DB_URL, SEED_SAMPLE_DATA: '1' }, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
});
after(async () => {
  for (const s of servers) if (s.proc.exitCode === null && s.proc.signalCode === null) await s.stop();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`); await admin.end();
});


const open = async (s) => (await s.call('GET', '/api/jobs', { token: s.token })).json.find((j) => j.status === 'Open');

test('vagas públicas: essencial recebe candidatura no funil; básico não vê a página', async () => {
  let s = await start({ LICENSED_PLAN: 'basico' });
  assert.equal((await s.call('GET', '/api/public/careers')).status, 404);
  await stop(s);
  s = await start({ LICENSED_PLAN: 'essencial' });
  const list = await s.call('GET', '/api/public/careers');
  assert.equal(list.status, 200); assert.ok(list.json.jobs.length > 0);
  assert.ok(list.json.jobs.every((j) => !('owner_user_id' in j) && !('notes' in j)), 'não vaza dados internos');
  const job = list.json.jobs[0];
  const bad = await s.call('POST', `/api/public/careers/${job.id}/apply`, { body: { name: 'A', email: 'x' } });
  assert.equal(bad.status, 400);
  const ok = await s.call('POST', `/api/public/careers/${job.id}/apply`, { body: { name: 'Ana Souza', email: 'Ana.Pro@Example.com', phone: '555-0100', message: '=cmd|x' } });
  assert.equal(ok.status, 201);
  assert.equal((await s.call('POST', `/api/public/careers/${job.id}/apply`, { body: { name: 'Ana Souza', email: 'ana.pro@example.com' } })).status, 201, 'repetir não duplica');
  assert.equal((await s.call('POST', `/api/public/careers/${job.id}/apply`, { body: { name: 'Bot', email: 'bot@example.com', website: 'http://spam' } })).json.ok, true);
  const cands = (await s.call('GET', '/api/candidates', { token: s.token })).json;
  const mine = cands.filter((c) => c.email === 'ana.pro@example.com');
  assert.equal(mine.length, 1); assert.equal(mine[0].source, 'Careers page');
  assert.equal(cands.filter((c) => c.email === 'bot@example.com').length, 0, 'robô ignorado');
  const subs = (await s.call('GET', '/api/submissions', { token: s.token })).json;
  assert.equal(subs.filter((x) => x.candidate_id === mine[0].id && x.job_id === job.id).length, 1);
  assert.equal(subs.find((x) => x.candidate_id === mine[0].id).stage, 'Sourced');
  assert.equal((await s.call('POST', `/api/public/careers/999999/apply`, { body: { name: 'Ana Souza', email: 'ana2@example.com' } })).status, 404);
  await stop(s);
});

test('horas: margem e link de aprovação do cliente no Essential; CSV de horas e margem no Complete; a resposta aparece nos selos do portal', async () => {
  let s = await start({ LICENSED_PLAN: 'basico' });
  for (const u of ['/api/timesheets/margin', '/api/timesheets/export']) assert.equal((await s.call('GET', u, { token: s.token })).status, 402, `${u} no Basic`);
  assert.equal((await s.call('POST', '/api/timesheets/1/approval-link', { token: s.token })).status, 402);
  assert.equal((await s.call('GET', `/api/public/approval/${'a'.repeat(32)}`)).status, 404, 'o link público também some sem o plano');
  await stop(s);

  s = await start({ LICENSED_PLAN: 'essencial' });
  const m = await s.call('GET', '/api/timesheets/margin', { token: s.token });
  assert.equal(m.status, 200); assert.ok(m.json.rows.length > 0);
  const r = m.json.rows[0];
  assert.equal(r.cost, Math.round(r.hours * r.pay_rate * 100) / 100);
  assert.equal(r.margin, Math.round((r.amount - r.cost) * 100) / 100);
  assert.ok(Math.abs(m.json.totals.margin - (m.json.totals.billed - m.json.totals.cost)) < 0.05);
  assert.equal((await s.call('GET', '/api/timesheets/margin?from=2000-01-01&to=2000-01-02', { token: s.token })).json.rows.length, 0);
  assert.equal((await s.call('GET', '/api/timesheets/export', { token: s.token })).status, 402, 'CSV de horas e margem é do Complete (junto com a exportação da folha)');
  assert.equal((await s.call('GET', '/api/timesheets/payroll-export', { token: s.token })).status, 402);

  const link = await s.call('POST', `/api/timesheets/${r.id}/approval-link`, { token: s.token });
  assert.equal(link.status, 200); assert.match(link.json.url, /^http:\/\/app\.test\/#\/approve\/[\w-]{30,}$/);
  const tk = link.json.token;
  const view = await s.call('GET', `/api/public/approval/${tk}`);
  assert.equal(view.status, 200); assert.equal(view.json.hours, r.hours); assert.ok(!('amount' in view.json), 'cliente não vê a margem');
  assert.equal((await s.call('GET', '/api/public/approval/short')).status, 404);
  assert.equal((await s.call('GET', `/api/public/approval/${'a'.repeat(32)}`)).status, 404);
  assert.equal((await s.call('POST', `/api/public/approval/${tk}`, { body: { decision: 'approved' } })).status, 400, 'precisa do nome');
  const dec = await s.call('POST', `/api/public/approval/${tk}`, { body: { decision: 'approved', name: 'Carlos Client', note: 'ok' } });
  assert.equal(dec.status, 200);
  assert.equal((await s.call('POST', `/api/public/approval/${tk}`, { body: { decision: 'rejected', name: 'Outro' } })).status, 409, 'só uma resposta');
  // a mesma resposta aparece nos selos do portal do cliente ("Client approved") na folha de horas
  const row = (await s.call('GET', '/api/timesheets', { token: s.token })).json.find((x) => x.id === r.id);
  assert.equal(row.client_approved_by, 'Carlos Client'); assert.ok(row.client_approved_at); assert.equal(row.client_dispute_note, null);
  assert.equal(row.approval_decision, 'approved');
  // renovar o link zera a decisão
  const link2 = await s.call('POST', `/api/timesheets/${r.id}/approval-link`, { token: s.token });
  assert.notEqual(link2.json.token, tk);
  assert.equal((await s.call('GET', `/api/public/approval/${tk}`)).status, 404, 'link antigo morre');
  assert.equal((await s.call('GET', `/api/public/approval/${link2.json.token}`)).json.decision, 'approved', 'o cliente já aprovou: vale também pelo portal');
  assert.equal((await s.call('POST', '/api/timesheets/999999/approval-link', { token: s.token })).status, 404);
  // recusa pelo link vira "Client disputed"
  await db_sql(`UPDATE timesheets_invoices SET client_approved_at = NULL, client_approved_by = NULL, approval_decision = NULL WHERE id = $1`, [r.id]);
  const l3 = await s.call('POST', `/api/timesheets/${r.id}/approval-link`, { token: s.token });
  assert.equal((await s.call('POST', `/api/public/approval/${l3.json.token}`, { body: { decision: 'rejected', name: 'Carlos Client', note: 'Too many hours' } })).status, 200);
  const row2 = (await s.call('GET', '/api/timesheets', { token: s.token })).json.find((x) => x.id === r.id);
  assert.equal(row2.client_dispute_note, 'Too many hours'); assert.equal(row2.client_approved_at, null);
  await stop(s);

  s = await start({ LICENSED_PLAN: 'completo' });
  const csv = await s.call('GET', '/api/timesheets/export', { token: s.token });
  assert.equal(csv.status, 200); assert.match(csv.text.split('\r\n')[0], /^Candidate,Client,Job/);
  assert.match(csv.text, /rejected/, 'a coluna de aprovação do cliente vem do link ou do portal');
  assert.equal((await s.call('GET', '/api/timesheets/export')).status, 401, 'precisa de login');
  assert.equal((await s.call('GET', '/api/timesheets/payroll-export', { token: s.token })).status, 200, 'a exportação da folha continua igual');
  await stop(s);
});

test('instalação que já tinha respostas pelo link antes do portal: viram selos "Client approved / disputed" uma vez só', async () => {
  // simula o banco da produção anterior: respostas só nos campos approval_* e a marca da migração ainda não existe
  await db_sql(`DELETE FROM app_meta WHERE key = 'approval_link_backfill'`);
  const ids = (await db_sql(`SELECT id FROM timesheets_invoices ORDER BY id LIMIT 2`)).map((x) => x.id);
  assert.equal(ids.length, 2);
  await db_sql(`UPDATE timesheets_invoices SET client_approved_at = NULL, client_approved_by = NULL, client_dispute_note = NULL, approval_decision = NULL WHERE id = ANY($1)`, [ids]);
  await db_sql(`UPDATE timesheets_invoices SET approval_decision = 'approved', approved_at = '2026-10-01T10:00:00.000Z', approved_by = 'Old Approver' WHERE id = $1`, [ids[0]]);
  await db_sql(`UPDATE timesheets_invoices SET approval_decision = 'rejected', approved_at = '2026-10-02T10:00:00.000Z', approved_by = 'Old Rejecter', approval_note = 'Wrong week' WHERE id = $1`, [ids[1]]);
  let s = await start({ LICENSED_PLAN: 'essencial' });
  const rows = (await s.call('GET', '/api/timesheets', { token: s.token })).json;
  const a = rows.find((x) => x.id === ids[0]), b = rows.find((x) => x.id === ids[1]);
  assert.equal(a.client_approved_by, 'Old Approver'); assert.match(String(a.client_approved_at), /^2026-10-01/);
  assert.equal(b.client_dispute_note, 'Wrong week'); assert.equal(b.client_approved_at, null);
  // o cliente passa a aprovar a recusada pelo portal: o próximo boot não ressuscita a recusa antiga
  await db_sql(`UPDATE timesheets_invoices SET client_dispute_note = NULL, client_approved_at = now(), client_approved_by = 'Portal' WHERE id = $1`, [ids[1]]);
  await stop(s);
  s = await start({ LICENSED_PLAN: 'essencial' });
  const b2 = (await s.call('GET', '/api/timesheets', { token: s.token })).json.find((x) => x.id === ids[1]);
  assert.equal(b2.client_dispute_note, null); assert.equal(b2.client_approved_by, 'Portal');
  await stop(s);
});

test('currículo: leitura simples para todos; a IA lê no Essential com a chave e, se falhar, a leitura simples responde', async () => {
  const seen = [];
  let mode = 'ok';
  const fake = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      seen.push({ url: req.url, key: req.headers['x-api-key'], body: b });
      if (mode === 'down') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"down"}}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'm', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: '{"name":"Lia Moreira","email":"LIA@Example.com","phone":"555-0199","current_title":"QA Analyst","current_employer":"Acme","skills":"Testing, SQL","resume_summary":"Five years in QA."}' }] }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const text = 'Lia Moreira\nQA Analyst at Acme, five years of experience in testing and SQL. lia@example.com 555-0199';
  const aiEnv = { ANTHROPIC_API_KEY: 'sk-secret', ANTHROPIC_BASE_URL: `http://127.0.0.1:${fake.address().port}` };
  // Basic: nunca chama a IA (mesmo com a chave), mas a leitura simples funciona
  let s = await start({ LICENSED_PLAN: 'basico', ...aiEnv });
  let r = await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text } });
  assert.equal(r.status, 200); assert.equal(r.json.engine, 'simple'); assert.equal(r.json.email, 'lia@example.com');
  assert.equal(seen.length, 0, 'a IA não é chamada no Basic');
  await stop(s);
  // Essential sem a chave: leitura simples, sem erro
  s = await start({ LICENSED_PLAN: 'essencial' });
  r = await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text } });
  assert.equal(r.status, 200); assert.equal(r.json.engine, 'simple');
  await stop(s);
  // Essential com a chave: a IA lê
  s = await start({ LICENSED_PLAN: 'essencial', ...aiEnv });
  assert.equal((await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text: 'curto' } })).status, 400);
  assert.equal((await s.call('POST', '/api/candidates/parse-resume', { body: { text } })).status, 401);
  r = await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text } });
  assert.equal(r.status, 200); assert.equal(r.json.engine, 'ai'); assert.equal(r.json.name, 'Lia Moreira'); assert.equal(r.json.email, 'lia@example.com'); assert.equal(r.json.skills, 'Testing, SQL');
  assert.equal(seen.at(-1).url, '/v1/messages'); assert.equal(seen.at(-1).key, 'sk-secret');
  assert.ok(!s.logs().includes('sk-secret'), 'chave não vai para o log');
  // a IA fora do ar: a leitura simples responde (nada de erro para a pessoa)
  mode = 'down';
  r = await s.call('POST', '/api/candidates/parse-resume', { token: s.token, body: { text } });
  assert.equal(r.status, 200); assert.equal(r.json.engine, 'simple'); assert.equal(r.json.email, 'lia@example.com');
  await stop(s); fake.close();
});
