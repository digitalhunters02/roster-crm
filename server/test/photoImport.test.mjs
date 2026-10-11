// "Importar de foto" + uso extra (créditos) em CRM POSTGRES: IA e Stripe simulados, servidor real.
//   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/<banco_de_teste> PGSSL=false node --test test/photoImport.test.mjs
// Ajuste o bloco CFG (login do dono, planos, rotas) para o produto.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const CFG = {
  base: "/api/photo-import", login: "/api/auth/login", entry: "src/index.js", ready: "listening",
  email: "owner@agency.test", password: "owner-password-14", ownerEnv: { BOOTSTRAP_OWNER_EMAIL: "owner@agency.test", BOOTSTRAP_OWNER_PASSWORD: "owner-password-14" },
  planIncluded: "essencial", planNot: "basico", limits: { essencial: 100, completo: 500 }, kinds: ["clients"], clientType: "business", ...(globalThis.PHOTO_TEST_CFG || {}),
};
const URL_ = process.env.TEST_DATABASE_URL;
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let port = 5300 + Math.floor(Math.random() * 90);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const aiSeen = [];
let aiMode = "ok", reply = {};
const ai = http.createServer((req, res) => {
  let raw = ""; req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    aiSeen.push({ key: req.headers["x-api-key"], body });
    res.setHeader("content-type", "application/json");
    if (aiMode === "fail") { res.statusCode = 500; return res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } })); }
    res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: body.model, stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "t", name: "record_import", input: reply }], usage: { input_tokens: 5, output_tokens: 5 } }));
  });
});
await new Promise((r) => ai.listen(0, "127.0.0.1", r));
const AI_URL = `http://127.0.0.1:${ai.address().port}`;

const stripeSeen = [], stripeItems = new Map();
let stripeDown = false;
const stripe = http.createServer((req, res) => {
  let raw = ""; req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = Object.fromEntries(new URLSearchParams(raw)); const key = req.headers["idempotency-key"];
    stripeSeen.push({ url: req.url, key, body, auth: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    if (stripeDown) { res.statusCode = 500; return res.end(JSON.stringify({ error: { message: "boom" } })); }
    if (req.url === "/v1/invoiceitems") {
      if (key && stripeItems.has(key)) return res.end(JSON.stringify(stripeItems.get(key)));
      const item = { id: `ii_${stripeItems.size + 1}`, object: "invoiceitem", ...body }; if (key) stripeItems.set(key, item);
      return res.end(JSON.stringify(item));
    }
    res.statusCode = 404; res.end("{}");
  });
});
await new Promise((r) => stripe.listen(0, "127.0.0.1", r));
const STRIPE_URL = `http://127.0.0.1:${stripe.address().port}`;
test.after(() => { ai.closeAllConnections?.(); ai.close(); stripe.closeAllConnections?.(); stripe.close(); });

async function boot(extra = {}) {
  port += 1;
  const env = { ...process.env, PORT: String(port), DATABASE_URL: URL_, JWT_SECRET: "testsecret", PGSSL: "false", ...CFG.ownerEnv, ...extra };
  for (const k of ["LICENSED_PLAN", "STRIPE_SECRET_KEY", "ANTHROPIC_API_KEY", "PLAID_CLIENT_ID", "PLAID_SECRET", "INTEGRATIONS_ENCRYPTION_KEY"]) if (!(k in extra)) delete env[k];
  const child = spawn(process.execPath, [CFG.entry], { cwd: serverDir, env });
  let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 200; i++) { if (out.includes(CFG.ready)) break; await sleep(100); }
  assert.ok(out.includes(CFG.ready), "server did not start: " + out);
  const b = `http://127.0.0.1:${port}`;
  const call = async (p, method = "GET", body, token) => {
    const r = await fetch(b + p, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch { /* vazio */ }
    return { status: r.status, body: j };
  };
  const photo = async (token, { kind = CFG.kinds[0], file = PNG, lang = "pt" } = {}) => {
    const fd = new FormData(); if (kind) fd.append("kind", kind); fd.append("lang", lang); if (file) fd.append("file", new Blob([file]), "print.png");
    const r = await fetch(b + CFG.base, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const login = async () => (await call(CFG.login, "POST", { email: CFG.email, password: CFG.password })).body.token;
  const status = async (T) => (await call(`${CFG.base}/status`, "GET", undefined, T)).body;
  return { call, photo, login, status, logs: () => out, stop: () => new Promise((r) => { child.once("exit", r); child.kill(); }) };
}
const reset = (pool) => pool.query("TRUNCATE photo_imports; DELETE FROM usage_credit");
const AIENV = { ANTHROPIC_API_KEY: "sk-test-key", ANTHROPIC_BASE_URL: AI_URL };

test("importar de foto (Postgres): sem chave, leitura, normalização, erros e planos", { skip: !URL_ && "set TEST_DATABASE_URL to run" }, async () => {
  const pool = new pg.Pool({ connectionString: URL_, ssl: false });
  let s = await boot({ LICENSED_PLAN: CFG.planIncluded });
  try {
    const T = await s.login(); assert.ok(T, "owner can log in");
    assert.equal((await s.photo()).status, 401);
    assert.equal((await s.status(T)).configured, false);
    const r = await s.photo(T);
    assert.equal(r.status, 503); assert.equal(r.body.code, "ai_not_configured");
  } finally { await s.stop(); }

  s = await boot({ ...AIENV, LICENSED_PLAN: CFG.planIncluded });
  try {
    const T = await s.login();
    await reset(pool);
    const st = await s.status(T);
    assert.equal(st.configured, true);
    assert.equal(st.limit, CFG.limits[CFG.planIncluded] + 100, "plano + pacote de migração da conta nova");
    assert.equal(st.migrationBonus, 100);
    reply = { records: [
      { name: "  Maria   Silva ", phone: "(407) 555-0142", email: "MARIA@Email.com", address: "12 Oak St, Orlando FL 32801", type: CFG.clientType, notes: "x", unclear_fields: ["phone"] },
      { name: "Acme Dental", phone: "123", email: "not-an-email", address: null, type: "weird", notes: null, unclear_fields: ["bogus", "email"] },
      { name: null, phone: null, email: null, address: "só endereço", type: null, notes: null, unclear_fields: [] },
    ], note: "O telefone da Maria está borrado." };
    let r = await s.photo(T, { kind: "clients" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.records.length, 2);
    assert.equal(r.body.records[0].name, "Maria Silva"); assert.equal(r.body.records[0].email, "maria@email.com"); assert.deepEqual(r.body.records[0].unclearFields, ["phone"]);
    assert.equal(r.body.records[1].phone, ""); assert.equal(r.body.records[1].email, ""); assert.deepEqual(r.body.records[1].unclearFields, ["email"]);
    assert.ok(!("tokens" in r.body));
    const sent = aiSeen.at(-1);
    assert.equal(sent.key, "sk-test-key"); assert.deepEqual(sent.body.tool_choice, { type: "tool", name: "record_import" });
    assert.equal(sent.body.messages[0].content[0].source.data, PNG.toString("base64"));
    assert.match(sent.body.system, /untrusted DATA/);
    const row = (await pool.query("SELECT * FROM photo_imports ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(row.records, 2); assert.equal(row.input_tokens, 5); assert.equal(row.output_tokens, 5); assert.equal(row.extra_cents, 0);
    assert.ok(!Object.keys(row).some((k) => /image|text|content/.test(k)), "nada da imagem/texto é guardado");

    if (CFG.kinds.includes("expense")) {
      reply = { records: [{ description: "Home Depot — esponjas", amount: "$42.50", date: "2026-02-31", category: "supplies?", unclear_fields: [] }], note: null };
      r = await s.photo(T, { kind: "expense", lang: "en" });
      assert.equal(r.status, 200); assert.equal(r.body.records[0].amount, 42.5); assert.equal(r.body.records[0].date, null); assert.equal(r.body.records[0].category, "other");
    }
    if (CFG.kinds.includes("leads")) {
      reply = { records: [{ name: "Tom Reyes", phone: "407-555-0199", email: "TOM@x.com", interest: "3-bed in Winter Park", source: CFG.leadSource || "other", notes: null, unclear_fields: [] },
        { name: "Ana", phone: null, email: null, interest: null, source: "tiktok", notes: null, unclear_fields: [] }], note: null };
      r = await s.photo(T, { kind: "leads", lang: "en" });
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.records[0].source, CFG.leadSource || "other"); assert.equal(r.body.records[0].email, "tom@x.com");
      assert.equal(r.body.records[1].source, CFG.leadFallback || "other", "origem desconhecida cai em Other");
    }
    reply = { records: [], note: "Nada aqui." };
    r = await s.photo(T); assert.deepEqual(r.body.records, []);
    assert.equal((await s.photo(T, { kind: "contracts" })).body.code, "bad_kind");
    assert.equal((await s.photo(T, { file: null })).body.code, "no_file");
    assert.equal((await s.photo(T, { file: Buffer.from("isto não é uma imagem, é só texto comprido") })).body.code, "bad_image");
    assert.equal((await s.photo(T, { file: Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]) })).status, 413);
    const before = (await s.status(T)).used;
    aiMode = "fail"; r = await s.photo(T); aiMode = "ok";
    assert.equal(r.status, 502); assert.equal(r.body.code, "ai_failed");
    assert.equal((await s.status(T)).used, before, "falha da IA não conta");
  } finally { await s.stop(); }

  if (CFG.planNot) {
    s = await boot({ ...AIENV, LICENSED_PLAN: CFG.planNot });
    try {
      const T = await s.login();
      const r = await s.photo(T);
      assert.equal(r.status, 402); assert.equal(r.body.code, "plan_limit"); assert.equal(r.body.limit, 0);
      assert.equal((await s.status(T)).migrationBonus, 0);
    } finally { await s.stop(); }
  }
  await pool.end();
});

test("uso extra (Postgres): avisos, aceite, teto, cobrança única no Stripe, novo ciclo e desligar", { skip: !URL_ && "set TEST_DATABASE_URL to run" }, async () => {
  const pool = new pg.Pool({ connectionString: URL_, ssl: false });
  let s = await boot({ ...AIENV, LICENSED_PLAN: CFG.planIncluded, PHOTO_MIGRATION_DAYS: "0" });
  try {
    const T = await s.login();
    const r = await s.call(`${CFG.base}/credit`, "PUT", { enabled: true, capCents: 1000, accept: true }, T);
    assert.equal(r.status, 409); assert.equal(r.body.code, "no_billing");
  } finally { await s.stop(); }

  s = await boot({ ...AIENV, LICENSED_PLAN: CFG.planIncluded, PHOTO_MIGRATION_DAYS: "0", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_API_BASE: STRIPE_URL,
    BILLING_STRIPE_CUSTOMER_ID: "cus_1", BILLING_STRIPE_SUBSCRIPTION_ID: "sub_1", PHOTO_EXTRA_CAPS_CENTS: "30,1000", PHOTO_EXTRA_CENTS: "10", PHOTO_BILLING_INTERVAL_MS: "400" });
  try {
    const T = await s.login();
    await reset(pool);
    reply = { records: [{ name: "Ana", unclear_fields: [] }], note: null };
    const add = async (n) => { for (let i = 0; i < n; i++) await pool.query("INSERT INTO photo_imports (kind, records) VALUES ('clients', 1)"); };
    await add(79);
    assert.equal((await s.status(T)).warn, null);
    assert.equal((await s.photo(T)).body.warn, "80");
    await sleep(300);
    assert.match(s.logs(), /aviso para .*80% of your photo reads|aviso para .*80% das leituras/);
    assert.equal((await s.photo(T)).status, 200);
    assert.equal((s.logs().match(/aviso para [^\n]*80%/g) || []).length, 1, "aviso de 80% só uma vez no mês");
    await add(18);
    assert.equal((await s.photo(T)).body.warn, "100");
    await sleep(300);
    assert.match(s.logs(), /reached your photo read limit|atingiu o limite de leituras/);

    let r = await s.photo(T);
    assert.equal(r.status, 402); assert.equal(r.body.code, "plan_limit"); assert.equal(r.body.credit.eligible, true);
    assert.equal(stripeSeen.length, 0);
    assert.equal((await s.call(`${CFG.base}/credit`, "PUT", { enabled: true, capCents: 30 })).status, 401);
    assert.equal((await s.call(`${CFG.base}/credit`, "PUT", { enabled: true, capCents: 30 }, T)).body.code, "accept_required");
    assert.equal((await s.call(`${CFG.base}/credit`, "PUT", { enabled: true, capCents: 999, accept: true }, T)).body.code, "bad_cap");
    stripeDown = true;
    r = await s.call(`${CFG.base}/credit`, "PUT", { enabled: true, capCents: 30, accept: true }, T);
    assert.equal(r.status, 200); assert.equal(r.body.credit.enabled, true);
    for (let i = 0; i < 3; i++) { r = await s.photo(T); assert.equal(r.status, 200); assert.equal(r.body.extra, true); }
    assert.equal(r.body.credit.spentCents, 30); assert.equal(r.body.warn, "credit_100");
    r = await s.photo(T); assert.equal(r.status, 402); assert.equal(r.body.code, "credit_limit");
    assert.equal((await s.status(T)).used, 100);
    await sleep(1400);
    const tries = stripeSeen.filter((x) => x.url === "/v1/invoiceitems");
    assert.ok(tries.length >= 2); assert.equal(new Set(tries.map((x) => x.key)).size, 1, "sempre o mesmo lote"); assert.equal(stripeItems.size, 0);
    stripeDown = false;
    for (let i = 0; i < 40 && stripeItems.size === 0; i++) await sleep(100);
    assert.equal(stripeItems.size, 1);
    const item = [...stripeItems.values()][0];
    assert.equal(item.amount, "30"); assert.equal(item.customer, "cus_1"); assert.equal(item.subscription, "sub_1"); assert.equal(item.currency, "usd");
    await sleep(1200);
    const calls = stripeSeen.filter((x) => x.url === "/v1/invoiceitems").length;
    await sleep(900);
    assert.equal(stripeSeen.filter((x) => x.url === "/v1/invoiceitems").length, calls, "depois de cobrado não chama o Stripe de novo");
    assert.equal(Number((await pool.query("SELECT COUNT(*)::int n FROM photo_imports WHERE extra_cents > 0 AND billed_at IS NULL")).rows[0].n), 0);

    await pool.query("UPDATE photo_imports SET created_at = now() - interval '40 days'");
    let st = await s.status(T);
    assert.equal(st.used, 0); assert.equal(st.credit.spentCents, 0); assert.equal(st.credit.enabled, true); assert.equal(st.credit.capCents, 30);
    await add(100);
    r = await s.photo(T);
    assert.equal(r.status, 200); assert.equal(r.body.extra, true, "estourou de novo: usa o teto que já tinha");
    r = await s.call(`${CFG.base}/credit`, "PUT", { enabled: false }, T);
    assert.equal(r.body.credit.enabled, false);
    assert.equal((await s.photo(T)).body.code, "plan_limit");
  } finally { await s.stop(); await pool.end(); }
});
