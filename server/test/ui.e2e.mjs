// Roster in a real browser (Playwright + Chromium) against the real server and the built client:
// languages, free trial, getting-started guide, plan card with the Monthly/Yearly switch, locked areas on the Basic plan,
// automations, resume reading, and no sideways scrolling on a phone.
//   (from the repo root)  npm run build && TEST_PG_ADMIN_URL=postgres://test:test@localhost:5432/postgres node server/test/ui.e2e.mjs
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'src');
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const mk = (t) => `roster_ui_${t}_${process.pid}_${Date.now() % 100000}`;
const urlOf = (db) => ADMIN_URL.replace(/\/[^/]*$/, `/${db}`);
const OWNER = { email: 'owner@example.com', pass: 'Owner-pass-12345' };
let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`); } };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

const admin = new pg.Client({ connectionString: ADMIN_URL });
const dbs = []; const procs = []; let browser;
async function boot(db, env = {}) {
  const port = await freePort();
  const proc = spawn('node', [path.join(SRC, 'index.js')], { env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: urlOf(db), JWT_SECRET: 'ui-secret-ui-secret-123', BOOTSTRAP_OWNER_EMAIL: OWNER.email, BOOTSTRAP_OWNER_PASSWORD: OWNER.pass, BOOTSTRAP_OWNER_NAME: 'Olivia Owner', FRONTEND_URL: '', SMTP_HOST: '', AUTOMATION_EMAILS: '0', ...env }, stdio: 'ignore' });
  procs.push(proc);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  const token = (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: OWNER.email, password: OWNER.pass }) })).json()).token;
  const account = (await (await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json()).account;
  return { base, token, account };
}
async function open(srv, vp, { lang = 'en', authed = true, collect = false, tourDone = true } = {}) {
  const ctx = await browser.newContext({ ...vp, serviceWorkers: 'block' });
  await ctx.addInitScript(([s, lang, authed, collect, tourDone]) => {
    try {
      localStorage.setItem('roster-lang', lang);
      if (authed) { localStorage.setItem('roster-crm-session', JSON.stringify({ token: s.token, account: s.account })); if (tourDone) localStorage.setItem(`roster-tour-done-${s.account.id}`, '1'); }
      if (collect) window.__COLLECT_I18N__ = true;
    } catch { /* */ }
  }, [{ token: srv.token, account: srv.account }, lang, authed, collect, tourDone]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const go = async (page, srv, hash) => { await page.goto(`${srv.base}/#${hash}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(450); };

try {
  await admin.connect();
  const SAMPLE = mk('sample'), BASIC = mk('basic');
  for (const db of [SAMPLE, BASIC]) { await admin.query(`CREATE DATABASE ${db}`); dbs.push(db); }
  const seed = spawnSync('node', [path.join(SRC, 'seed.js')], { env: { ...process.env, DATABASE_URL: urlOf(SAMPLE), SEED_SAMPLE_DATA: '1' }, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error('seed failed ' + seed.stderr);
  const stripeEnv = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_BASICO: 'price_b', STRIPE_PRICE_ESSENCIAL: 'price_e', STRIPE_PRICE_COMPLETO: 'price_c', STRIPE_PRICE_ESSENCIAL_ANUAL: 'price_ea', STRIPE_PRICE_COMPLETO_ANUAL: 'price_ca', STRIPE_PRICE_BASICO_ANUAL: 'price_ba' };
  const main = await boot(SAMPLE, stripeEnv);
  const basic = await boot(BASIC, { LICENSED_PLAN: 'basico' });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu'] });
  const desktop = { viewport: { width: 1280, height: 900 } };
  const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

  console.log('\n== sign-in screen, language and the free trial');
  {
    const { ctx, page, errors } = await open(main, desktop, { authed: false, lang: 'en' });
    await go(page, main, '/');
    check('login shows the trial link', await page.isVisible('[data-testid="open-trial"]'));
    await page.selectOption('select[aria-label="Language"]', 'pt');
    check('login switches to Portuguese', (await page.textContent('body')).includes('Teste grátis por 3 dias'));
    await page.selectOption('select[aria-label="Idioma"]', 'es');
    check('login switches to Spanish', (await page.textContent('body')).includes('Prueba gratis por 3 días'));
    await page.selectOption('select[aria-label="Idioma"]', 'en');
    await page.click('[data-testid="open-trial"]');
    await page.fill('input[name="name"]', 'Pat Prospect');
    await page.fill('input[name="email"]', 'pat@prospect.test');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-testid="trial-banner"]', { timeout: 15000 });
    check('trial: inside the app with the 3-day banner', (await page.textContent('[data-testid="trial-banner"]')).includes('Free trial with sample data'));
    await page.waitForSelector('[data-testid="tour"]', { timeout: 8000 });
    check('trial: the getting-started guide opens by itself on first access', await page.isVisible('[data-testid="tour-box"]'));
    check('trial: guide starts at step 1 of 8', (await page.textContent('[data-testid="tour-count"]')).includes('1 of 8'), await page.textContent('[data-testid="tour-count"]'));
    // walk every step; each highlighted item must be on screen and the box inside the window
    let okSteps = 0;
    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="tour-next"]');
      await page.waitForTimeout(350);
      const box = await page.locator('[data-testid="tour-box"]').boundingBox();
      const spot = await page.locator('[data-testid="tour-spot"]').boundingBox().catch(() => null);
      if (box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 900 && spot) okSteps++;
    }
    check('trial: the 7 highlighted steps point at a menu item and stay inside the window', okSteps === 7, okSteps);
    check('trial: last step button says Done', (await page.textContent('[data-testid="tour-next"]')).trim() === 'Done');
    await page.click('[data-testid="tour-next"]');
    check('trial: finishing closes the guide', !(await page.isVisible('[data-testid="tour"]')));
    await page.reload(); await page.waitForTimeout(600);
    check('trial: the guide does not open again by itself', !(await page.isVisible('[data-testid="tour"]')));
    await page.click('[data-testid="open-tour"]');
    check('trial: the menu item reopens the guide at step 1', (await page.textContent('[data-testid="tour-count"]')).includes('1 of 8'));
    await page.keyboard.press('Escape');
    check('trial: Esc closes the guide', !(await page.isVisible('[data-testid="tour"]')));
    // the trial cannot use messages / billing
    const r = await page.evaluate(async () => { const t = JSON.parse(localStorage.getItem('roster-crm-session')).token; const x = await fetch('/api/photo-import/status', { headers: { Authorization: `Bearer ${t}` } }); return x.status; });
    check('trial: AI photo reading is blocked for the trial login', r === 403, r);
    check('trial: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== guide on a phone (menu drawer)');
  {
    const { ctx, page, errors } = await open(main, phone, { authed: true, tourDone: false });
    await go(page, main, '/');
    await page.waitForSelector('[data-testid="tour"]', { timeout: 8000 });
    let ok = 0;
    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="tour-next"]'); await page.waitForTimeout(500);
      const box = await page.locator('[data-testid="tour-box"]').boundingBox();
      if (box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844) ok++;
    }
    check('phone: the guide box stays inside a 390px screen on all 7 steps', ok === 7, ok);
    await page.click('[data-testid="tour-next"]');
    check('phone: no sideways scroll after the guide', (await overflow(page)) <= 1, await overflow(page));
    check('phone: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== every screen in Portuguese and Spanish has a translation for all its texts');
  for (const lang of ['pt', 'es']) {
    const { ctx, page, errors } = await open(main, desktop, { lang, collect: true });
    for (const route of ['/', '/candidates', '/jobs', '/pipeline', '/interviews', '/clients', '/placements', '/timesheets', '/whatsapp', '/automations', '/reports', '/settings']) {
      await go(page, main, route);
    }
    // open the forms too (their labels are only on screen when the form is open)
    for (const [route, btn] of [['/candidates', 'New Candidate'], ['/clients', 'New Client'], ['/jobs', 'New Job'], ['/automations', 'New Automation']]) {
      await go(page, main, route);
      const b = page.locator(`[data-testid="new-automation"], button:has-text("${lang === 'pt' ? { 'New Candidate': 'Novo candidato', 'New Client': 'Novo cliente', 'New Job': 'Nova vaga', 'New Automation': 'Nova automação' }[btn] : { 'New Candidate': 'Nuevo candidato', 'New Client': 'Nuevo cliente', 'New Job': 'Nueva vacante', 'New Automation': 'Nueva automatización' }[btn]}")`).first();
      if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(300); }
    }
    const missing = await page.evaluate(() => [...(window.__i18nMissing || [])]);
    const real = missing.filter((k) => !/^photo\./.test(k));
    check(`${lang}: no text is missing a translation`, real.length === 0, real);
    check(`${lang}: no script errors`, errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== dashboard dates follow the calendar (no fixed September text)');
  {
    const { ctx, page } = await open(main, desktop, { lang: 'en' });
    await go(page, main, '/');
    const body = await page.textContent('body');
    check('dashboard: no hard-coded "Sep 14 – Sep 20" or "Since Aug 1"', !body.includes('Sep 14 – Sep 20') && !body.includes('Since Aug 1'));
    check('dashboard: shows the 30-day wording', body.includes('Last 30 days'));
    check('sidebar and title use Roster, not the made-up agency', !body.includes('Crestline'));
    await ctx.close();
  }

  console.log('\n== plan card: Monthly / Yearly (−10%) and checkout');
  for (const [label, vp] of [['1280', desktop], ['390', phone]]) {
    const { ctx, page, errors } = await open(main, vp, { lang: 'en' });
    await go(page, main, '/settings?plan=1');
    await page.waitForSelector('[data-testid="plan-price-basico"]', { timeout: 15000 });
    check(`${label}: the Monthly/Yearly switch is there`, await page.isVisible('[data-testid="billing-interval-year"]'));
    const txt = async (id) => (await page.textContent(`[data-testid="${id}"]`)).replace(/\s+/g, ' ').trim();
    check(`${label}: monthly prices are $79 / $149 / $269`, (await txt('plan-price-basico')).startsWith('$79') && (await txt('plan-price-essencial')).startsWith('$149') && (await txt('plan-price-completo')).startsWith('$269'));
    check(`${label}: no yearly note while on Monthly`, !(await page.isVisible('[data-testid="yearly-note"]')));
    await page.click('[data-testid="billing-interval-year"]');
    check(`${label}: yearly totals are $853.20 / $1,609.20 / $2,905.20`, (await txt('plan-price-basico')).startsWith('$853.20') && (await txt('plan-price-essencial')).startsWith('$1,609.20') && (await txt('plan-price-completo')).startsWith('$2,905.20'), await txt('plan-price-essencial'));
    check(`${label}: shows the per-month equivalent ($134.10 for Essential)`, (await page.textContent('body')).includes('$134.10'));
    check(`${label}: the yearly note (no refund / cancel renewal) is visible`, await page.isVisible('[data-testid="yearly-note"]'));
    check(`${label}: usage meters show logins, candidates, open jobs, automations`, (await page.locator('[data-testid^="usage-"]').count()) === 4);
    if (label === '390') check('390: no sideways scroll on Settings', (await overflow(page)) <= 1, await overflow(page));
    await page.route('**/api/billing/checkout', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: `${main.base}/api/health` }) }));
    const reqP = page.waitForRequest((r) => r.url().endsWith('/api/billing/checkout') && r.method() === 'POST');
    await page.click('[data-testid="subscribe-essencial"]');
    const sent = JSON.parse((await reqP).postData() || '{}');
    check(`${label}: Subscribe on yearly asks for plan=essencial, interval=year`, sent.plan === 'essencial' && sent.interval === 'year', sent);
    check(`${label}: no script errors`, errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== Basic plan: locked areas, limits and the upgrade notice');
  {
    const { ctx, page, errors } = await open(basic, desktop, { lang: 'en' });
    await go(page, basic, '/');
    await page.waitForSelector('[data-nav="timesheets"][data-plan-locked="essencial"]', { timeout: 10000 });
    check('basic: Timesheets and WhatsApp carry the Essential plan seal in the menu', (await page.locator('[data-nav="timesheets"] [data-plan-badge="essencial"]').count()) === 1 && (await page.locator('[data-nav="whatsapp"] [data-plan-badge="essencial"]').count()) === 1);
    await page.click('[data-nav="whatsapp"]');
    await page.waitForSelector('[data-testid="plan-upsell"]');
    check('basic: tapping a sealed menu item opens "Available on the Essential plan" with the price', (await page.textContent('[data-testid="plan-upsell"]')).includes('Available on the Essential plan') && (await page.textContent('[data-testid="plan-upsell-price"]')).includes('$149'));
    await page.click('[data-testid="plan-upsell-close"]');
    await go(page, basic, '/timesheets');
    check('basic: the Timesheets page explains the upgrade', await page.isVisible('[data-testid="upgrade-notice"]'));
    check('basic: the notice names the Essential plan', (await page.textContent('[data-testid="upgrade-notice"]')).includes('Essential'));
    await go(page, basic, '/settings');
    await page.waitForSelector('[data-testid="plan-card"]');
    check('basic: plan card says it is managed by Impact Digital and has no Subscribe buttons', (await page.textContent('[data-testid="plan-card"]')).includes('managed by Impact Digital') && (await page.locator('[data-testid^="subscribe-"]').count()) === 0);
    check('basic: Logins meter shows the limit of 3', (await page.textContent('[data-testid="usage-Logins"]')).includes('/ 3'), await page.textContent('[data-testid="usage-Logins"]'));
    // the 3rd active automation is refused with a clear sentence
    await go(page, basic, '/automations');
    for (const n of [1, 2, 3]) {
      await page.click('[data-testid="new-automation"]');
      await page.fill('input[placeholder="Flag overdue timesheets"]', `Rule ${n}`);
      await page.selectOption('[data-testid="automation-trigger"]', ['submission_submitted', 'job_open_30d', 'interview_completed'][n - 1]);
      await page.click('button:has-text("Save Automation")');
      await page.waitForTimeout(500);
    }
    check('basic: the 3rd active automation is refused with the plan limit message', (await page.textContent('body')).includes('Your plan allows 2 active automations'));
    check('basic: no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== automations, resume reading and the notification bell (sample data, all plans open)');
  {
    const { ctx, page, errors } = await open(main, desktop, { lang: 'en' });
    await go(page, main, '/automations');
    check('automations: the sample rules are listed as runnable (toggle available)', (await page.locator('[data-testid="automation-toggle"]').count()) >= 4);
    await page.click('[data-testid="run-checks"]');
    await page.waitForSelector('[data-testid="run-msg"]');
    check('automations: "Run daily checks now" reports how many alerts were created', /Daily checks done: \d+ new alerts/.test(await page.textContent('[data-testid="run-msg"]')));
    // bell shows the alerts the rules wrote
    await go(page, main, '/');
    await page.click('button[title="Notifications"]');
    await page.waitForSelector('[data-testid="alerts-panel"]');
    check('bell: lists automation alerts (not a fixed "all caught up")', (await page.locator('[data-testid="alerts-panel"] li').count()) > 0);
    // resume reading
    await go(page, main, '/candidates');
    await page.locator('button:has-text("New Candidate")').first().click();
    await page.click('[data-testid="resume-toggle"]');
    await page.fill('[data-testid="resume-text"]', 'Carlos Eduardo Mendes\nSenior Warehouse Supervisor\ncarlos.mendes@example.com | (512) 555-0187\n\nExperience\nWarehouse Supervisor at Northline Logistics (2019 - present)\n\nSkills: Forklift certified, Inventory control, OSHA 30');
    await page.click('[data-testid="resume-read"]');
    await page.waitForSelector('[data-testid="resume-msg"]');
    check('resume: the form is filled from the pasted text', (await page.inputValue('input[value="Carlos Eduardo Mendes"]').catch(() => null)) !== null && (await page.locator('input[value="carlos.mendes@example.com"]').count()) === 1);
    check('resume: employer and skills were read', (await page.locator('input[value="Northline Logistics"]').count()) === 1 && (await page.locator('input[value*="OSHA 30"]').count()) === 1);
    check('no script errors', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n== phone: no sideways scroll on the main screens');
  {
    const { ctx, page } = await open(main, phone, { lang: 'pt' });
    for (const route of ['/', '/candidates', '/automations', '/settings']) {
      await go(page, main, route);
      check(`phone pt ${route}: no sideways scroll`, (await overflow(page)) <= 1, await overflow(page));
    }
    await ctx.close();
  }
} catch (e) {
  fail++; console.log('ERROR', e.stack || e.message);
} finally {
  try { await browser?.close(); } catch { /* */ }
  for (const p of procs) try { p.kill('SIGTERM'); } catch { /* */ }
  await new Promise((r) => setTimeout(r, 400));
  for (const db of dbs) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${pass} ok, ${fail} failure(s)`);
process.exit(fail ? 1 : 0);
