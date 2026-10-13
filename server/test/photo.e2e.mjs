// "Importar de foto" no NAVEGADOR (CRM Postgres + front em HashRouter): IA simulada; servidor real; build real do front.
// Config por PHOTO_E2E_CFG (JSON). Exemplo (Binder):
// Produto SÓ em inglês (sem troca de idioma): use "langKey":"" e o teste do celular confere em inglês.
//  {"entry":"server/src/index.js","ownerEnv":{"BOOTSTRAP_OWNER_EMAIL":"owner@agency.test","BOOTSTRAP_OWNER_PASSWORD":"owner-password-14"},"email":"owner@agency.test","password":"owner-password-14",
//   "clientsHash":"#/insureds","expensesHash":"#/banks", (opcional: "leadsHash":"#/leads","leadSource":"Zillow")"langKey":"binder-language","plan":"essencial","clientType":"business"}
// Uso: VITE_API_URL=http://127.0.0.1:4330 npx vite build --outDir <pasta> (no client);  TEST_DATABASE_URL=... PHOTO_DIST=<pasta> node photo.e2e.pg.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const CFG = JSON.parse(process.env.PHOTO_E2E_CFG || "{}");
const C = { entry: "server/src/index.js", cwd: process.cwd(), ownerEnv: {}, email: "owner@agency.test", password: "owner-password-14", emailSel: 'input[type="email"]', passSel: 'input[type="password"]', submit: 'button[type="submit"]',
  clientsHash: "#/clients", expensesHash: "#/expenses", leadsHash: "", langKey: "language", plan: "essencial", clientType: "residential", ready: "nav", extraEnv: {}, ...CFG };
const API = 4330, WEB = 4331, AIP = 4332;
const dist = process.env.PHOTO_DIST;
const DB = process.env.TEST_DATABASE_URL;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "photo-pg-"));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
fs.writeFileSync(path.join(tmp, "print.png"), PNG);
const pool = new pg.Pool({ connectionString: DB, ssl: false });

let reply = {};
const ai = http.createServer((req, res) => {
  let raw = ""; req.on("data", (d) => (raw += d));
  req.on("end", () => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "t", name: "record_import", input: reply }], usage: { input_tokens: 1, output_tokens: 1 } })); });
}).listen(AIP);

function boot(extra) {
  const child = spawn(process.execPath, [C.entry], { cwd: C.cwd, env: { ...process.env, PORT: String(API), DATABASE_URL: DB, PGSSL: "false", JWT_SECRET: "u".repeat(40), CORS_ORIGINS: `http://127.0.0.1:${WEB}`, FRONTEND_URL: `http://127.0.0.1:${WEB}`, LICENSED_PLAN: C.plan, ...C.ownerEnv, ...C.extraEnv, ...extra } });
  let log = ""; child.stdout.on("data", (d) => (log += d)); child.stderr.on("data", (d) => (log += d));
  return { child, log: () => log };
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const web = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(dist, p);
  if (!f.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) f = path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(WEB);
async function waitApi() {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${API}/api/me`); if (r.status) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
  await new Promise((r) => setTimeout(r, 600));
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let failed = 0;
const pages = [];
async function step(name, fn) {
  try { await fn(); console.log("ok  -", name); }
  catch (e) {
    failed++; console.log("ERRO-", name, "\n      ", String(e.message).split("\n")[0], "\n      ", (String(e.stack).split("\n").find((l) => l.includes("photo.e2e")) || "").trim());
    for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(process.env.PHOTO_SHOTS || tmp, `falha-${i}.png`) }).catch(() => {});
  }
}
async function newPage(viewport, lang) {
  const ctx = await browser.newContext({ viewport, ...(viewport.width < 500 ? { hasTouch: true, isMobile: true } : {}) });
  if (lang && C.langKey) await ctx.addInitScript(([k, l]) => { try { localStorage.setItem(k, l); } catch { /* */ } }, [C.langKey, lang]);
  const p = await ctx.newPage(); pages.push(p);
  return p;
}
async function login(page) {
  await page.goto(`http://127.0.0.1:${WEB}/#/`);
  await page.waitForSelector(C.emailSel);
  await page.fill(C.emailSel, C.email); await page.fill(C.passSel, C.password);
  await page.click(C.submit);
  await page.waitForSelector(C.ready, { timeout: 20000 });
  // guia "Primeiros passos" abre sozinho no primeiro acesso: fecha com Esc
  if (await page.waitForSelector('[data-testid="tour"], [role="dialog"]', { timeout: 2500 }).catch(() => null)) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
}
const go = async (page, hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await page.waitForTimeout(500); };
const openPhoto = async (page) => { await page.click('[data-testid="photo-import-open"]'); await page.waitForSelector('[data-testid="photo-modal"]'); };

let srv = boot({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_BASE_URL: `http://127.0.0.1:${AIP}`, PHOTO_MIGRATION_DAYS: "0" });
try {
  await waitApi();
  for (const q of C.seedSql || []) await pool.query(q); // ex.: um usuário/vendedor que o cadastro exige
  const page = await newPage({ width: 1280, height: 900 }, "en");
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|fonts/.test(m.text())) errors.push(m.text()); });
  await login(page);

  await step("Clientes: foto → conferir (amarelo) → editar → desmarcar → salvar", async () => {
    await go(page, C.clientsHash);
    await page.waitForSelector('[data-testid="photo-import-open"]');
    reply = { records: [
      { name: "Marina Souza", phone: "(407) 555-0188", email: "marina@x.com", address: "9 Pine Ave, Kissimmee FL", type: C.clientType, notes: "x", unclear_fields: ["phone"] },
      { name: "Café Aurora", phone: "(407) 555-0199", email: "", address: "", type: C.clientType, notes: null, unclear_fields: [] },
      { name: "Fulano Teste", phone: "", email: "", address: "", type: C.clientType, notes: null, unclear_fields: [] },
    ], note: "Confira o telefone da Marina." };
    await openPhoto(page);
    await page.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png"));
    await page.waitForSelector('[data-testid="photo-row"]');
    assert.equal(await page.locator('[data-testid="photo-row"]').count(), 3);
    const txt = await page.locator('[data-testid="photo-modal"]').innerText();
    assert.match(txt, /Check this one/); assert.match(txt, /Confira o telefone da Marina/);
    await page.locator('[data-testid="photo-row"]').nth(0).locator('[data-testid="photo-name"]').fill("Marina de Souza");
    await page.locator('[data-testid="photo-row"]').nth(2).locator('input[type="checkbox"]').uncheck();
    assert.match(await page.locator('[data-testid="photo-save"]').innerText(), /Save 2/);
    await page.click('[data-testid="photo-save"]');
    await page.waitForSelector('[data-testid="photo-modal"]', { state: "detached" });
    await page.waitForSelector("text=Marina de Souza >> visible=true"); await page.waitForSelector("text=Café Aurora >> visible=true");
    assert.equal(await page.locator("text=Fulano Teste").count(), 0, "o desmarcado não foi salvo");
  });

  await step("Clientes: linha sem nome não é salva e mostra o erro", async () => {
    reply = { records: [{ name: "Joana Lima", phone: "", email: "", address: "", type: C.clientType, notes: null, unclear_fields: [] }, { name: null, phone: "(407) 555-0000", email: "", address: "", type: C.clientType, notes: null, unclear_fields: [] }], note: null };
    await openPhoto(page);
    await page.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png"));
    await page.waitForSelector('[data-testid="photo-row"]');
    await page.click('[data-testid="photo-save"]');
    await page.waitForSelector("text=Name is required");
    assert.equal(await page.locator('[data-testid="photo-row"]').count(), 1);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="photo-modal"]', { state: "detached" });
    await page.waitForSelector("text=Joana Lima >> visible=true");
  });

  if (C.leadsHash) await step("Leads: conversa → nome, origem e interesse → salvar", async () => {
    await go(page, C.leadsHash);
    await page.waitForSelector('[data-testid="photo-import-open"]');
    reply = { records: [{ name: "Tom Reyes", phone: "(407) 555-0199", email: "", interest: "3-bed in Winter Park", source: C.leadSource || "other", notes: null, unclear_fields: ["interest"] }], note: null };
    await openPhoto(page);
    await page.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png"));
    await page.waitForSelector('[data-testid="photo-row"]');
    assert.equal(await page.locator('[data-testid="photo-name"]').inputValue(), "Tom Reyes");
    await page.click('[data-testid="photo-save"]');
    await page.waitForSelector('[data-testid="photo-modal"]', { state: "detached" });
    await page.waitForSelector("text=Tom Reyes >> visible=true");
  });

  if (C.expensesHash) await step("Despesas: nota fiscal → valor, data e categoria → salvar", async () => {
    await go(page, C.expensesHash);
    reply = { records: [{ description: "Home Depot — esponjas", amount: 42.5, date: "2026-10-02", category: "other", unclear_fields: ["amount"] }], note: null };
    await openPhoto(page);
    await page.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png"));
    await page.waitForSelector('[data-testid="photo-row"]');
    assert.equal(await page.locator('[data-testid="photo-amount"]').inputValue(), "42.5");
    await page.locator('[data-testid="photo-amount"]').fill("43.10");
    await page.click('[data-testid="photo-save"]');
    await page.waitForSelector('[data-testid="photo-modal"]', { state: "detached" });
    await page.waitForSelector("text=Home Depot — esponjas >> visible=true");
  });

  await step("celular: modal sem rolagem lateral, em português", async () => {
    const m = await newPage({ width: 390, height: 844 }, "pt");
    await login(m);
    await go(m, C.clientsHash);
    reply = { records: [{ name: "Maria Silva", phone: "(407) 555-0142", email: "maria@email.com", address: "12 Oak St, Orlando FL", type: C.clientType, notes: null, unclear_fields: ["email"] }], note: null };
    await m.waitForSelector('[data-testid="photo-import-open"]');
    await openPhoto(m);
    assert.match(await m.locator('[data-testid="photo-modal"]').innerText(), C.langKey ? /Tire uma foto/ : /Take a photo/);
    await m.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png"));
    await m.waitForSelector('[data-testid="photo-row"]');
    assert.match(await m.locator('[data-testid="photo-modal"]').innerText(), C.langKey ? /Confira este/ : /Check this one/);
    const w = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(w.sw <= w.cw + 1, `rolagem lateral ${w.sw} > ${w.cw}`);
    await m.screenshot({ path: path.join(process.env.PHOTO_SHOTS || tmp, "photo-mobile.png") });
  });
  assert.deepEqual(errors, [], "sem erros no console: " + errors.join(" | "));

  // ---- créditos: aviso 80% → limite → aceite → extra → teto ----
  srv.child.kill(); await new Promise((r) => setTimeout(r, 600));
  srv = boot({ ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_BASE_URL: `http://127.0.0.1:${AIP}`, PHOTO_MIGRATION_DAYS: "0", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_API_BASE: "http://127.0.0.1:9", BILLING_STRIPE_CUSTOMER_ID: "cus_1", PHOTO_EXTRA_CAPS_CENTS: "20,1000" });
  await waitApi();
  await pool.query("TRUNCATE photo_imports; DELETE FROM usage_credit");
  await step("créditos: aviso de 80%, limite, aceite, uso extra e teto", async () => {
    for (let i = 0; i < 79; i++) await pool.query("INSERT INTO photo_imports (kind, records) VALUES ('clients', 1)");
    const p3 = await newPage({ width: 1280, height: 900 }, "en");
    await login(p3); await go(p3, C.clientsHash);
    reply = { records: [{ name: "Lia Costa", phone: "", email: "", address: "", type: C.clientType, notes: null, unclear_fields: [] }], note: null };
    await openPhoto(p3);
    await p3.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png")); // nº 80
    await p3.waitForSelector('[data-testid="photo-row"]');
    assert.match(await p3.locator('[data-testid="photo-warn-review"]').innerText(), /80 of 100 photo reads/);
    await p3.keyboard.press("Escape");
    for (let i = 0; i < 20; i++) await pool.query("INSERT INTO photo_imports (kind, records) VALUES ('clients', 1)");
    await openPhoto(p3);
    await p3.waitForSelector('[data-testid="photo-credit"]');
    assert.equal(await p3.locator('[data-testid="photo-file"]').count(), 0, "sem aceite não lê");
    assert.match(await p3.locator('[data-testid="photo-modal"]').innerText(), /US\$ 0\.10/);
    assert.equal(await p3.locator('[data-testid="photo-credit-on"]').isDisabled(), true);
    await p3.selectOption('[data-testid="photo-credit-cap"]', "20");
    await p3.check('[data-testid="photo-credit-agree"]');
    await p3.click('[data-testid="photo-credit-on"]');
    await p3.waitForSelector('[data-testid="photo-credit-active"]');
    assert.match(await p3.locator('[data-testid="photo-credit-active"]').innerText(), /US\$ 0\.00 of US\$ 0\.20/);
    for (let i = 0; i < 2; i++) {
      await p3.setInputFiles('[data-testid="photo-file"]', path.join(tmp, "print.png"));
      await p3.waitForSelector('[data-testid="photo-row"]');
      await p3.click("text=Try another image");
    }
    await p3.waitForSelector('[data-testid="photo-credit"]');
    assert.match(await p3.locator('[data-testid="photo-warn"]').innerText(), /reached your extra limit of US\$ 0\.20/);
    assert.equal(await p3.locator('[data-testid="photo-file"]').count(), 0);
    assert.match(await p3.locator('[data-testid="photo-credit"]').innerText(), /Turn on extra reads/);
    await p3.screenshot({ path: path.join(process.env.PHOTO_SHOTS || tmp, "photo-credit.png") });
  });

  srv.child.kill(); await new Promise((r) => setTimeout(r, 600));
  srv = boot({ ANTHROPIC_API_KEY: "" });
  await waitApi();
  await step("sem chave da IA: aviso claro, sem botão de escolher imagem", async () => {
    const p2 = await newPage({ width: 1280, height: 800 }, "en");
    await login(p2); await go(p2, C.clientsHash);
    await openPhoto(p2);
    await p2.waitForSelector('[data-testid="photo-blocked"]');
    assert.match(await p2.locator('[data-testid="photo-blocked"]').innerText(), /not connected/i);
    assert.equal(await p2.locator('[data-testid="photo-file"]').count(), 0);
  });
} catch (e) {
  failed++; console.log("ERRO geral", e.message, "\n", srv.log().slice(-600));
} finally {
  await browser.close(); srv.child.kill(); web.close(); ai.close(); await pool.end().catch(() => {});
  console.log(failed ? `${failed} falha(s)` : "tudo certo");
  process.exit(failed ? 1 : 0);
}
