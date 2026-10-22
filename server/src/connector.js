// Conector OPCIONAL com o Rex (desligado por padrão): o dono manda as faturas de horas (timesheets_invoices) para o
// financeiro dele no Rex, usando a API pública do Rex. É só uma chamada HTTP: nada de banco, site ou domínio compartilhado.
//
// O que sai: fatura enviada (não rascunho) → cria a fatura no Rex como "a receber", sem e-mail nem lembretes do Rex (aqui já
// cobramos o cliente); fatura Paga → marca como paga lá. Reenviar nunca duplica (externalId). Se o Rex estiver fora do ar,
// a fatura fica na fila e é reenviada sozinha (ou pelo botão "Reenviar pendentes").
// A chave do Rex pode vir de um código de 6 dígitos gerado no Rex (Integrações), sem copiar chave de API.
import dns from 'node:dns/promises';
import net from 'node:net';
import { get, all, run } from './db.js';
import { encrypt, decrypt } from './secretBox.js';
import { requireOwner, blockDemo } from './auth.js';
import { requirePlan } from './billing.js';
import { invoiceNumber } from './portal.js';

const nowIso = () => new Date().toISOString();
const dateOnly = (v, fallback) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : fallback);
const EXT = (id) => `roster-invoice-${id}`;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

// Só https (http e endereços internos só em teste: CONNECTOR_ALLOW_INSECURE=1).
export async function assertSafeBase(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new Error('Invalid address. Example: https://rex-api.yourdomain.com'); }
  const insecure = process.env.CONNECTOR_ALLOW_INSECURE === '1';
  if (u.protocol !== 'https:' && !(insecure && u.protocol === 'http:')) throw new Error('The address must start with https://');
  if (u.username || u.password) throw new Error('Do not put a user name or password in the address.');
  if (!insecure) {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
    if (!addrs.length) throw new Error('Could not find that address.');
    if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('That address points to an internal network and is not allowed.');
  }
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

const rawSettings = () => get('SELECT * FROM connector_settings WHERE id = 1');
async function saveSettings(f) {
  const cur = (await rawSettings()) || {};
  const v = { enabled: cur.enabled ?? 0, base_url: cur.base_url ?? null, api_key: cur.api_key ?? null, app_url: cur.app_url ?? null, remote_json: cur.remote_json ?? null, auth_failed_at: cur.auth_failed_at ?? null, ...f };
  await run(`INSERT INTO connector_settings (id, enabled, base_url, api_key, app_url, remote_json, auth_failed_at, updated_at) VALUES (1,$1,$2,$3,$4,$5,$6,now())
    ON CONFLICT (id) DO UPDATE SET enabled=EXCLUDED.enabled, base_url=EXCLUDED.base_url, api_key=EXCLUDED.api_key, app_url=EXCLUDED.app_url, remote_json=EXCLUDED.remote_json, auth_failed_at=EXCLUDED.auth_failed_at, updated_at=now()`,
  [v.enabled, v.base_url, v.api_key, v.app_url, v.remote_json, v.auth_failed_at]);
}
async function settings() {
  const r = await rawSettings();
  if (!r) return null;
  let apiKey = null;
  try { apiKey = r.api_key ? decrypt(r.api_key) : null; } catch { apiKey = null; }
  return { enabled: !!r.enabled, baseUrl: r.base_url, apiKey, appUrl: r.app_url };
}
async function log(timesheetId, action, ok, message) {
  await run('INSERT INTO connector_log (timesheet_id, action, ok, message) VALUES ($1,$2,$3,$4)', [timesheetId ?? null, action, ok ? 1 : 0, String(message || '').slice(0, 300)]);
  await run('DELETE FROM connector_log WHERE id NOT IN (SELECT id FROM connector_log ORDER BY id DESC LIMIT 100)');
}

async function call(s, method, path, body) {
  const base = await assertSafeBase(s.baseUrl);
  let r;
  try {
    r = await fetch(`${base}/api/v1${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${s.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Could not reach Rex: ${e.name === 'TimeoutError' ? 'timed out' : e.cause?.code || e.message}`);
  }
  const data = await r.json().catch(() => ({}));
  // Só "chave inválida/revogada" (401) ou "o plano não inclui a API" (402) marcam a conexão como caída.
  const planLacksApi = r.status === 402 && (data.code === 'plan_feature' || data.feature === 'api');
  if (r.ok) { if ((await rawSettings())?.auth_failed_at) await saveSettings({ auth_failed_at: null }); }
  else if ((r.status === 401 || planLacksApi) && !(await rawSettings())?.auth_failed_at) await saveSettings({ auth_failed_at: nowIso() });
  if (!r.ok) {
    const hint = r.status === 401 ? 'Invalid or revoked key.' : planLacksApi ? 'The Rex plan does not include the API.' : r.status === 403 ? 'The key is read-only (create one with write permission).' : '';
    throw Object.assign(new Error((hint || data.error || `Error ${r.status}`).trim()), { status: r.status });
  }
  return data;
}

export async function testConnection(s) {
  const me = await call(s, 'GET', '/me');
  await saveSettings({ remote_json: JSON.stringify({ planName: me.planName, plan: me.plan, appUrl: me.appUrl, at: nowIso() }) });
  return me;
}

/* ------------------------------ envio das faturas ------------------------------ */
const INVOICE_SQL = `
  SELECT t.id, t.status, t.hours, t.amount, t.period_start, t.period_end, t.invoice_sent_at,
         cd.name AS candidate_name, c.company_name AS client_name, c.contact_email AS client_email, j.title AS job_title
  FROM timesheets_invoices t
  JOIN placements p ON p.id = t.placement_id
  JOIN candidates cd ON cd.id = p.candidate_id
  JOIN clients c ON c.id = p.client_id
  JOIN jobs j ON j.id = p.job_id
  WHERE t.id = $1`;

export async function syncTimesheet(id) {
  const s = await settings();
  if (!s?.enabled || !s.baseUrl || !s.apiKey) return { skipped: true };
  const t = await get(INVOICE_SQL, [id]);
  if (!t || t.status === 'Draft' || !(Number(t.amount) > 0)) return { skipped: true };
  await run('INSERT INTO connector_sync (timesheet_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  const st = await get('SELECT * FROM connector_sync WHERE timesheet_id = $1', [id]);
  try {
    let remoteId = st.remote_id;
    if (!remoteId) {
      const issue = dateOnly(t.invoice_sent_at ? new Date(t.invoice_sent_at).toISOString() : t.period_end, dateOnly(t.period_end, nowIso().slice(0, 10)));
      const r = await call(s, 'POST', '/invoices', {
        externalId: EXT(id), number: invoiceNumber(id), customerName: t.client_name, customerEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.client_email || '') ? t.client_email : undefined,
        issueDate: issue, send: true, notify: false, reminders: false,
        notes: `Roster — ${t.candidate_name}, ${t.job_title}, ${t.period_start} to ${t.period_end}`,
        items: [{ description: `Staffing: ${t.candidate_name} — ${t.job_title} (${t.period_start} to ${t.period_end}, ${Number(t.hours)} h)`, qty: 1, unitPrice: Number(t.amount) }],
      });
      remoteId = r.invoice?.id || EXT(id);
      await run('UPDATE connector_sync SET remote_id = $2, last_error = NULL, updated_at = now() WHERE timesheet_id = $1', [id, remoteId]);
      await log(id, 'invoice', true, `Invoice ${invoiceNumber(id)} sent to Rex.`);
    }
    if (t.status === 'Paid' && !st.paid_synced) {
      await call(s, 'POST', `/invoices/${encodeURIComponent(EXT(id))}/paid`, { notify: false });
      await run('UPDATE connector_sync SET paid_synced = 1, updated_at = now() WHERE timesheet_id = $1', [id]);
      await log(id, 'paid', true, `Invoice ${invoiceNumber(id)} marked as paid in Rex.`);
    }
    return { ok: true };
  } catch (e) {
    await run('UPDATE connector_sync SET attempts = attempts + 1, last_error = $2, updated_at = now() WHERE timesheet_id = $1', [id, String(e.message).slice(0, 300)]);
    await log(id, 'error', false, e.message);
    return { ok: false, error: e.message };
  }
}

// Chamado quando uma fatura de horas é criada, enviada ou muda de situação; nunca atrasa nem derruba a resposta ao usuário.
export function queueSync(id) {
  if (!id) return;
  setImmediate(() => { syncTimesheet(Number(id)).catch((e) => console.error('[connector] sync:', e.message)); });
}

async function pendingIds({ includeNever = false } = {}) {
  const base = `FROM timesheets_invoices t LEFT JOIN connector_sync cs ON cs.timesheet_id = t.id WHERE t.status <> 'Draft' AND t.amount > 0`;
  const sql = includeNever
    ? `SELECT t.id ${base} AND (cs.timesheet_id IS NULL OR cs.remote_id IS NULL OR (t.status = 'Paid' AND cs.paid_synced = 0)) ORDER BY t.id LIMIT 200`
    : `SELECT t.id ${base} AND cs.timesheet_id IS NOT NULL AND (cs.remote_id IS NULL OR (t.status = 'Paid' AND cs.paid_synced = 0)) AND cs.attempts < 20 ORDER BY t.id LIMIT 200`;
  return (await all(sql)).map((r) => r.id);
}
export async function retryPending(opts) {
  let sent = 0, failed = 0;
  for (const id of await pendingIds(opts)) {
    const r = await syncTimesheet(id);
    if (r.ok) sent++; else if (r.ok === false) failed++;
  }
  return { sent, failed };
}
export function startConnectorRetry() {
  const t = setInterval(async () => {
    try { if ((await settings())?.enabled) await retryPending(); } catch (e) { console.error('[connector] retry:', e.message); }
  }, 15 * 60 * 1000);
  t.unref?.();
}

/* ------------------------------ rotas do dono ------------------------------ */
async function statusPayload() {
  const r = await rawSettings();
  let remote = null; try { remote = r?.remote_json ? JSON.parse(r.remote_json) : null; } catch { remote = null; }
  const count = async (where) => Number((await get(`SELECT COUNT(*) AS n FROM timesheets_invoices t LEFT JOIN connector_sync cs ON cs.timesheet_id = t.id WHERE t.status <> 'Draft' AND t.amount > 0 AND ${where}`)).n) || 0;
  return {
    enabled: !!r?.enabled, baseUrl: r?.base_url || '', keySaved: !!r?.api_key, appUrl: r?.app_url || '',
    authFailed: !!r?.auth_failed_at, remote: remote ? { planName: remote.planName || remote.plan || '' } : null,
    synced: await count(`cs.remote_id IS NOT NULL AND (t.status <> 'Paid' OR cs.paid_synced = 1)`),
    pending: await count(`(cs.timesheet_id IS NULL OR cs.remote_id IS NULL OR (t.status = 'Paid' AND cs.paid_synced = 0))`),
    log: (await all('SELECT timesheet_id AS "timesheetId", action, ok, message, created_at AS at FROM connector_log ORDER BY id DESC LIMIT 15')).map((l) => ({ ...l, ok: !!l.ok })),
  };
}

async function turnOn({ baseUrl, apiKey }) {
  const url = await assertSafeBase(baseUrl);
  if (!String(apiKey || '').startsWith('rex_live_')) throw new Error('The Rex key starts with rex_live_…');
  const me = await testConnection({ baseUrl: url, apiKey });
  await saveSettings({ enabled: 1, base_url: url, api_key: encrypt(apiKey), app_url: me.appUrl ? String(me.appUrl).slice(0, 300) : null, auth_failed_at: null });
  await log(null, 'enabled', true, 'Connection turned on.');
  queueSync(0);
  return statusPayload();
}

export function mountConnector(app, ar) {
  const guard = [requireOwner, blockDemo, requirePlan('connector')];
  app.get('/api/connector/status', requireOwner, ar(async (_req, res) => res.json(await statusPayload())));

  // Liga com a chave colada (rex_live_…) — ou só desliga, sem mexer na chave.
  app.put('/api/connector/settings', ...guard, ar(async (req, res) => {
    const b = req.body || {};
    try {
      if (!b.enabled) { await saveSettings({ enabled: 0 }); await log(null, 'disabled', true, 'Connection turned off.'); return res.json(await statusPayload()); }
      const cur = await settings();
      res.json(await turnOn({ baseUrl: b.baseUrl ?? cur?.baseUrl, apiKey: (typeof b.apiKey === 'string' && b.apiKey.trim()) || cur?.apiKey }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  // "Conectar ao Rex": o dono gera um código de 6 dígitos no Rex (Integrações) e digita aqui com o e-mail do Rex.
  app.post('/api/connector/pair', ...guard, ar(async (req, res) => {
    const b = req.body || {};
    try {
      const baseUrl = await assertSafeBase(b.baseUrl ?? (await settings())?.baseUrl);
      const email = String(b.email || '').trim();
      const code = String(b.code || '').replace(/\s/g, '');
      if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Type the email of your Rex account and the 6-digit code.' });
      let r;
      try {
        r = await fetch(`${baseUrl}/api/v1/pair`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, code, name: 'Roster' }) });
      } catch (e) { return res.status(400).json({ error: `Could not reach Rex: ${e.name === 'TimeoutError' ? 'timed out' : e.cause?.code || e.message}` }); }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { await log(null, 'pair', false, data.error || `Error ${r.status}`); return res.status(400).json({ error: data.error || `Rex refused the code (error ${r.status}).` }); }
      if (typeof data.key !== 'string' || !data.key.startsWith('rex_live_')) return res.status(400).json({ error: 'Rex answered something unexpected. Try again.' });
      await log(null, 'pair', true, 'Code accepted by Rex.');
      res.json(await turnOn({ baseUrl, apiKey: data.key }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  // "Reenviar pendentes"; com { existing: true } também manda as faturas antigas que nunca foram enviadas.
  app.post('/api/connector/resync', ...guard, ar(async (req, res) => {
    if (!(await settings())?.enabled) return res.status(400).json({ error: 'Turn the connection on first.' });
    const r = await retryPending({ includeNever: !!req.body?.existing });
    res.json({ ...r, status: await statusPayload() });
  }));

  app.delete('/api/connector', ...guard, ar(async (_req, res) => {
    await saveSettings({ enabled: 0, api_key: null, auth_failed_at: null });
    await log(null, 'disconnected', true, 'Key removed.');
    res.json(await statusPayload());
  }));
}
