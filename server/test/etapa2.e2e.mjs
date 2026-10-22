// Etapa 2 in a real browser: client portal (signed out), invoice + print view, margin, send invoice, messages (e-mail / SMS),
// Twilio connect card, plan locks, phone width and missing translations.
//   (from the repo root)  npm run build && TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node server/test/etapa2.e2e.mjs
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const mk = (t) => `roster_e2e_${t}_${process.pid}_${Date.now() % 100000}`;
const urlOf = (db) => ADMIN_URL.replace(/\/[^/]*$/, `/${db}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
const OUTBOX = path.join(os.tmpdir(), `roster-e2e-outbox-${process.pid}.jsonl`);
const SID = 'AC' + 'b2'.repeat(16), AUTH = 'twilio-e2e-token-0123456789';
let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`); } };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

const admin = new pg.Client({ connectionString: ADMIN_URL });
const dbs = []; const procs = []; let browser, twilio; const twilioPosts = [];
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
async function open(srv, vp, { lang = 'en', authed = true, collect = false } = {}) {
  const ctx = await browser.newContext({ ...vp, serviceWorkers: 'block' });
  await ctx.addInitScript(([s, lang, authed, collect]) => {
    try {
      localStorage.setItem('roster-lang', lang);
      if (authed) { localStorage.setItem('roster-crm-session', JSON.stringify({ token: s.token, account: s.account })); localStorage.setItem(`roster-tour-done-${s.account.id}`, '1'); }
      if (collect) window.__COLLECT_I18N__ = true;
    } catch { /* */ }
  }, [{ token: srv.token, account: srv.account }, lang, authed, collect]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = async (page, srv, hash) => { await page.goto(`${srv.base}/#${hash}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(500); };
const outbox = () => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

try {
  await admin.connect();
  const MAIN = mk('main'), BASIC = mk('basic');
  for (const db of [MAIN, BASIC]) { await admin.query(`CREATE DATABASE ${db}`); dbs.push(db); }
  for (const db of [MAIN, BASIC]) { const s = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: urlOf(db) }, encoding: 'utf8' }); if (s.status !== 0) throw new Error('seed failed ' + s.stderr); }
  twilio = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
      const ok = req.headers.authorization === `Basic ${Buffer.from(`${SID}:${AUTH}`).toString('base64')}`;
      res.setHeader('Content-Type', 'application/json');
      if (!ok) { res.statusCode = 401; return res.end('{"message":"Authenticate"}'); }
      if (req.method === 'POST') { twilioPosts.push(Object.fromEntries(new URLSearchParams(b))); return res.end(JSON.stringify({ sid: 'SM' + crypto.randomBytes(8).toString('hex'), status: 'queued' })); }
      res.end(JSON.stringify({ sid: SID }));
    });
  });
  await new Promise((r) => twilio.listen(0, '127.0.0.1', r));
  const main = await boot(MAIN, { LICENSED_PLAN: 'essencial', MAIL_OUTBOX_FILE: OUTBOX, TWILIO_API_BASE: `http://127.0.0.1:${twilio.address().port}` });
  const basic = await boot(BASIC, { LICENSED_PLAN: 'basico' });
  main.pub = main.base; // PUBLIC_URL is not set: the e-mailed link uses the request host

  // data through the API
  const cl = await main.call('POST', '/api/clients', { company_name: 'Acme Logistics', contact_name: 'Dana Client', contact_email: 'dana@acme.test' });
  const job = await main.call('POST', '/api/jobs', { client_id: cl.id, title: 'Forklift Operator' });
  const cand = await main.call('POST', '/api/candidates', { name: 'Maria Silva', email: 'maria@example.com', phone: '(512) 555-0142', current_title: 'Forklift driver', current_employer: 'Secret Employer LLC', skills: 'forklift, OSHA', resume_summary: 'Five years in distribution centers.' });
  const today = new Date().toISOString().slice(0, 10);
  const sub = await main.call('POST', '/api/submissions', { candidate_id: cand.id, job_id: job.id, stage: 'Submitted to Client', owner_user_id: cand.owner_user_id, submitted_date: today });
  const pl = await main.call('POST', '/api/placements', { submission_id: sub.id, candidate_id: cand.id, client_id: cl.id, job_id: job.id, start_date: today, pay_rate: 20, bill_rate: 30, placement_fee: 0, status: 'Active' });
  const ts = await main.call('POST', '/api/timesheets', { placement_id: pl.id, period_start: '2026-09-01', period_end: '2026-09-14', hours: 80, status: 'Draft' });
  await main.call('PUT', '/api/company-profile', { name: 'Crestline Talent', email: 'billing@crestline.test', address: '1 Main St, Austin, TX', payment_url: 'https://pay.crestline.test/invoice', payment_note: 'Net 15. ACH details on request.' });

  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu'] });
  const desktop = { viewport: { width: 1280, height: 900 } };
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  let portalUrl = '';

  console.log('\n== staff: Clients -> client portal link');
  {
    const { ctx, page, errors } = await open(main, desktop);
    await go(page, main, '/clients');
    await page.waitForSelector('text=Acme Logistics');
    await page.click('button[aria-label="Client portal"]');
    await page.waitForSelector('[data-testid="portal-modal"]');
    check('portal: off by default, offers to turn it on', await page.isVisible('[data-testid="portal-enable"]'));
    await page.click('[data-testid="portal-enable"]');
    await page.waitForSelector('[data-testid="portal-link"]');
    portalUrl = await page.inputValue('[data-testid="portal-link"]');
    check('portal: a private link appears', /#\/portal\/[A-Za-z0-9_-]{30,}$/.test(portalUrl), portalUrl);
    check('portal: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== client (signed out): the portal');
  {
    const { ctx, page, errors } = await open(main, desktop, { authed: false });
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="portal-candidate"]');
    const body = await page.textContent('body');
    check('portal: agency name and client shown', body.includes('Crestline Talent') && body.includes('Acme Logistics'));
    check('portal: candidate shown without phone, e-mail or employer', body.includes('Maria Silva') && !body.includes('555-0142') && !body.includes('maria@example.com') && !body.includes('Secret Employer'));
    check('portal: the draft invoice is not shown', !(await page.isVisible('[data-testid="portal-timesheet"]')));
    await page.fill('input[aria-label="Add a note (optional)"]', 'Can she start Monday?');
    await page.click('[data-testid="portal-interested"]');
    await page.waitForSelector('text=You: interested');
    check('portal: "Interested" is saved and shown', true);
    await page.selectOption('select[aria-label="Language"]', 'pt');
    check('portal: switches to Portuguese', (await page.textContent('body')).includes('Candidatos para você'));
    await page.selectOption('select[aria-label="Idioma"]', 'en');
    check('portal: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== staff: timesheets, margin, invoice, send');
  {
    const { ctx, page, errors } = await open(main, desktop, { collect: true });
    await go(page, main, '/timesheets');
    await page.waitForSelector('[data-testid="timesheet-kpis"]');
    const kp = await page.textContent('[data-testid="timesheet-kpis"]');
    check('timesheets: billed $2,400 / paid to workers $1,600 / margin $800 / 33%', kp.includes('$2,400') && kp.includes('$1,600') && kp.includes('$800') && kp.includes('33%'), kp);
    await page.click('button[aria-label="View invoice"]');
    await page.waitForSelector('[data-testid="invoice-view"]');
    await page.waitForSelector('[data-testid="invoice-number"]');
    check('invoice: number, total and the agency payment link', (await page.textContent('[data-testid="invoice-number"]')).startsWith('INV-') && (await page.textContent('[data-testid="invoice-total"]')).includes('$2,400.00') && (await page.getAttribute('[data-testid="pay-online"]', 'href')) === 'https://pay.crestline.test/invoice');
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => ({ root: getComputedStyle(document.getElementById('root')).display, sheet: !!document.querySelector('.invoice-sheet')?.offsetHeight, actions: getComputedStyle(document.querySelector('.invoice-actions')).display }));
    check('invoice: printing shows only the sheet (app hidden, buttons hidden)', printed.root === 'none' && printed.sheet && printed.actions === 'none', printed);
    await page.emulateMedia({ media: 'screen' });
    await page.keyboard.press('Escape');
    check('invoice: Esc closes it', !(await page.isVisible('[data-testid="invoice-view"]')));
    await page.click('button[aria-label="Send invoice to client"]');
    await page.click('[data-testid="send-invoice-confirm"]');
    await page.waitForSelector('text=Sent', { timeout: 8000 });
    await page.waitForTimeout(400);
    const mail = outbox().at(-1);
    check('send: the client got an e-mail with the portal link', mail && mail.to[0].address === 'dana@acme.test' && mail.text.includes('/#/portal/'), mail && mail.text);
    check('send: status is now Sent in the list', (await page.textContent('body')).includes('Sent'));
    check('timesheets: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== client: approve the timesheet and open the invoice');
  {
    const { ctx, page, errors } = await open(main, desktop, { authed: false });
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="portal-timesheet"]');
    await page.click('[data-testid="portal-approve"]');
    await page.click('button:has-text("Confirm approval")');
    await page.waitForSelector('text=Please|Type your name to approve', { timeout: 3000 }).catch(() => {});
    check('portal: approving needs a name', await page.isVisible('text=Type your name to approve.'));
    await page.fill('input[aria-label="Your name"]', 'Dana Client');
    await page.click('button:has-text("Confirm approval")');
    await page.waitForSelector('[data-testid="portal-timesheet"] >> text=Approved');
    check('portal: approved badge shown', true);
    await page.click('[data-testid="portal-view-invoice"]');
    await page.waitForSelector('[data-testid="invoice-number"]');
    check('portal: the client opens the invoice with the pay link', (await page.getAttribute('[data-testid="pay-online"]', 'href')) === 'https://pay.crestline.test/invoice');
    await page.keyboard.press('Escape');
    check('portal: no script errors', errors.length === 0, errors);
    await ctx.close();
    const staff = await open(main, desktop);
    await go(staff.page, main, '/timesheets');
    await staff.page.waitForSelector('text=Client approved');
    check('staff: sees "Client approved" on the timesheet', true);
    await staff.ctx.close();
  }

  console.log('\n== staff: messages (e-mail, SMS) and the Twilio card');
  {
    const { ctx, page, errors } = await open(main, desktop, { collect: true });
    await go(page, main, '/candidates');
    await page.waitForSelector('text=Maria Silva');
    await page.click('button[aria-label="Messages"]');
    await page.waitForSelector('[data-testid="messages-modal"]');
    await page.selectOption('[data-testid="msg-template"]', { label: 'Interview invitation' });
    await page.click('[data-testid="msg-preview-btn"]');
    const pv = await page.textContent('[data-testid="msg-preview"]');
    check('messages: preview fills in the name, job and client', pv.includes('Hi Maria') && pv.includes('Acme Logistics'), pv);
    await page.click('[data-testid="msg-send"]');
    await page.waitForSelector('[data-testid="msg-sent"]');
    check('messages: e-mail sent and shown in the conversation', (await page.textContent('[data-testid="msg-history"]')).includes('would like to interview you') && outbox().at(-1).to[0].address === 'maria@example.com');
    await page.click('[data-testid="msg-tab-sms"]');
    check('messages: SMS says Twilio is not connected yet', await page.isVisible('[data-testid="msg-connect"]'));
    check('messages: send is disabled until it is connected', await page.isDisabled('[data-testid="msg-send"]'));
    await page.keyboard.press('Escape');
    await page.click('text=Close').catch(() => {});
    await go(page, main, '/settings');
    await page.waitForSelector('[data-testid="sms-card"]');
    await page.click('[data-testid="sms-connect-open"]');
    await page.fill('[data-testid="sms-sid"]', SID);
    await page.fill('[data-testid="sms-token"]', 'wrong-wrong-wrong-wrong');
    await page.fill('[data-testid="sms-from"]', '(512) 555-0100');
    await page.click('[data-testid="sms-connect-save"]');
    await page.waitForSelector('text=Twilio did not accept these credentials');
    check('settings: wrong Twilio credentials give a clear message', true);
    await page.fill('[data-testid="sms-token"]', AUTH);
    await page.click('[data-testid="sms-connect-save"]');
    await page.waitForSelector('[data-testid="sms-card"] >> text=+15125550100');
    check('settings: Twilio connected, the number is shown (never the token)', !(await page.textContent('[data-testid="sms-card"]')).includes(AUTH));
    await go(page, main, '/candidates');
    await page.click('button[aria-label="Messages"]');
    await page.click('[data-testid="msg-tab-sms"]');
    await page.fill('[data-testid="msg-body"]', 'Hi {{first_name}}, new shift Monday.');
    await page.click('[data-testid="msg-send"]');
    await page.waitForSelector('[data-testid="msg-sent"]');
    check('messages: the text reached Twilio with the opt-out line', twilioPosts.at(-1)?.Body === 'Hi Maria, new shift Monday. Reply STOP to opt out.' && twilioPosts.at(-1)?.To === '+15125550142', twilioPosts.at(-1));
    check('messages: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== Basic plan: closed with a clear message');
  {
    const c = await basic.call('POST', '/api/clients', { company_name: 'Basic Client' });
    const cd = await basic.call('POST', '/api/candidates', { name: 'Basic Person', email: 'b@example.com' });
    const { ctx, page } = await open(basic, desktop);
    await go(page, basic, '/clients');
    await page.waitForSelector('text=Basic Client');
    // the buttons stay on the screen with a lock and the plan name; tapping opens "Available on the Essential plan"
    await page.click('button[data-plan-locked="essencial"][aria-label^="Client portal"]');
    await page.waitForSelector('[data-testid="plan-upsell"]');
    check('basic: the client portal button opens "Available on the Essential plan"', (await page.textContent('[data-testid="plan-upsell"]')).includes('Available on the Essential plan') && (await page.textContent('[data-testid="plan-upsell"]')).includes('Client portal'));
    await page.click('[data-testid="plan-upsell-close"]');
    await go(page, basic, '/candidates');
    await page.waitForSelector('button[data-plan-locked="essencial"][aria-label^="Messages"]');
    await page.click('button[data-plan-locked="essencial"][aria-label^="Messages"]');
    await page.waitForSelector('[data-testid="plan-upsell"]');
    check('basic: messages are closed too, with the same window', (await page.textContent('[data-testid="plan-upsell"]')).includes('Essential plan') && (await page.locator('[data-testid="messages-modal"]').count()) === 0);
    await ctx.close();
  }

  console.log('\n== phone width and translations');
  {
    const { ctx, page, errors } = await open(main, phone, { authed: false });
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="portal-candidate"]');
    check('phone: portal has no sideways scroll', (await overflow(page)) <= 0, await overflow(page));
    await page.click('[data-testid="portal-view-invoice"]');
    await page.waitForSelector('[data-testid="invoice-number"]');
    check('phone: invoice has no sideways scroll', (await overflow(page)) <= 0, await overflow(page));
    check('phone: no script errors', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(main, desktop, { lang: 'pt', collect: true });
    await go(page, main, '/clients');
    await page.waitForSelector('text=Acme Logistics');
    await page.click('button[aria-label="Portal do cliente"]');
    await page.waitForSelector('[data-testid="portal-modal"]');
    await page.keyboard.press('Escape');
    await go(page, main, '/timesheets'); await page.waitForSelector('[data-testid="timesheet-kpis"]');
    await page.click('button[aria-label="Ver fatura"]'); await page.waitForSelector('[data-testid="invoice-number"]'); await page.keyboard.press('Escape');
    await page.click('button[aria-label="Enviar fatura ao cliente"]'); await page.waitForTimeout(300);
    await go(page, main, '/candidates'); await page.waitForSelector('text=Maria Silva');
    await page.click('button[aria-label="Mensagens"]'); await page.waitForSelector('[data-testid="messages-modal"]');
    await page.click('[data-testid="msg-preview-btn"]').catch(() => {});
    await go(page, main, '/settings'); await page.waitForSelector('[data-testid="sms-card"]');
    const missingPt = await page.evaluate(() => [...(window.__i18nMissing || [])]);
    check('Portuguese: nothing missing on the new screens', missingPt.length === 0, missingPt);
    await ctx.close();
    const es = await open(main, desktop, { lang: 'es', authed: false, collect: true });
    await es.page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
    await es.page.waitForSelector('[data-testid="portal-timesheet"]');
    await es.page.click('[data-testid="portal-view-invoice"]'); await es.page.waitForSelector('[data-testid="invoice-number"]');
    const missingEs = await es.page.evaluate(() => [...(window.__i18nMissing || [])]);
    check('Spanish: nothing missing on the portal', missingEs.length === 0, missingEs);
    check('Spanish: portal in Spanish', (await es.page.textContent('body')).includes('Pagar en línea'));
    await es.ctx.close();
  }
  {
    const { ctx, page } = await open(main, desktop, { authed: false });
    await page.goto(`${main.base}/#/portal/not-a-real-token-not-a-real-token`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="portal-gone"]');
    check('portal: a wrong link shows a friendly "not active" page', true);
    await ctx.close();
  }
} catch (e) {
  fail++; console.log('FAIL (exception)', e);
} finally {
  try { await browser?.close(); } catch { /* */ }
  for (const p of procs) p.kill('SIGTERM');
  twilio?.close();
  await new Promise((r) => setTimeout(r, 400));
  for (const db of dbs) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
  fs.rmSync(OUTBOX, { force: true });
  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
