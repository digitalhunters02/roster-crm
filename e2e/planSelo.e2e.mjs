// "Selo de plano" e "Ver como plano" NO NAVEGADOR (Playwright + Chromium): servidor REAL do Roster (Postgres local) + front buildado.
//   SELO_DIST=<pasta do build com VITE_API_URL=http://127.0.0.1:7882>  [SELO_SHOTS=<pasta das fotos>]  node e2e/planSelo.e2e.mjs   (da raiz do projeto)
// Portas: servidor 7882, front 5282. Bancos: selor_ui_* (criados e apagados aqui). Um servidor por cenário, como na vida real
// (o plano de uma instalação vem de LICENSED_PLAN): essential, professional, complete e o Roster da própria Impact (o dono olhando como cada plano).
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SRC = path.join(ROOT, 'server', 'src');
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const rootRequire = createRequire(path.join(ROOT, 'server', 'package.json'));
const pg = rootRequire('pg');
const bcrypt = rootRequire('bcryptjs');
const DIST = process.env.SELO_DIST;
assert.ok(DIST && fs.existsSync(path.join(DIST, 'index.html')), 'SELO_DIST precisa apontar para o build do front');
const SHOTS = process.env.SELO_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'roster-selo-'));
fs.mkdirSync(SHOTS, { recursive: true });
const API = 7882, WEB = 5282;
const ADMIN_URL = 'postgres://harbor:harbortest@127.0.0.1:5432/postgres';
const PASS = 'Roster-teste-2026';
const CLIENT = 'cliente@example.test', OWNER = 'dono@example.test', STAFF = 'equipe@example.test';

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`); }
};

// ---- oráculo escrito à mão (independente do código) ----
const NAME = { en: { basico: 'Essential', essencial: 'Professional', completo: 'Complete' }, pt: { basico: 'Essencial', essencial: 'Profissional', completo: 'Completo' }, es: { basico: 'Esencial', essencial: 'Profesional', completo: 'Completo' } };
const MODAL_TITLE = { en: (p) => `Available on the ${p} plan`, pt: (p) => `Disponível no plano ${p}`, es: (p) => `Disponible en el plan ${p}` };
const PRICE = { basico: 49, essencial: 119, completo: 249 };
const YEAR = { basico: 529, essencial: 1285, completo: 2689 };
const ORDER = ['basico', 'essencial', 'completo'];
const rank = (p) => ORDER.indexOf(p);
const LIMIT = { basico: 3, essencial: 10, completo: null };
const NAV_MIN = { placements: 'essencial', timesheets: 'essencial', reports: 'essencial', automations: 'completo', whatsapp: 'completo' };
const lockedAt = (min, seen) => rank(min) > rank(seen);
const addBadge = (plan, used) => (LIMIT[plan] !== null && used >= LIMIT[plan] ? ORDER.slice(rank(plan) + 1).find((p) => LIMIT[p] === null || LIMIT[p] > used) || null : null);

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
const dbs = [];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const web = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(WEB, '127.0.0.1');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu'] });
const consoleProblems = [];

async function startScenario({ plan, accounts }) {
  const dbName = 'selor_ui_' + crypto.randomBytes(3).toString('hex');
  await admin.query(`CREATE DATABASE ${dbName}`);
  dbs.push(dbName);
  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${dbName}`);
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(API), DATABASE_URL: url, JWT_SECRET: 'e2e-secret-e2e-secret-1234', FRONTEND_URL: `http://127.0.0.1:${WEB}`, SMTP_HOST: '',
    BOOTSTRAP_OWNER_EMAIL: CLIENT, BOOTSTRAP_OWNER_PASSWORD: PASS, OWNER_EMAILS: OWNER,
    STRIPE_PRICE_BASICO_ANUAL: 'price_x', STRIPE_PRICE_ESSENCIAL_ANUAL: 'price_y', STRIPE_PRICE_COMPLETO_ANUAL: 'price_z', // só ligam o preço anual na tela (nenhum Stripe é chamado)
  };
  for (const k of ['LICENSED_PLAN', 'STRIPE_SECRET_KEY', 'STRIPE_API_BASE', 'ANTHROPIC_API_KEY']) delete env[k];
  if (plan) env.LICENSED_PLAN = plan;
  const seed = spawnSync('node', [path.join(SRC, 'seed.js')], { env, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const hash = bcrypt.hashSync(PASS, 10);
  const child = spawn('node', [path.join(SRC, 'index.js')], { env, stdio: 'ignore' });
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${API}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  // contas: dono da empresa (bootstrap) + dono da plataforma (também role owner) + equipe
  await db.query(`INSERT INTO accounts (name, email, password_hash, role, must_change_password) VALUES ('Dono Plataforma', $1, $2, 'owner', FALSE), ('Pessoa da Equipe', $3, $2, 'staff', FALSE) ON CONFLICT DO NOTHING`, [OWNER, hash, STAFF]);
  await db.query(`UPDATE accounts SET must_change_password = FALSE`);
  const have = Number((await db.query('SELECT COUNT(*) n FROM accounts')).rows[0].n);
  for (let i = have; i < accounts; i++) await db.query(`INSERT INTO accounts (name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, 'staff', FALSE)`, [`Pessoa ${i}`, `p${i}@example.test`, hash]);
  await db.end();
  return { stop: () => new Promise((r) => { if (child.exitCode !== null) return r(); child.once('exit', r); child.kill(); }) };
}

async function openApp(email, lang, viewport, route = '/') {
  const ctx = await browser.newContext({ viewport });
  await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.addInitScript((l) => { try { localStorage.setItem('roster-lang', l); } catch { /* */ } }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e}`));
  // (sem internet neste teste, a folha de fontes do Google não carrega: isso não é do app e fica de fora)
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '')) consoleProblems.push(`console: ${m.text()} ${m.location().url || ''}`); });
  await page.goto(`http://127.0.0.1:${WEB}/#/`);
  await page.waitForSelector('input[type=email]');
  await page.fill('input[type=email]', email);
  await page.fill('input[name=password]', PASS);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-testid=signout]', { state: 'attached', timeout: 20000 });
  await go(page, route);
  return { ctx, page };
}
const go = async (page, route) => { await page.evaluate((r) => { window.location.hash = `#${r}`; }, route); await page.waitForTimeout(350); };
const badgesIn = (loc) => loc.locator('[data-plan-badge]').evaluateAll((els) => els.map((e) => e.getAttribute('data-plan-badge')));
const noSideScroll = async (page) => { const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth]); return sw[0] <= sw[2] + 1 && sw[1] <= sw[2] + 1; };
const openMenuIfMobile = async (page, mobile) => { if (mobile) { await page.click('button[aria-label="Open menu"]'); await page.waitForTimeout(400); } };
const closeMenuIfMobile = async (page, mobile) => { if (mobile) { await page.mouse.click(385, 500); await page.waitForTimeout(350); } };
async function choosePreview(page, mobile, planKey) {
  await openMenuIfMobile(page, mobile);
  const toggle = page.locator('[data-testid="plan-preview-toggle"]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await Promise.all([page.waitForLoadState('load'), page.locator(`[data-plan-choice="${planKey || 'mine'}"]`).click()]);
  await page.waitForSelector('[data-testid=signout]', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(700);
}

async function checkModal(page, { trigger, plan, lang, tag, canUpgrade = true }) {
  await trigger.click();
  const dlg = page.locator('[data-testid="plan-upsell"]');
  await dlg.waitFor({ timeout: 5000 });
  check(`${tag}: janelinha "${MODAL_TITLE[lang](NAME[lang][plan])}"`, (await dlg.locator('h2').innerText()).trim() === MODAL_TITLE[lang](NAME[lang][plan]), await dlg.locator('h2').innerText());
  const priceTxt = await page.locator('[data-testid="plan-upsell-price"]').innerText();
  check(`${tag}: janelinha mostra o preço mensal ${PRICE[plan]} e o anual ${YEAR[plan]}`, new RegExp(String(PRICE[plan])).test(priceTxt) && new RegExp(`${String(YEAR[plan]).replace(/(\d)(\d{3})$/, '$1[.,]?$2')}`).test(priceTxt), priceTxt);
  check(`${tag}: janelinha tem o selo ${NAME[lang][plan]}`, (await badgesIn(dlg)).includes(plan));
  check(`${tag}: ${canUpgrade ? "tem 'Ver planos' e 'Agora não'" : "só tem 'Fechar' (quem não é dono da conta não vê planos)"}`, (await page.locator('[data-testid="plan-upsell-plans"]').count()) === (canUpgrade ? 1 : 0) && (await page.locator('[data-testid="plan-upsell-close"]').count()) === 1);
  for (const b of await dlg.locator('button').all()) { const bb = await b.boundingBox(); check(`${tag}: botão da janelinha ≥ 40 px`, bb && bb.height >= 39.5 && bb.width >= 39.5, bb); }
  check(`${tag}: janelinha cabe na tela`, await page.evaluate(() => { const r = document.querySelector('[data-testid="plan-upsell"]').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && r.top >= 0 && r.bottom <= window.innerHeight + 1; }));
  if (canUpgrade) {
    await page.locator('[data-testid="plan-upsell-plans"]').click();
    await page.waitForSelector('#billing', { timeout: 10000 });
    await page.waitForTimeout(1000);
    check(`${tag}: "Ver planos" leva à tela de planos`, page.url().includes('#/settings'), page.url());
    const box = await page.locator('#billing').boundingBox();
    check(`${tag}: o cartão de planos ficou visível na tela`, box && box.y < (await page.evaluate(() => window.innerHeight)) && box.y + box.height > 0, box);
  } else {
    await page.locator('[data-testid="plan-upsell-close"]').click();
    check(`${tag}: janelinha fecha`, (await dlg.count()) === 0);
  }
}

// Confere TODA a tela para o plano visto `seen` com `used` logins: menu, botões, abas, cartões e cartão de planos.
async function checkScreens(page, { seen, used, lang, mobile, tag }) {
  const L = NAME[lang];
  // ---- menu ----
  await go(page, '/');
  await openMenuIfMobile(page, mobile);
  for (const [nav, min] of Object.entries(NAV_MIN)) {
    const item = page.locator(`[data-nav="${nav}"]`);
    const got = await badgesIn(item);
    const want = lockedAt(min, seen) ? [min] : [];
    check(`${tag}: menu ${nav} ${want.length ? 'tem selo ' + L[min] : 'sem selo'}`, JSON.stringify(got) === JSON.stringify(want), got);
    if (want.length) check(`${tag}: menu ${nav} selo escreve "${L[min]}"`, (await item.locator('[data-plan-badge]').innerText()).trim() === L[min]);
    const bb = await item.boundingBox();
    check(`${tag}: menu ${nav} tem ≥ 40 px de altura`, bb && bb.height >= 39.5, bb);
    const clipped = await item.evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
    check(`${tag}: menu ${nav} não estoura a largura`, clipped);
  }
  check(`${tag}: itens sem plano (Candidates, Jobs, Pipeline, Clients, Settings) nunca têm selo`, (await page.locator('aside nav [data-nav="candidates"] [data-plan-badge], aside nav [data-nav="jobs"] [data-plan-badge], aside nav [data-nav="pipeline"] [data-plan-badge], aside nav [data-nav="clients"] [data-plan-badge], aside nav [data-nav="settings"] [data-plan-badge]').count()) === 0);
  await closeMenuIfMobile(page, mobile);
  // ---- páginas de menu travadas por endereço: aviso com selo ----
  for (const [nav, min] of [['placements', 'essencial'], ['reports', 'essencial'], ['automations', 'completo']]) {
    await go(page, `/${nav}`);
    await page.waitForTimeout(250);
    const notice = page.locator(`[data-plan-notice="${nav}"]`);
    check(`${tag}: /${nav} ${lockedAt(min, seen) ? 'mostra o aviso com selo ' + L[min] : 'abre a página de verdade'}`, lockedAt(min, seen) ? (await notice.count()) === 1 && (await badgesIn(notice)).includes(min) : (await notice.count()) === 0);
  }
  // ---- Candidatos: IA do currículo ----
  await go(page, '/candidates');
  await page.getByRole('button', { name: /New Candidate/ }).click();
  const ai = page.locator('[data-testid="resume-ai-open"]');
  await ai.waitFor();
  const wantAi = lockedAt('essencial', seen);
  check(`${tag}: botão de IA do currículo ${wantAi ? 'tem selo ' + L.essencial : 'sem selo'}`, JSON.stringify(await badgesIn(ai)) === JSON.stringify(wantAi ? ['essencial'] : []), await badgesIn(ai));
  if (mobile) { const bb = await ai.boundingBox(); check(`${tag}: botão de IA ≥ 40 px`, bb && bb.height >= 39.5, bb); }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cancel' }).first().click().catch(() => {});
  // ---- Timesheets: margem e link de aprovação ----
  await go(page, '/timesheets');
  await page.waitForTimeout(400);
  if (seen === 'basico') {
    check(`${tag}: Timesheets travado mostra aviso com selo ${L.essencial}`, (await page.locator('[data-plan-notice="timesheets"]').count()) === 1);
  } else {
    const wantTop = lockedAt('completo', seen);
    check(`${tag}: cartão de margem ${wantTop ? 'travado com selo ' + L.completo : 'liberado'}`, wantTop ? (await badgesIn(page.locator('[data-testid="margin-locked"]'))).includes('completo') : (await page.locator('[data-testid="margin-locked"]').count()) === 0 && (await page.locator('[data-testid="margin-card"]').count()) === 1);
    const appr = page.locator('[data-testid="approval-locked"]');
    check(`${tag}: botão "Approval link" ${wantTop ? 'com selo ' + L.completo : 'sem selo'}`, wantTop ? (await appr.count()) > 0 && JSON.stringify(await badgesIn(appr.first())) === '["completo"]' : (await appr.count()) === 0);
  }
  // ---- Configurações: página de vagas, WhatsApp, vagas de login e cartões de plano ----
  await go(page, '/settings');
  await page.waitForSelector('#billing', { timeout: 20000 });
  await page.waitForSelector('[data-plan-card]');
  const careers = page.locator('[data-plan-notice="careers"]');
  check(`${tag}: página de vagas (Configurações) ${lockedAt('essencial', seen) ? 'com selo ' + L.essencial : 'liberada'}`, lockedAt('essencial', seen) ? (await careers.count()) === 1 && (await badgesIn(careers)).includes('essencial') : (await careers.count()) === 0);
  const wa = page.locator('[data-testid="whatsapp-connect"]');
  check(`${tag}: botão Connect do WhatsApp ${lockedAt('completo', seen) ? 'com selo ' + L.completo : 'sem selo'}`, JSON.stringify(await badgesIn(wa)) === JSON.stringify(lockedAt('completo', seen) ? ['completo'] : []), await badgesIn(wa));
  const wantAdd = addBadge(seen, used);
  const addBtn = page.locator('[data-testid="add-staff"]');
  if (await addBtn.count()) {
    check(`${tag}: "Add staff" (${used} logins) ${wantAdd ? 'tem selo ' + L[wantAdd] : 'sem selo'}`, JSON.stringify(await badgesIn(addBtn)) === JSON.stringify(wantAdd ? [wantAdd] : []), await badgesIn(addBtn));
    if (mobile) { const bb = await addBtn.boundingBox(); check(`${tag}: botão Add staff ≥ 40 px`, bb && bb.height >= 39.5, bb); }
  }
  for (const p of ORDER) {
    const card = page.locator(`[data-plan-card="${p}"]`);
    check(`${tag}: cartão ${p} tem selo "${L[p]}"`, (await badgesIn(card)).includes(p));
    check(`${tag}: cartão ${p} mostra o preço ${PRICE[p]}`, new RegExp(String(PRICE[p])).test(await page.locator(`[data-testid="plan-price-${p}"]`).innerText()));
    const n = await page.locator(`[data-plan-adds="${p}"] [data-add]`).count();
    check(`${tag}: cartão ${p} ${p === 'basico' ? 'não acrescenta nada' : 'lista 6 recursos acrescentados'}`, n === (p === 'basico' ? 0 : 6), n);
    for (let i = 0; i < n; i++) if (JSON.stringify(await badgesIn(page.locator(`[data-plan-adds="${p}"] [data-add]`).nth(i))) !== JSON.stringify([p])) { check(`${tag}: recurso ${i + 1} de ${p} leva o selo ${L[p]}`, false); break; }
  }
  check(`${tag}: cartão do plano atual (${seen}) marcado`, (await page.locator(`[data-plan-card="${seen}"]`).innerText()).length > 0 && (await page.locator(`[data-plan-card="${seen}"].border-brand`).count()) === 1);
  check(`${tag}: sem rolagem lateral`, await noSideScroll(page));
}

let scenario;
try {
  // ====================== A) cliente no plano ESSENTIAL (basico, 3 logins = no limite) ======================
  console.log('\n===== A) cliente no plano Essential (LICENSED_PLAN=basico, 3 logins)');
  scenario = await startScenario({ plan: 'basico', accounts: 3 });
  for (const [lang, viewport, mobile] of [['en', { width: 1280, height: 900 }, false], ['pt', { width: 1280, height: 900 }, false], ['es', { width: 1280, height: 900 }, false], ['pt', { width: 390, height: 844 }, true], ['en', { width: 390, height: 844 }, true]]) {
    const tag = `Essential ${lang} ${viewport.width}`;
    console.log(`\n-- ${tag}`);
    const { ctx, page } = await openApp(CLIENT, lang, viewport);
    await checkScreens(page, { seen: 'basico', used: 3, lang, mobile, tag });
    if (lang === 'pt' && !mobile) {
      // clicar num item travado abre a janelinha e NÃO troca de página; "Ver planos" leva à tela de planos
      for (const [nav, min] of [['placements', 'essencial'], ['timesheets', 'essencial'], ['reports', 'essencial'], ['automations', 'completo'], ['whatsapp', 'completo']]) {
        await go(page, '/candidates');
        await checkModal(page, { trigger: page.locator(`[data-nav="${nav}"]`), plan: min, lang, tag: `${tag} menu ${nav}` });
      }
      await go(page, '/candidates');
      await page.locator('[data-nav="reports"]').click();
      check(`${tag}: item travado não troca de página`, page.url().endsWith('#/candidates'), page.url());
      await page.locator('[data-testid="plan-upsell-close"]').click();
      // botões
      await go(page, '/candidates'); await page.getByRole('button', { name: /New Candidate/ }).click();
      await checkModal(page, { trigger: page.locator('[data-testid="resume-ai-open"]'), plan: 'essencial', lang, tag: `${tag} IA do currículo` });
      await go(page, '/settings'); await page.waitForSelector('#billing');
      await checkModal(page, { trigger: page.locator('[data-testid="whatsapp-connect"]'), plan: 'completo', lang, tag: `${tag} WhatsApp` });
      await go(page, '/settings'); await page.waitForSelector('#billing');
      await checkModal(page, { trigger: page.locator('[data-testid="careers-locked-open"]'), plan: 'essencial', lang, tag: `${tag} página de vagas` });
      await go(page, '/settings'); await page.waitForSelector('[data-testid="add-staff"]');
      await page.locator('[data-testid="add-staff"]').click();
      const d = page.locator('[data-testid="plan-upsell"]');
      await d.waitFor();
      check(`${tag}: "Add staff" no limite abre a janelinha de 'mais logins'`, (await d.innerText()).includes('Mais logins de equipe'));
      check(`${tag}: janelinha lista o que mais o plano inclui`, (await d.innerText()).includes('O plano Profissional também inclui'));
      await page.locator('[data-testid="plan-upsell-close"]').click();
      check(`${tag}: "Agora não" fecha e o formulário de equipe NÃO abriu`, (await d.count()) === 0 && (await page.locator('input[name="staff-name"]').count()) === 0);
      await page.locator('[data-testid="add-staff"]').click(); await d.waitFor(); await page.keyboard.press('Escape');
      check(`${tag}: Esc fecha a janelinha`, (await d.count()) === 0);
      check(`${tag}: ninguém vê o seletor 'Ver como plano' (não é dono da plataforma)`, (await page.locator('[data-testid="plan-preview"]').count()) === 0);
      await page.screenshot({ path: path.join(SHOTS, 'A-basico-planos-pt.png') });
    }
    if (mobile) {
      await go(page, '/'); await openMenuIfMobile(page, true);
      await page.screenshot({ path: path.join(SHOTS, `A-basico-menu-${lang}-390.png`) });
      await closeMenuIfMobile(page, true);
      await go(page, '/settings'); await page.waitForSelector('#billing');
      await page.locator('#billing').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `A-basico-planos-${lang}-390.png`) });
      await go(page, '/'); await openMenuIfMobile(page, true);
      await checkModal(page, { trigger: page.locator('[data-nav="timesheets"]'), plan: 'essencial', lang, tag: `${tag} menu timesheets` });
    }
    await ctx.close();
  }
  console.log('\n-- Pessoa da equipe (não é dono da conta) no plano Essential: vê o selo, mas a janelinha só fecha');
  {
    const { ctx, page } = await openApp(STAFF, 'pt', { width: 1280, height: 900 }, '/candidates');
    check('equipe vê o selo Profissional no menu', JSON.stringify(await badgesIn(page.locator('[data-nav="reports"]'))) === '["essencial"]');
    await checkModal(page, { trigger: page.locator('[data-nav="reports"]'), plan: 'essencial', lang: 'pt', tag: 'equipe', canUpgrade: false });
    await ctx.close();
  }
  console.log('\n-- DONO da plataforma numa instalação Essential: vê como cada plano (a conta real não muda)');
  for (const [lang, viewport, mobile] of [['pt', { width: 1280, height: 900 }, false], ['en', { width: 390, height: 844 }, true]]) {
    const { ctx, page } = await openApp(OWNER, lang, viewport, '/settings');
    const tag = `dono ${lang} ${viewport.width}`;
    await page.waitForSelector('#billing');
    await openMenuIfMobile(page, mobile);
    check(`${tag}: dono vê o seletor 'Ver como plano'`, (await page.locator('[data-testid="plan-preview"]').count()) === 1);
    if (mobile) await page.screenshot({ path: path.join(SHOTS, 'A-dono-menu-390.png') });
    await closeMenuIfMobile(page, mobile);
    check(`${tag}: sem faixa amarela enquanto está no próprio plano`, (await page.locator('[data-testid="plan-preview-bar"]').count()) === 0);
    for (const seen of ORDER) {
      await choosePreview(page, mobile, seen);
      const bar = page.locator('[data-testid="plan-preview-bar"]');
      await bar.waitFor({ timeout: 10000 });
      const txt = (await bar.innerText()).replace(/\s+/g, ' ');
      check(`${tag}: faixa diz "${NAME[lang][seen]}"`, txt.includes(NAME[lang][seen]) && txt.includes('Roster'), txt);
      const back = await page.locator('[data-testid="plan-preview-back"]').boundingBox();
      check(`${tag}: botão 'voltar ao meu plano' ≥ 40 px`, back && back.height >= 39.5, back);
      check(`${tag}: faixa visível no alto`, await page.evaluate(() => { const r = document.querySelector('[data-testid="plan-preview-bar"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }));
      await checkScreens(page, { seen, used: 3, lang, mobile, tag: `${tag} vendo ${NAME[lang][seen]}` });
      if (!mobile) await page.screenshot({ path: path.join(SHOTS, `A-dono-vendo-${seen}-${lang}.png`) });
      check(`${tag} vendo ${seen}: nota de prévia na tela de planos`, (await page.locator('[data-testid="plans-preview-note"]').count()) === 1);
      // botões de "Choose plan" ficam desligados na prévia
      check(`${tag} vendo ${seen}: 'Choose plan' desligado na prévia`, (await page.locator('[data-plan-card] button:not([disabled])', { hasText: 'Choose plan' }).count()) === 0);
    }
    // com o plano visto = Essential e 3 logins, "Add staff" abre a janelinha; "Voltar ao meu plano" tira a faixa
    await choosePreview(page, mobile, 'basico');
    await go(page, '/settings'); await page.waitForSelector('[data-testid="add-staff"]');
    await checkModal(page, { trigger: page.locator('[data-testid="add-staff"]'), plan: 'essencial', lang, tag: `${tag} prévia Essential add-staff` });
    await Promise.all([page.waitForLoadState('load'), page.locator('[data-testid="plan-preview-back"]').click()]);
    await page.waitForSelector('[data-testid=signout]', { state: 'attached' });
    await page.waitForTimeout(600);
    check(`${tag}: 'Voltar ao meu plano' tira a faixa`, (await page.locator('[data-testid="plan-preview-bar"]').count()) === 0);
    check(`${tag}: nada de prévia guardado depois de voltar`, (await page.evaluate(() => localStorage.getItem('roster_preview_plan'))) === null);
    await ctx.close();
  }
  await scenario.stop();

  // ====================== B) cliente no PROFESSIONAL (essencial, 10 logins = no limite) ======================
  console.log('\n===== B) cliente no plano Professional (LICENSED_PLAN=essencial, 10 logins)');
  scenario = await startScenario({ plan: 'essencial', accounts: 10 });
  for (const [lang, viewport, mobile] of [['en', { width: 1280, height: 900 }, false], ['es', { width: 390, height: 844 }, true]]) {
    const tag = `Professional ${lang} ${viewport.width}`;
    console.log(`\n-- ${tag}`);
    const { ctx, page } = await openApp(CLIENT, lang, viewport);
    await checkScreens(page, { seen: 'essencial', used: 10, lang, mobile, tag });
    if (!mobile) {
      await go(page, '/timesheets');
      await checkModal(page, { trigger: page.locator('[data-testid="margin-locked-open"]'), plan: 'completo', lang, tag: `${tag} margem` });
      await go(page, '/timesheets'); await page.waitForTimeout(400);
      await checkModal(page, { trigger: page.locator('[data-testid="approval-locked"]').first(), plan: 'completo', lang, tag: `${tag} link de aprovação` });
      await go(page, '/settings'); await page.waitForSelector('[data-testid="add-staff"]');
      await checkModal(page, { trigger: page.locator('[data-testid="add-staff"]'), plan: 'completo', lang, tag: `${tag} add-staff` });
    }
    await ctx.close();
  }
  await scenario.stop();

  // ====================== C) cliente no COMPLETE (nenhum selo) ======================
  console.log('\n===== C) cliente no plano Complete (nenhum selo em lugar nenhum)');
  scenario = await startScenario({ plan: 'completo', accounts: 11 });
  for (const [lang, viewport, mobile] of [['pt', { width: 1280, height: 900 }, false], ['en', { width: 390, height: 844 }, true]]) {
    const tag = `Complete ${lang} ${viewport.width}`;
    console.log(`\n-- ${tag}`);
    const { ctx, page } = await openApp(CLIENT, lang, viewport);
    await checkScreens(page, { seen: 'completo', used: 11, lang, mobile, tag });
    let stray = 0;
    for (const r of ['/', '/candidates', '/jobs', '/pipeline', '/interviews', '/clients', '/placements', '/timesheets', '/automations', '/reports', '/whatsapp', '/settings']) {
      await go(page, r); await page.waitForTimeout(350); stray += await page.locator('[data-plan-locked], [data-plan-notice]').count();
    }
    check(`${tag}: nenhum item/botão travado em 12 telas`, stray === 0, stray);
    await ctx.close();
  }
  await scenario.stop();

  // ====================== D) Roster da própria Impact (sem plano contratado): o dono olha como cada plano ======================
  console.log('\n===== D) Roster da Impact (sem LICENSED_PLAN, sem Stripe, 10 logins): o dono vê como cada plano');
  scenario = await startScenario({ plan: null, accounts: 10 });
  for (const [lang, viewport, mobile] of [['en', { width: 1280, height: 900 }, false], ['pt', { width: 390, height: 844 }, true]]) {
    const tag = `Impact ${lang} ${viewport.width}`;
    console.log(`\n-- ${tag}`);
    const { ctx, page } = await openApp(OWNER, lang, viewport, '/settings');
    await page.waitForSelector('#billing');
    for (const seen of ORDER) {
      await choosePreview(page, mobile, seen);
      await page.locator('[data-testid="plan-preview-bar"]').waitFor({ timeout: 10000 });
      await checkScreens(page, { seen, used: 10, lang, mobile, tag: `${tag} vendo ${NAME[lang][seen]}` });
    }
    await choosePreview(page, mobile, null);
    check(`${tag}: volta ao próprio plano sem faixa`, (await page.locator('[data-testid="plan-preview-bar"]').count()) === 0);
    await go(page, '/automations'); await page.waitForTimeout(300);
    check(`${tag}: sem prévia o dono usa tudo (Automations abre)`, (await page.locator('[data-plan-notice="automations"]').count()) === 0);
    await ctx.close();
  }
  {
    // não-dono (dono da empresa) com plano de prévia guardado à mão: o servidor ignora e o navegador esquece
    const { ctx, page } = await openApp(CLIENT, 'en', { width: 1280, height: 900 }, '/settings');
    await page.evaluate(() => localStorage.setItem('roster_preview_plan', 'basico'));
    await page.reload(); await page.waitForSelector('#billing'); await page.waitForTimeout(500);
    check('não-dono com plano de prévia guardado à mão: tudo liberado, sem faixa', (await page.locator('[data-testid="plan-preview-bar"]').count()) === 0 && (await page.locator('[data-plan-locked]').count()) === 0);
    check('não-dono: o navegador esquece o plano de prévia guardado', (await page.evaluate(() => localStorage.getItem('roster_preview_plan'))) === null);
    await ctx.close();
  }
  await scenario.stop();
  scenario = null;

  check('console e erros de página sem nenhum problema', consoleProblems.length === 0, consoleProblems.slice(0, 6));
  console.log('\nfotos: ' + SHOTS);
} catch (e) {
  fail++; console.log('  FAIL exceção: ' + (e.stack || e));
} finally {
  try { await scenario?.stop(); } catch { /* */ }
  try { await browser.close(); } catch { /* */ }
  try { web.close(); } catch { /* */ }
  for (const d of dbs) await admin.query(`DROP DATABASE IF EXISTS ${d} WITH (FORCE)`).catch(() => {});
  await admin.end().catch(() => {});
  console.log(`\n${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
}
