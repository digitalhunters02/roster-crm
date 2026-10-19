// Conector opcional com o Rex: desligado por padrão, conecta por código de 6 dígitos ou por chave, manda a fatura enviada e a baixa
// de pagamento sem duplicar, guarda a chave cifrada e se recupera quando o Rex volta. O Rex é simulado por um servidor local.
//   TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node --test server/test/connector.test.mjs
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
const SAMPLE_DB = mk('conn');
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
    FRONTEND_URL: 'http://app.test', SMTP_HOST: '', AUTOMATION_EMAILS: '0', CONNECTOR_ALLOW_INSECURE: '1',
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
  for (const db of [SAMPLE_DB]) { await admin.query(`CREATE DATABASE ${db}`); dbs.push(db); }
  const seed = (db, flag) => spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: urlOf(db), ...(flag ? { SEED_SAMPLE_DATA: '1' } : {}) }, encoding: 'utf8' });
  const s2 = seed(SAMPLE_DB, true); assert.equal(s2.status, 0, s2.stderr);
});
after(async () => {
  for (const s of servers) if (s.proc.exitCode === null && s.proc.signalCode === null) await s.stop();
  for (const db of dbs) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await admin.end();
});


// ---------------------------------------------------------------- Rex simulado
const KEY = 'rex_live_goodkey';
const seen = []; let down = false; const rexInvoices = new Map();
const rex = http.createServer((req, res) => {
  let raw = ''; req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    seen.push({ method: req.method, url: req.url, body, auth: req.headers.authorization || '' });
    if (req.method === 'POST' && req.url === '/api/v1/pair') {
      if (body.email === 'dono@rex.test' && body.code === '123456') return json({ key: KEY, name: body.name, appUrl: 'http://127.0.0.1:9/site' });
      return json({ error: 'Código inválido ou vencido.' }, 400);
    }
    if (down) return json({ error: 'boom' }, 500);
    if (req.headers.authorization !== `Bearer ${KEY}`) return json({ error: 'Invalid key' }, 401);
    const u = req.url.replace('/api/v1', '');
    if (req.method === 'GET' && u === '/me') return json({ product: 'rex', plan: 'solo', planName: 'Solo', appUrl: 'http://127.0.0.1:9/site' });
    if (req.method === 'POST' && u === '/invoices') {
      const ex = rexInvoices.get(body.externalId);
      if (ex) return json({ invoice: ex, existing: true });
      const inv = { id: `uuid-${rexInvoices.size + 1}`, externalId: body.externalId, status: 'sent', body };
      rexInvoices.set(body.externalId, inv); return json({ invoice: inv, existing: false }, 201);
    }
    const m = u.match(/^\/invoices\/([^/]+)\/paid$/);
    if (req.method === 'POST' && m) {
      const inv = rexInvoices.get(decodeURIComponent(m[1]));
      if (!inv) return json({ error: 'not found' }, 404);
      const already = inv.status === 'paid'; inv.status = 'paid'; return json({ ok: true, already });
    }
    json({ error: 'Unknown endpoint' }, 404);
  });
});
await new Promise((r) => rex.listen(0, '127.0.0.1', r));
const DEST = `http://127.0.0.1:${rex.address().port}`;
const writes = () => seen.filter((s) => s.method !== 'GET' && s.url !== '/api/v1/pair');
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('connector: off by default, pairing code, no duplicates, payment, recovery', async () => {
  const s = await start(SAMPLE_DB);
  try {
    const T = s.token;
    const ts = async (id) => (await s.call('GET', '/api/timesheets', { token: T })).json.find((x) => x.id === id);
    const put = async (id, patch) => { const cur = await ts(id); const b = { placement_id: cur.placement_id, period_start: cur.period_start, period_end: cur.period_end, hours: cur.hours, amount: cur.amount, status: cur.status, ...patch }; return s.call('PUT', `/api/timesheets/${id}`, { token: T, body: b }); };
    const nonDraft = (await sql(SAMPLE_DB, `SELECT id, status FROM timesheets_invoices WHERE status <> 'Draft' AND amount > 0 ORDER BY id`));
    const paidCount = nonDraft.filter((x) => x.status === 'Paid').length;
    const draftId = (await sql(SAMPLE_DB, `SELECT id FROM timesheets_invoices WHERE status = 'Draft' ORDER BY id LIMIT 1`))[0].id;

    // 1) desligado: nada sai, nem ao mudar fatura
    let st = (await s.call('GET', '/api/connector/status', { token: T })).json;
    assert.equal(st.enabled, false);
    assert.equal((await put(draftId, { status: 'Draft' })).status, 200);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(seen.length, 0, 'desligado não chama ninguém');

    // 2) validação: endereço ruim, prefixo errado, chave recusada
    assert.equal((await s.call('PUT', '/api/connector/settings', { token: T, body: { enabled: true, baseUrl: 'ftp://x', apiKey: 'rex_live_x' } })).status, 400);
    assert.equal((await s.call('PUT', '/api/connector/settings', { token: T, body: { enabled: true, baseUrl: DEST, apiKey: 'flx_live_x' } })).status, 400);
    const bad = await s.call('PUT', '/api/connector/settings', { token: T, body: { enabled: true, baseUrl: DEST, apiKey: 'rex_live_wrong' } });
    assert.equal(bad.status, 400); assert.match(bad.json.error, /invalid/i);
    assert.equal((await s.call('GET', '/api/connector/status', { token: T })).json.enabled, false);

    // 3) pareamento por código: errado recusa; certo liga, a chave nunca volta e fica cifrada
    assert.equal((await s.call('POST', '/api/connector/pair', { token: T, body: { baseUrl: DEST, email: 'dono@rex.test', code: '12' } })).status, 400);
    const wrong = await s.call('POST', '/api/connector/pair', { token: T, body: { baseUrl: DEST, email: 'dono@rex.test', code: '000000' } });
    assert.equal(wrong.status, 400); assert.match(wrong.json.error, /inválido|invalid/i);
    const ok = await s.call('POST', '/api/connector/pair', { token: T, body: { baseUrl: DEST, email: 'dono@rex.test', code: '123 456' } });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.json.enabled, true); assert.equal(ok.json.remote.planName, 'Solo'); assert.equal(ok.json.keySaved, true);
    assert.ok(!ok.text.includes(KEY), 'a chave nunca volta ao navegador');
    const stored = (await sql(SAMPLE_DB, 'SELECT api_key FROM connector_settings'))[0].api_key;
    assert.ok(stored.startsWith('v1:') && !stored.includes('goodkey'), 'chave cifrada no banco');
    assert.equal(seen.find((x) => x.url === '/api/v1/pair' && x.body.code === '123456').body.name, 'Roster');

    // 4) faturas antigas só vão quando o dono pede ("enviar as antigas"); rascunho nunca
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(writes().length, 0, 'ligar não despeja as faturas antigas sem pedir');
    const re = await s.call('POST', '/api/connector/resync', { token: T, body: { existing: true } });
    assert.equal(re.status, 200);
    assert.equal(re.json.sent, nonDraft.length);
    assert.equal(rexInvoices.size, nonDraft.length);
    assert.ok(![...rexInvoices.keys()].includes(`roster-invoice-${draftId}`));
    const one = [...rexInvoices.values()][0].body;
    assert.equal(one.send, true); assert.equal(one.notify, false); assert.equal(one.reminders, false);
    assert.ok(one.customerName && one.items[0].unitPrice > 0 && /^Staffing:/.test(one.items[0].description));
    assert.equal([...rexInvoices.values()].filter((v) => v.status === 'paid').length, paidCount, 'as pagas já entram baixadas');
    const before = writes().length;
    assert.equal((await s.call('POST', '/api/connector/resync', { token: T, body: { existing: true } })).json.sent, 0, 'reenviar não duplica');
    assert.equal(writes().length, before);

    // 5) fatura nova: rascunho → enviada → paga, uma vez cada
    seen.length = 0;
    await put(draftId, { status: 'Sent' });
    assert.ok(await until(() => rexInvoices.has(`roster-invoice-${draftId}`)));
    assert.equal(rexInvoices.get(`roster-invoice-${draftId}`).status, 'sent');
    await put(draftId, { status: 'Paid' });
    assert.ok(await until(() => rexInvoices.get(`roster-invoice-${draftId}`).status === 'paid'));
    await put(draftId, { status: 'Paid', hours: 41 }); // editar de novo não repete a baixa
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(seen.filter((x) => x.url.endsWith('/paid')).length, 1);
    assert.equal(seen.filter((x) => x.url === '/api/v1/invoices').length, 1);

    // 6) Rex fora do ar: fica pendente, aparece no registro e se recupera
    seen.length = 0; down = true;
    const sentId = nonDraft.find((x) => x.status === 'Sent').id;
    rexInvoices.delete(`roster-invoice-${sentId}`);
    await sql(SAMPLE_DB, 'DELETE FROM connector_sync WHERE timesheet_id = $1', [sentId]);
    await put(sentId, { status: 'Sent' });
    assert.ok(await until(async () => (await s.call('GET', '/api/connector/status', { token: T })).json.log.some((l) => !l.ok && l.timesheetId === sentId)));
    down = false;
    const rec = await s.call('POST', '/api/connector/resync', { token: T, body: {} });
    assert.equal(rec.json.sent, 1);
    assert.ok(rexInvoices.has(`roster-invoice-${sentId}`));

    // 7) desligar: novas mudanças não saem mais
    await s.call('PUT', '/api/connector/settings', { token: T, body: { enabled: false } });
    seen.length = 0;
    await put(sentId, { status: 'Overdue' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(seen.length, 0);
    assert.equal((await s.call('GET', '/api/connector/status', { token: T })).json.enabled, false);
    // sem login: recusado
    assert.equal((await s.call('GET', '/api/connector/status')).status, 401);
  } finally { rex.close(); }
});
