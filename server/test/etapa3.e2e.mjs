// Etapa 3 in a real browser: offices, documents with expiry, e-signature, AI buttons, suggested candidates, payroll export,
// API key and webhook cards, plan locks, translations and phone width.
//   (from the repo root)  npm run build && TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node server/test/etapa3.e2e.mjs
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const mk = (t) => `roster_e3e_${t}_${process.pid}_${Date.now() % 100000}`;
const urlOf = (db) => ADMIN_URL.replace(/\/[^/]*$/, `/${db}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`); } };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

const admin = new pg.Client({ connectionString: ADMIN_URL });
const dbs = []; const procs = []; const fakes = []; let browser;
async function boot(db, env = {}) {
  const port = await freePort();
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: urlOf(db), JWT_SECRET: 'e2e-secret-e2e-secret-123', BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, BOOTSTRAP_OWNER_NAME: 'Olivia Owner', FRONTEND_URL: '', SMTP_HOST: '', AUTOMATION_EMAILS: '0', ...env }, stdio: 'ignore' });
  procs.push(proc);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const token = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: OWNER.email, password: OWNER.pass }) })).json()).token;
  const account = (await (await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json()).account;
  const call = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); return r.status === 204 ? null : r.json(); };
  return { base, token, account, call };
}
async function open(srv, vp, { lang = 'en', collect = false } = {}) {
  const ctx = await browser.newContext({ ...vp, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.addInitScript(([s, lang, collect]) => {
    try {
      localStorage.setItem('roster-lang', lang);
      localStorage.setItem('roster-crm-session', JSON.stringify({ token: s.token, account: s.account })); localStorage.setItem(`roster-tour-done-${s.account.id}`, '1');
      if (collect) window.__COLLECT_I18N__ = true;
    } catch { /* */ }
  }, [{ token: srv.token, account: srv.account }, lang, collect]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = async (page, srv, hash) => { await page.goto(`${srv.base}/#${hash}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500); };

try {
  await admin.connect();
  const MAIN = mk('main'), LOW = mk('low');
  for (const db of [MAIN, LOW]) { await admin.query(`CREATE DATABASE ${db}`); dbs.push(db); const s = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: urlOf(db) }, encoding: 'utf8' }); if (s.status !== 0) throw new Error('seed ' + s.stderr); }
  // fake Anthropic
  const anth = http.createServer(async (req, res) => { const b = JSON.parse((await readBody(req)).toString() || '{}'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: b.model, stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: 'Dependable forklift operator with OSHA training.' }], usage: { input_tokens: 3, output_tokens: 6 } })); });
  await new Promise((r) => anth.listen(0, '127.0.0.1', r)); fakes.push(anth);
  // fake Documenso
  const signed = await (async () => { const d = await PDFDocument.create(); d.addPage([612, 792]); return Buffer.from(await d.save()); })();
  const docs = new Map(); let seq = 70;
  const dm = http.createServer(async (req, res) => {
    const base = `http://127.0.0.1:${dm.address().port}`; const buf = await readBody(req);
    const json = (c, o) => { res.statusCode = c; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    let m;
    if (req.method === 'POST' && req.url === '/api/v1/documents') { const b = JSON.parse(buf.toString()); const id = ++seq; docs.set(id, { status: 'DRAFT', n: b.recipients.length }); return json(200, { documentId: id, uploadUrl: `${base}/upload/${id}`, recipients: b.recipients.map((r, i) => ({ recipientId: 1 + i, email: r.email, signingUrl: `${base}/sign/${id}` })) }); }
    if (req.method === 'PUT' && req.url.startsWith('/upload/')) return json(200, {});
    if (req.method === 'POST' && /\/fields$/.test(req.url)) return json(200, {});
    if (req.method === 'POST' && (m = req.url.match(/documents\/(\d+)\/send$/))) { docs.get(+m[1]).status = 'PENDING'; return json(200, {}); }
    if (req.method === 'GET' && (m = req.url.match(/documents\/(\d+)\/download$/))) return json(200, { downloadUrl: `${base}/files/x.pdf` });
    if (req.method === 'GET' && req.url.startsWith('/files/')) { res.setHeader('content-type', 'application/pdf'); return res.end(signed); }
    if (req.method === 'GET' && (m = req.url.match(/documents\/(\d+)$/))) { const d = docs.get(+m[1]); const done = d.status === 'COMPLETED'; return json(200, { id: +m[1], status: d.status, recipients: Array.from({ length: d.n }, () => ({ readStatus: done ? 'OPENED' : 'NOT_OPENED', signingStatus: done ? 'SIGNED' : 'NOT_SIGNED', signedAt: done ? '2026-10-12T10:00:00Z' : null })), completedAt: done ? '2026-10-12T10:00:00Z' : null }); }
    json(404, {});
  });
  await new Promise((r) => dm.listen(0, '127.0.0.1', r)); fakes.push(dm);

  const main = await boot(MAIN, { LICENSED_PLAN: 'completo', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: `http://127.0.0.1:${anth.address().port}`, DOCUMENSO_URL: `http://127.0.0.1:${dm.address().port}`, DOCUMENSO_API_TOKEN: 'tok' });
  const low = await boot(LOW, { LICENSED_PLAN: 'essencial' });

  const cl = await main.call('POST', '/api/clients', { company_name: 'Acme Logistics', contact_name: 'Dana Client', contact_email: 'dana@acme.test' });
  const job = await main.call('POST', '/api/jobs', { client_id: cl.id, title: 'Forklift Operator', notes: 'OSHA certified' });
  const cand = await main.call('POST', '/api/candidates', { name: 'Maria Silva', email: 'maria@example.com', phone: '(512) 555-0142', current_title: 'Forklift driver', skills: 'forklift, OSHA' });
  const today = new Date().toISOString().slice(0, 10);
  const sub = await main.call('POST', '/api/submissions', { candidate_id: cand.id, job_id: job.id, stage: 'Placed', owner_user_id: cand.owner_user_id, submitted_date: today });
  const other = await main.call('POST', '/api/candidates', { name: 'Sam Stock', current_title: 'Inventory clerk', skills: 'inventory, OSHA' });
  const pl = await main.call('POST', '/api/placements', { submission_id: sub.id, candidate_id: cand.id, client_id: cl.id, job_id: job.id, start_date: today, pay_rate: 20, bill_rate: 30, placement_fee: 500, status: 'Active' });
  await main.call('POST', '/api/timesheets', { placement_id: pl.id, period_start: '2026-09-01', period_end: '2026-09-14', hours: 80, status: 'Sent' });
  await low.call('POST', '/api/candidates', { name: 'Low Person', email: 'l@example.com' });

  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu'] });
  const desktop = { viewport: { width: 1280, height: 900 } };
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

  console.log('\n== Settings: offices, connections, API key, webhook');
  {
    const { ctx, page, errors } = await open(main, desktop);
    await go(page, main, '/settings');
    await page.waitForSelector('[data-testid="offices-card"]');
    await page.fill('[data-testid="office-name"]', 'Dallas');
    await page.click('[data-testid="office-add"]');
    await page.waitForSelector('[data-testid="office-row"]');
    check('offices: the new office is listed', (await page.textContent('[data-testid="offices-card"]')).includes('Dallas'));
    await page.waitForSelector('[data-testid="connections-card"] >> text=0 of 300 used this month');
    check('connections: AI shows its monthly use', true);
    check('connections: e-signature shows Connected', (await page.textContent('[data-testid="connections-card"]')).includes('Connected'));
    await page.fill('[data-testid="key-name"]', 'Zapier');
    await page.click('[data-testid="key-add"]');
    await page.waitForSelector('[data-testid="new-key-value"]');
    const key = await page.inputValue('[data-testid="new-key-value"]');
    check('API: the key is shown once and works', /^rk_/.test(key) && (await fetch(`${main.base}/api/v1/candidates?limit=1`, { headers: { Authorization: `Bearer ${key}` } })).status === 200);
    await page.fill('[data-testid="hook-url"]', 'http://example.com/hook');
    await page.click('[data-testid="hook-add"]');
    await page.waitForSelector('text=must start with https://');
    check('webhooks: a plain http address is refused with a clear message', true);
    check('settings: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== Clients / Candidates / Jobs: office, AI, documents, signature, suggestions');
  {
    const { ctx, page, errors } = await open(main, desktop, { collect: true });
    await go(page, main, '/clients');
    await page.waitForSelector('text=Acme Logistics');
    await page.click('button[aria-label="Edit"]');
    await page.selectOption('[data-testid="office-select"]', { label: 'Dallas' });
    await page.click('button:has-text("Save Client")');
    await page.waitForSelector('[data-testid="office-filter"]');
    await page.selectOption('[data-testid="office-filter"]', { label: 'Dallas' });
    check('clients: office saved, filter shows the client', (await page.textContent('body')).includes('Acme Logistics'));
    await page.selectOption('[data-testid="office-filter"]', '');
    await go(page, main, '/jobs');
    await page.waitForSelector('text=Forklift Operator');
    await page.click('button[aria-label="Edit"]');
    await page.selectOption('[data-testid="office-select"]', { label: 'Dallas' });
    await page.click('[data-testid="ai-job"]');
    await page.waitForSelector('[data-testid="ai-msg"]');
    check('jobs: AI writes the description into the notes, to be reviewed', (await page.inputValue('textarea')).includes('Dependable forklift operator') && (await page.textContent('[data-testid="ai-msg"]')).includes('1 of 300'));
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(600);
    await page.click('button[aria-label="Suggested candidates"]');
    await page.waitForSelector('[data-testid="sugg-list"], [data-testid="sugg-empty"]');
    check('jobs: suggestions open (Sam Stock matches on OSHA)', (await page.textContent('body')).includes('Sam Stock'));
    await page.keyboard.press('Escape'); await page.click('text=Close').catch(() => {});

    await go(page, main, '/candidates');
    await page.waitForSelector('text=Maria Silva');
    await page.locator('tr, [role="row"], div').filter({ hasText: 'Maria Silva' }).first();
    await page.locator('button[aria-label="Documents & signatures"]').first().click();
    await page.waitForSelector('[data-testid="docs-modal"]');
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await page.selectOption('[data-testid="doc-type"]', 'I-9');
    await page.fill('[data-testid="doc-expires"]', soon);
    await page.click('[data-testid="doc-add"]');
    await page.waitForSelector('[data-testid="doc-row"]');
    check('documents: added with an expiry badge', (await page.textContent('[data-testid="doc-row"]')).includes('Expires'));
    await page.click('button:has-text("Mark received")');
    await page.waitForSelector('[data-testid="doc-row"] >> text=Received');
    check('documents: marked received', true);
    await page.setInputFiles('[data-testid="sig-file"]', { name: 'offer-letter.pdf', mimeType: 'application/pdf', buffer: signed });
    check('signature: send needs the signer, which is pre-filled from the candidate', (await page.inputValue('[data-testid="sig-email"]')) === 'maria@example.com');
    await page.click('[data-testid="sig-send"]');
    await page.waitForSelector('[data-testid="sig-list"] >> text=Sent for signature');
    check('signature: sent through Documenso and listed', true);
    docs.get(seq).status = 'COMPLETED';
    await page.click('button:has-text("Check status")');
    await page.waitForSelector('[data-testid="sig-download"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="sig-download"]')]);
    const saved = await dl.path();
    check('signature: the signed PDF downloads', fs.readFileSync(saved).subarray(0, 5).toString() === '%PDF-');
    await page.keyboard.press('Escape'); await page.click('text=Close').catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('button[aria-label="Edit"]').first().click();
    await page.click('[data-testid="ai-summary"]');
    await page.waitForSelector('[data-testid="ai-msg"]');
    check('candidates: AI fills the profile field and says to review it', (await page.textContent('[data-testid="ai-msg"]')).includes('Read it and fix'));
    check('candidates: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== Timesheets payroll export and Reports by office');
  {
    const { ctx, page, errors } = await open(main, desktop);
    await go(page, main, '/timesheets');
    await page.waitForSelector('[data-testid="payroll-open"]');
    await page.click('[data-testid="payroll-open"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="payroll-download"]')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('payroll: CSV downloads with hours and gross pay', csv.includes('Gross pay (hours x rate)') && csv.includes('Maria Silva') && csv.includes('1600.00'), csv.slice(0, 200));
    await go(page, main, '/reports');
    await page.waitForSelector('[data-testid="by-office"]');
    check('reports: results by office appear', (await page.textContent('[data-testid="by-office"]')).includes('Dallas'));
    check('reports/timesheets: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== Essential plan: the Complete tools stay closed');
  {
    const { ctx, page } = await open(low, desktop);
    await go(page, low, '/settings');
    await page.waitForSelector('[data-testid="offices-card"]');
    check('essential: offices, connections and API cards explain they are Complete', (await page.locator('[data-testid="complete-locked"]').count()) === 3);
    await go(page, low, '/timesheets');
    await page.waitForSelector('[data-testid="timesheet-kpis"]');
    check('essential: no payroll export button', (await page.locator('[data-testid="payroll-open"]').count()) === 0);
    await go(page, low, '/candidates');
    await page.waitForSelector('text=Low Person');
    await page.click('button[aria-label="Edit"]');
    check('essential: no AI button in the candidate form', (await page.locator('[data-testid="ai-summary"]').count()) === 0);
    await ctx.close();
  }

  console.log('\n== phone width and translations');
  {
    const { ctx, page, errors } = await open(main, phone);
    await go(page, main, '/settings');
    await page.waitForSelector('[data-testid="developer-card"]');
    check('phone: settings has no sideways scroll', (await overflow(page)) <= 0, await overflow(page));
    await go(page, main, '/candidates');
    await page.waitForSelector('text=Maria Silva');
    await page.locator('button[aria-label="Documents & signatures"]').first().click();
    await page.waitForSelector('[data-testid="docs-modal"]');
    check('phone: documents window has no sideways scroll', (await overflow(page)) <= 0, await overflow(page));
    check('phone: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(main, desktop, { lang: 'pt', collect: true });
    await go(page, main, '/settings'); await page.waitForSelector('[data-testid="developer-card"]'); await page.waitForTimeout(500);
    await go(page, main, '/candidates'); await page.waitForSelector('text=Maria Silva');
    await page.locator('button[aria-label="Documentos e assinaturas"]').first().click(); await page.waitForSelector('[data-testid="docs-modal"]'); await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.click('text=Fechar').catch(() => {});
    await go(page, main, '/jobs'); await page.waitForSelector('text=Forklift Operator');
    await page.locator('button[aria-label="Candidatos sugeridos"]').first().click(); await page.waitForSelector('[data-testid="sugg-list"], [data-testid="sugg-empty"]');
    await page.keyboard.press('Escape'); await page.click('text=Fechar').catch(() => {});
    await go(page, main, '/timesheets'); await page.waitForSelector('[data-testid="payroll-open"]'); await page.click('[data-testid="payroll-open"]'); await page.waitForTimeout(300);
    await go(page, main, '/reports'); await page.waitForSelector('[data-testid="by-office"]');
    await go(page, main, '/automations'); await page.waitForTimeout(500);
    const missing = await page.evaluate(() => [...(window.__i18nMissing || [])]);
    check('Portuguese: nothing missing on the new screens', missing.length === 0, missing);
    await ctx.close();
  }
} catch (e) {
  fail++; console.log('FAIL (exception)', e);
} finally {
  try { await browser?.close(); } catch { /* */ }
  for (const p of procs) p.kill('SIGTERM');
  for (const f of fakes) f.close();
  await new Promise((r) => setTimeout(r, 400));
  for (const db of dbs) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
