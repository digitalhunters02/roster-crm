// Browser check of the sign-in screen and a logged-in page at phone and desktop
// widths. Needs: client built (npm run build), local Postgres, Playwright.
//   node e2e/auth.e2e.mjs        (screenshots go to $E2E_SHOTS or ./e2e/shots)
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, '..', 'server', 'src');
const SHOTS = process.env.E2E_SHOTS || path.join(here, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const PRODUCT = 'roster';
const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASS = 'E2e-owner-pass-1';
const NEW_PASS = 'E2e-new-pass-22';
const DASH_TEXT = /Crestline|Dashboard/;
const LOGGED_IN_PAGES = ['/', '/settings'];
const ADMIN_URL = process.env.TEST_PG_ADMIN_URL || 'postgres://test:test@localhost:5432/postgres';
const DB = `${PRODUCT}_e2e_${process.pid}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
await admin.query(`CREATE DATABASE ${DB}`);
const seed = spawnSync('node', [path.join(SERVER, 'seed.js')], { env: { ...process.env, DATABASE_URL: DB_URL }, encoding: 'utf8' });
if (seed.status !== 0) { console.error(seed.stderr); process.exit(1); }
const port = await freePort();
const srv = spawn('node', [path.join(SERVER, 'index.js')], {
  env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: DB_URL, JWT_SECRET: 'e2e-secret-e2e-secret-1234',
    BOOTSTRAP_OWNER_EMAIL: OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD: OWNER_PASS, SMTP_HOST: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
srv.stdout.on('data', (d) => { serverLog += d; });
srv.stderr.on('data', (d) => { serverLog += d; });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 150)); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

const noHScroll = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));

async function run(label, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/#/');
  await page.waitForSelector('input[type=email]');
  const tag = `[${label}]`;

  // --- login screen ---
  check(`${tag} login: eye button present`, await page.locator('[data-testid=toggle-password]').count() === 1);
  const pw = page.locator('input[name=password]');
  check(`${tag} login: password hidden by default`, (await pw.getAttribute('type')) === 'password');
  await page.click('[data-testid=toggle-password]');
  check(`${tag} login: eye shows the password`, (await pw.getAttribute('type')) === 'text');
  await page.click('[data-testid=toggle-password]');
  check(`${tag} login: eye hides it again`, (await pw.getAttribute('type')) === 'password');
  check(`${tag} login: remember me checked by default`, await page.locator('input[type=checkbox]').isChecked());
  let m = await noHScroll(page);
  check(`${tag} login: no horizontal scroll`, m.sw <= m.iw && m.bw <= m.iw, `scrollWidth=${m.sw} inner=${m.iw}`);
  if (ctxOpts.isMobile) {
    const fs16 = await page.evaluate(() => [...document.querySelectorAll('input[type=email],input[name=password]')].map((i) => getComputedStyle(i).fontSize));
    check(`${tag} login: inputs are 16px on touch`, fs16.every((f) => f === '16px'), fs16.join(','));
  }
  await page.screenshot({ path: path.join(SHOTS, `${PRODUCT}-login-${label}.png`) });

  // language switch
  await page.selectOption('select[aria-label]', 'pt');
  check(`${tag} login: Portuguese available`, await page.locator('button[type=submit]', { hasText: 'Entrar' }).count() === 1);
  await page.selectOption('select[aria-label]', 'en');

  // forgot password (no SMTP on this server -> notice)
  await page.click('text=Forgot password?');
  await page.fill('input[type=email]', 'nobody@example.com');
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=forgot-sent]');
  check(`${tag} forgot: neutral message + "email not set up" notice`, await page.locator('[data-testid=forgot-no-mailer]').count() === 1);
  await page.click('text=Back to sign in');

  // wrong password -> friendly error
  await page.fill('input[type=email]', OWNER_EMAIL);
  await page.fill('input[name=password]', 'definitely-wrong-1');
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=alert]');
  check(`${tag} login: friendly error on wrong password`, /Wrong email or password/.test(await page.locator('[role=alert]').innerText()));

  // legal pages
  await page.click('text=Terms of Service');
  await page.waitForSelector('h1');
  check(`${tag} terms page reachable while signed out`, /Terms of Service/.test(await page.locator('h1').innerText()));
  m = await noHScroll(page);
  check(`${tag} terms: no horizontal scroll`, m.sw <= m.iw, `scrollWidth=${m.sw}`);
  await page.goto(base + '/#/');
  await page.waitForSelector('input[type=email]');

  // --- successful login ---
  await page.fill('input[type=email]', OWNER_EMAIL);
  await page.fill('input[name=password]', OWNER_PASS);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=signout]', { state: 'attached' });
  check(`${tag} logged in: demo data visible`, DASH_TEXT.test(await page.locator('body').innerText()));
  for (const route of LOGGED_IN_PAGES) {
    await page.goto(base + '/#' + route);
    await page.waitForTimeout(700);
    m = await noHScroll(page);
    check(`${tag} logged in ${route}: no horizontal scroll`, m.sw <= m.iw && m.bw <= m.iw, `scrollWidth=${m.sw} inner=${m.iw}`);
    await page.screenshot({ path: path.join(SHOTS, `${PRODUCT}-app${route === '/' ? '-home' : route.replace('/', '-')}-${label}.png`) });
  }

  // session survives a reload (remember me)
  await page.reload();
  await page.waitForSelector('[data-testid=signout]', { state: 'attached' });
  check(`${tag} session survives reload`, true);

  // change password from Settings
  await page.goto(base + '/#/settings');
  await page.waitForSelector('input[name=current-password]');
  await page.fill('input[name=current-password]', OWNER_PASS);
  await page.fill('input[name=new-password]', NEW_PASS);
  await page.fill('input[name=confirm-password]', NEW_PASS);
  await page.click('form:has(input[name=current-password]) button[type=submit]');
  await page.waitForSelector('[role=status]');
  check(`${tag} settings: password changed`, true);

  // sign out
  await page.evaluate(() => document.querySelector('[data-testid=signout-settings]').click());
  await page.waitForSelector('input[type=email]');
  check(`${tag} sign out returns to login`, true);
  await page.fill('input[type=email]', OWNER_EMAIL);
  await page.fill('input[name=password]', NEW_PASS);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=signout]', { state: 'attached' });
  check(`${tag} login works with the new password`, true);

  // set it back so the next viewport run starts from the same state
  await page.goto(base + '/#/settings');
  await page.waitForSelector('input[name=current-password]');
  await page.fill('input[name=current-password]', NEW_PASS);
  await page.fill('input[name=new-password]', OWNER_PASS);
  await page.fill('input[name=confirm-password]', OWNER_PASS);
  await page.click('form:has(input[name=current-password]) button[type=submit]');
  await page.waitForSelector('[role=status]');

  // reset-password page via the logged link (signed out)
  await page.evaluate(() => document.querySelector('[data-testid=signout-settings]').click());
  await page.waitForSelector('input[type=email]');
  await page.click('text=Forgot password?');
  await page.fill('input[type=email]', OWNER_EMAIL);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=forgot-sent]');
  await page.waitForTimeout(300);
  const links = [...serverLog.matchAll(/#\/reset-password\?token=([a-f0-9]{64})/g)];
  check(`${tag} reset link logged server-side`, links.length > 0);
  await page.goto(base + '/#/reset-password?token=' + links[links.length - 1][1]);
  await page.waitForSelector('input[name=new-password]');
  m = await noHScroll(page);
  check(`${tag} reset page: no horizontal scroll`, m.sw <= m.iw, `scrollWidth=${m.sw}`);
  await page.screenshot({ path: path.join(SHOTS, `${PRODUCT}-reset-${label}.png`) });
  await page.fill('input[name=new-password]', OWNER_PASS);
  await page.fill('input[name=confirm-password]', OWNER_PASS);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=reset-done]');
  check(`${tag} reset page: new password saved`, true);

  check(`${tag} no uncaught page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

try {
  await run('390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await run('1440', { viewport: { width: 1440, height: 900 } });
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await browser.close();
  srv.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.end();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
