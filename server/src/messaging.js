// One-to-one messages to candidates: e-mail, SMS (through the agency's OWN Twilio account) and WhatsApp (the
// connection Roster already has), with reusable templates and one history per candidate.
// No bulk sending on purpose: every message is written for one person and goes out on a click.
import crypto from 'node:crypto';
import express from 'express';
import { get, all, run } from './db.js';
import { decrypt, encrypt } from './secretBox.js';
import { sendEmail, isMailConfigured } from './mailer.js';
import * as whatsapp from './whatsapp.js';
import { makeLimiter } from './auth.js';
import { readProfile } from './profile.js';

const TWILIO_BASE = () => (process.env.TWILIO_API_BASE || 'https://api.twilio.com').replace(/\/$/, '');
const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]?\s*$/i;
const START_WORDS = /^\s*(start|unstop|yes)\s*[.!]?\s*$/i;
export const OPT_OUT_FOOTER = 'Reply STOP to opt out.';
export const CHANNELS = ['email', 'sms', 'whatsapp'];

export const DEFAULT_TEMPLATES = [
  { name: 'Introduction', channel: 'any', subject: 'Opportunity at {{client}}: {{job_title}}', body: 'Hi {{first_name}}, this is {{recruiter}} from {{agency}}. We have a {{job_title}} role with {{client}} that looks like a good fit for you. Do you have a few minutes to talk this week?' },
  { name: 'Interview invitation', channel: 'any', subject: 'Interview for {{job_title}}', body: 'Hi {{first_name}}, {{client}} would like to interview you for the {{job_title}} role. What days and times work for you this week? - {{recruiter}}, {{agency}}' },
  { name: 'Check-in', channel: 'any', subject: 'Quick check-in', body: 'Hi {{first_name}}, just checking in. Are you still looking for work? Let me know and I will send you what we have open. - {{recruiter}}, {{agency}}' },
  { name: 'Timesheet reminder', channel: 'any', subject: 'Please send your timesheet', body: 'Hi {{first_name}}, a reminder to send your timesheet for this period so we can process it on time. Thank you! - {{recruiter}}, {{agency}}' },
  { name: 'Thank you', channel: 'any', subject: 'Thank you', body: 'Hi {{first_name}}, thank you for your time. We will be in touch soon with an update. - {{recruiter}}, {{agency}}' },
];

// ---------- helpers ----------
export const digits = (p) => String(p || '').replace(/\D/g, '');
export const last10 = (p) => digits(p).slice(-10);

// US numbers are the default; a leading + keeps any country.
export function toE164(raw) {
  const s = String(raw || '').trim();
  const d = digits(s);
  if (s.startsWith('+')) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export function render(text, vars) {
  const missing = new Set();
  const out = String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    if (v === undefined || v === '') { missing.add(k); return ''; }
    return v;
  });
  return { text: out.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?])/g, '$1'), missing: [...missing] };
}

async function varsFor(candidate, account, submissionId) {
  const a = await readProfile();
  const sub = submissionId
    ? await get(`SELECT j.title, c.company_name FROM submissions s JOIN jobs j ON j.id = s.job_id JOIN clients c ON c.id = j.client_id WHERE s.id = $1 AND s.candidate_id = $2`, [Number(submissionId) || 0, candidate.id])
    : await get(`SELECT j.title, c.company_name FROM submissions s JOIN jobs j ON j.id = s.job_id JOIN clients c ON c.id = j.client_id
        WHERE s.candidate_id = $1 AND s.stage NOT IN ('Rejected', 'Withdrawn') ORDER BY s.submitted_date DESC, s.id DESC LIMIT 1`, [candidate.id]);
  const owner = await get(`SELECT name FROM users WHERE id = $1`, [candidate.owner_user_id]);
  const name = String(candidate.name || '').trim();
  return {
    first_name: name.split(/\s+/)[0] || '',
    name,
    job_title: sub?.title || '',
    client: sub?.company_name || '',
    agency: a.name || '',
    recruiter: (account?.name || owner?.name || '').trim(),
  };
}

async function smsConnection() {
  const row = await get(`SELECT * FROM sms_connection WHERE id = 1`);
  if (!row) return null;
  try { return { sid: row.account_sid, token: decrypt(row.auth_token_enc), from: row.from_number, connected_at: row.connected_at }; } catch { return null; }
}

const basic = (sid, token) => `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;

async function twilioSend(conn, to, body) {
  const form = new URLSearchParams({ To: to, From: conn.from, Body: body });
  const r = await fetch(`${TWILIO_BASE()}/2010-04-01/Accounts/${conn.sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: basic(conn.sid, conn.token), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.message || 'Twilio could not send this message.'); e.status = 502; e.code = 'twilio_error'; throw e; }
  return { sid: data.sid, status: data.status || 'queued' };
}

// Twilio signs: URL + each POST param (sorted by name) as name+value, HMAC-SHA1 with the auth token, base64.
export function twilioSignature(token, url, params) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return crypto.createHmac('sha1', token).update(data).digest('base64');
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function webhookUrl(req) {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/api/integrations/sms/webhook`;
}

// ---------- public: Twilio calls this when a candidate replies ----------
export function mountSmsWebhook(app, ar) {
  app.post('/api/integrations/sms/webhook', express.urlencoded({ extended: false, limit: '20kb' }), ar(async (req, res) => {
    const conn = await smsConnection();
    if (!conn) return res.sendStatus(404);
    const sig = req.get('x-twilio-signature');
    if (!sig || !safeEq(sig, twilioSignature(conn.token, webhookUrl(req), req.body || {}))) return res.sendStatus(403);
    const from = String(req.body.From || '');
    const body = String(req.body.Body || '').slice(0, 1600);
    const people = from ? await all(`SELECT id FROM candidates WHERE right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1`, [last10(from)]) : [];
    if (last10(from).length === 10) {
      for (const c of people) {
        await run(`INSERT INTO messages (channel, direction, candidate_id, contact, body, status, external_id) VALUES ('sms', 'in', $1, $2, $3, 'received', $4)`,
          [c.id, from, body, req.body.MessageSid || null]);
        if (STOP_WORDS.test(body)) await run(`UPDATE candidates SET sms_opt_out = TRUE WHERE id = $1`, [c.id]);
        else if (START_WORDS.test(body)) await run(`UPDATE candidates SET sms_opt_out = FALSE WHERE id = $1`, [c.id]);
      }
      if (!people.length) await run(`INSERT INTO messages (channel, direction, contact, body, status, external_id) VALUES ('sms', 'in', $1, $2, 'received', $3)`, [from, body, req.body.MessageSid || null]);
    }
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }));
}

// ---------- staff routes (the caller adds login + Essential plan) ----------
export function mountMessaging(app, ar, { requireOwner, blockDemo }) {
  const sendLimit = makeLimiter({ windowMs: 60_000, max: 30 });

  // --- SMS connection (the agency's own Twilio account) ---
  app.get('/api/integrations/sms/status', ar(async (req, res) => {
    const c = await smsConnection();
    res.json(c ? { connected: true, from_number: c.from, account_sid_masked: `${c.sid.slice(0, 4)}…${c.sid.slice(-4)}`, connected_at: c.connected_at, webhook_url: webhookUrl(req) } : { connected: false, webhook_url: webhookUrl(req) });
  }));

  app.post('/api/integrations/sms/connect', requireOwner, blockDemo, ar(async (req, res) => {
    const sid = String(req.body?.account_sid || '').trim();
    const token = String(req.body?.auth_token || '').trim();
    const from = toE164(req.body?.from_number);
    if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) return res.status(400).json({ error: 'The Account SID starts with "AC" and has 34 characters.', code: 'invalid_sid' });
    if (token.length < 16) return res.status(400).json({ error: 'Paste the Auth Token from your Twilio console.', code: 'invalid_token' });
    if (!from) return res.status(400).json({ error: 'Enter the Twilio phone number, for example +15125550123.', code: 'invalid_phone' });
    let r;
    try { r = await fetch(`${TWILIO_BASE()}/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: basic(sid, token) } }); } catch { return res.status(502).json({ error: 'Could not reach Twilio. Try again in a moment.', code: 'twilio_unreachable' }); }
    if (!r.ok) return res.status(400).json({ error: 'Twilio did not accept these credentials. Check the Account SID and Auth Token.', code: 'twilio_rejected' });
    await run(`INSERT INTO sms_connection (id, account_sid, auth_token_enc, from_number, connected_at) VALUES (1, $1, $2, $3, now())
      ON CONFLICT (id) DO UPDATE SET account_sid = EXCLUDED.account_sid, auth_token_enc = EXCLUDED.auth_token_enc, from_number = EXCLUDED.from_number, connected_at = now()`,
    [sid, encrypt(token), from]);
    res.json({ connected: true, from_number: from, webhook_url: webhookUrl(req) });
  }));

  app.post('/api/integrations/sms/disconnect', requireOwner, ar(async (_req, res) => {
    await run(`DELETE FROM sms_connection WHERE id = 1`);
    res.json({ connected: false });
  }));

  // --- templates ---
  async function ensureDefaults() {
    if ((await get(`SELECT COUNT(*) AS n FROM message_templates`)).n === 0) {
      for (const t of DEFAULT_TEMPLATES) await run(`INSERT INTO message_templates (name, channel, subject, body) VALUES ($1, $2, $3, $4)`, [t.name, t.channel, t.subject, t.body]);
    }
  }
  const tplInput = (b) => {
    const name = String(b?.name || '').trim().slice(0, 80);
    const body = String(b?.body || '').trim().slice(0, 1500);
    const channel = ['any', ...CHANNELS].includes(b?.channel) ? b.channel : 'any';
    const subject = String(b?.subject || '').trim().slice(0, 200);
    return { name, body, channel, subject };
  };

  app.get('/api/message-templates', ar(async (_req, res) => {
    await ensureDefaults();
    res.json(await all(`SELECT * FROM message_templates ORDER BY name`));
  }));
  app.post('/api/message-templates', blockDemo, ar(async (req, res) => {
    const t = tplInput(req.body);
    if (!t.name || !t.body) return res.status(400).json({ error: 'Give the template a name and a message.', code: 'template_invalid' });
    const r = await run(`INSERT INTO message_templates (name, channel, subject, body) VALUES ($1, $2, $3, $4) RETURNING id`, [t.name, t.channel, t.subject, t.body]);
    res.status(201).json(await get(`SELECT * FROM message_templates WHERE id = $1`, [r.rows[0].id]));
  }));
  app.put('/api/message-templates/:id', blockDemo, ar(async (req, res) => {
    const t = tplInput(req.body);
    if (!t.name || !t.body) return res.status(400).json({ error: 'Give the template a name and a message.', code: 'template_invalid' });
    const r = await run(`UPDATE message_templates SET name = $2, channel = $3, subject = $4, body = $5 WHERE id = $1`, [Number(req.params.id) || 0, t.name, t.channel, t.subject, t.body]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(await get(`SELECT * FROM message_templates WHERE id = $1`, [Number(req.params.id)]));
  }));
  app.delete('/api/message-templates/:id', blockDemo, ar(async (req, res) => {
    const r = await run(`DELETE FROM message_templates WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  }));

  // --- per candidate ---
  const candidate = (id) => get(`SELECT * FROM candidates WHERE id = $1`, [Number(id) || 0]);

  app.get('/api/candidates/:id/messages', ar(async (req, res) => {
    const c = await candidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const sms = await smsConnection();
    const wa = await whatsapp.isConfigured();
    const rows = await all(`SELECT channel, direction, subject, body, status, created_at FROM messages WHERE candidate_id = $1`, [c.id]);
    const waRows = last10(c.phone).length === 10
      ? await all(`SELECT 'whatsapp' AS channel, direction, NULL AS subject, body, status, created_at FROM whatsapp_messages WHERE right(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = $1`, [last10(c.phone)])
      : [];
    const history = [...rows, ...waRows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    res.json({
      history,
      channels: { email: { ready: isMailConfigured(), has_contact: !!c.email }, sms: { ready: !!sms, has_contact: !!toE164(c.phone), opted_out: !!c.sms_opt_out }, whatsapp: { ready: wa, has_contact: last10(c.phone).length === 10 } },
    });
  }));

  app.post('/api/candidates/:id/messages/preview', ar(async (req, res) => {
    const c = await candidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const vars = await varsFor(c, req.account, req.body?.submission_id);
    const body = render(req.body?.body, vars);
    const subject = render(req.body?.subject, vars);
    res.json({ subject: subject.text, body: body.text, missing: [...new Set([...body.missing, ...subject.missing])] });
  }));

  app.post('/api/candidates/:id/messages', blockDemo, ar(async (req, res) => {
    const c = await candidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    const key = `send:${req.account?.id || req.ip}`;
    const wait = sendLimit.blockedFor(key);
    if (wait) { res.set('Retry-After', String(wait)); return res.status(429).json({ error: 'Slow down: too many messages in a minute.', code: 'rate_limited' }); }
    const channel = req.body?.channel;
    if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Choose e-mail, SMS or WhatsApp.', code: 'invalid_channel' });
    const vars = await varsFor(c, req.account, req.body?.submission_id);
    const body = render(req.body?.body, vars).text.trim().slice(0, channel === 'sms' ? 1000 : 4000);
    const subject = render(req.body?.subject, vars).text.trim().slice(0, 200);
    if (!body) return res.status(400).json({ error: 'Write a message first.', code: 'empty_message' });
    sendLimit.hit(key);

    if (channel === 'email') {
      if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return res.status(400).json({ error: 'This candidate has no valid e-mail address.', code: 'no_contact' });
      if (!isMailConfigured()) return res.status(503).json({ error: 'E-mail is not set up on this server yet. Ask your administrator.', code: 'email_not_configured' });
      const a = await readProfile();
      await sendEmail({ to: c.email, subject: subject || `Message from ${a.name || 'your recruiter'}`, text: body, replyTo: a.email || req.account?.email, fromName: a.name });
      await run(`INSERT INTO messages (channel, direction, candidate_id, contact, subject, body, status, account_id) VALUES ('email', 'out', $1, $2, $3, $4, 'sent', $5)`, [c.id, c.email, subject || null, body, req.account?.id || null]);
      return res.status(201).json({ ok: true, channel });
    }

    if (channel === 'sms') {
      const conn = await smsConnection();
      if (!conn) return res.status(409).json({ error: 'Connect your Twilio account in Settings to send SMS.', code: 'sms_not_connected' });
      const to = toE164(c.phone);
      if (!to) return res.status(400).json({ error: 'This candidate has no valid mobile number.', code: 'no_contact' });
      if (c.sms_opt_out) return res.status(409).json({ error: 'This person replied STOP and does not want SMS. Use e-mail or call.', code: 'sms_opt_out' });
      const first = !(await get(`SELECT 1 FROM messages WHERE channel = 'sms' AND direction = 'out' AND candidate_id = $1 LIMIT 1`, [c.id]));
      const text = first ? `${body} ${OPT_OUT_FOOTER}` : body;
      const r = await twilioSend(conn, to, text);
      await run(`INSERT INTO messages (channel, direction, candidate_id, contact, body, status, external_id, account_id) VALUES ('sms', 'out', $1, $2, $3, $4, $5, $6)`, [c.id, to, text, r.status, r.sid, req.account?.id || null]);
      return res.status(201).json({ ok: true, channel });
    }

    // WhatsApp
    if (!(await whatsapp.isConfigured())) return res.status(409).json({ error: 'Connect WhatsApp in the WhatsApp page first.', code: 'whatsapp_not_connected' });
    const to = digits(toE164(c.phone) || '');
    if (!to) return res.status(400).json({ error: 'This candidate has no valid mobile number.', code: 'no_contact' });
    try { await whatsapp.sendMessage(to, body); } catch (e) { return res.status(502).json({ error: e.message, code: 'whatsapp_error' }); }
    res.status(201).json({ ok: true, channel });
  }));
}
