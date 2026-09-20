// WhatsApp Business Cloud API integration — one shared connection for the
// whole company, configured by pasting Meta developer-console credentials
// (there's no per-user OAuth flow for WhatsApp Business, unlike Gmail).
import crypto from 'node:crypto';
import { get, all, run } from './db.js';

const GRAPH_VERSION = 'v21.0';

export async function getConnection() {
  return get(`SELECT * FROM whatsapp_connection WHERE id = 1`);
}

export async function isConfigured() {
  const conn = await getConnection();
  return !!(conn && conn.phone_number_id && conn.access_token);
}

async function fetchDisplayPhone(phoneNumberId, accessToken) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Could not verify the WhatsApp phone number — check the token and phone number ID.');
  return data.display_phone_number;
}

export async function saveConnection({ phoneNumberId, accessToken, businessAccountId, verifyToken }) {
  const displayPhone = await fetchDisplayPhone(phoneNumberId, accessToken);
  await run(`
    INSERT INTO whatsapp_connection (id, phone_number_id, business_account_id, access_token, verify_token, display_phone, connected_at)
    VALUES (1, $1, $2, $3, $4, $5, now())
    ON CONFLICT (id) DO UPDATE SET
      phone_number_id = excluded.phone_number_id,
      business_account_id = excluded.business_account_id,
      access_token = excluded.access_token,
      verify_token = excluded.verify_token,
      display_phone = excluded.display_phone,
      connected_at = excluded.connected_at
  `, [phoneNumberId, businessAccountId || null, accessToken, verifyToken || null, displayPhone]);
  return displayPhone;
}

export async function disconnect() {
  await run(`DELETE FROM whatsapp_connection WHERE id = 1`);
}

export async function sendMessage(to, text) {
  const conn = await getConnection();
  if (!conn) throw new Error('WhatsApp is not connected.');
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${conn.phone_number_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.access_token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Failed to send the WhatsApp message.');
  const waMessageId = data.messages?.[0]?.id || crypto.randomUUID();
  await run(`
    INSERT INTO whatsapp_messages (id, wa_message_id, contact_phone, direction, body, status)
    VALUES ($1, $2, $3, 'out', $4, 'sent')
  `, [crypto.randomUUID(), waMessageId, to, text]);
  return waMessageId;
}

// Meta's one-time handshake for the webhook URL: it GETs with these three
// query params and expects the raw challenge echoed back to prove ownership.
export function verifyWebhook(query, verifyToken) {
  if (verifyToken && query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
    return query['hub.challenge'];
  }
  return null;
}

export async function handleWebhookEvent(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  for (const msg of value.messages || []) {
    const text = msg.text?.body || `[${msg.type}]`;
    await run(`
      INSERT INTO whatsapp_messages (id, wa_message_id, contact_phone, direction, body, status)
      VALUES ($1, $2, $3, 'in', $4, 'received')
      ON CONFLICT (wa_message_id) DO NOTHING
    `, [crypto.randomUUID(), msg.id, msg.from, text]);
  }

  for (const status of value.statuses || []) {
    await run(`UPDATE whatsapp_messages SET status = $1 WHERE wa_message_id = $2`, [status.status, status.id]);
  }
}

export async function listConversations() {
  return all(`
    SELECT * FROM (
      SELECT DISTINCT ON (contact_phone) contact_phone, body, direction, status, created_at
      FROM whatsapp_messages
      ORDER BY contact_phone, created_at DESC
    ) latest
    ORDER BY created_at DESC
  `);
}

export async function getConversation(phone) {
  return all(`SELECT * FROM whatsapp_messages WHERE contact_phone = $1 ORDER BY created_at ASC`, [phone]);
}
