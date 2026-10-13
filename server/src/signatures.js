// E-signature through the agency's own Documenso. The agency uploads ITS OWN PDF (offer letter, assignment confirmation,
// NDA...) and picks who signs; Roster does not write or judge the contract. Signed copy is kept in the database.
//   GET    /api/signatures/status          is Documenso connected? (open to any plan, so the screen can explain)
//   GET    /api/signatures?kind&related_id list
//   POST   /api/signatures                 multipart: file (PDF), kind (candidate|client), related_id, title, signer_name, signer_email
//   POST   /api/signatures/:id/refresh     ask Documenso for the current state
//   GET    /api/signatures/:id/signed      download the signed PDF
//   DELETE /api/signatures/:id             remove a request that failed
import multer from 'multer';
import { get, all, run } from './db.js';
import * as documenso from './documenso.js';
import { makeLimiter } from './auth.js';

const KINDS = ['candidate', 'client'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const PUBLIC = `SELECT s.id, s.kind, s.related_id, s.title, s.signer_name, s.signer_email, s.status, s.error, s.signing_url,
  (s.signed_pdf IS NOT NULL) AS has_signed_file, s.created_at, s.signed_at, s.last_checked_at,
  CASE WHEN s.kind = 'candidate' THEN (SELECT name FROM candidates WHERE id = s.related_id) ELSE (SELECT company_name FROM clients WHERE id = s.related_id) END AS related_name
  FROM signature_requests s`;

const chains = new Map();
// Refreshes of one request run one after the other (poller + click can overlap) so the signed copy is stored once.
export function refreshRequest(id) {
  const next = (chains.get(id) || Promise.resolve()).catch(() => {}).then(() => doRefresh(id));
  chains.set(id, next);
  next.catch(() => {}).then(() => { if (chains.get(id) === next) chains.delete(id); });
  return next;
}

async function doRefresh(id) {
  const row = await get(`SELECT * FROM signature_requests WHERE id = $1`, [id]);
  if (!row || !row.documenso_id || !documenso.isConfigured()) return row ? get(`${PUBLIC} WHERE s.id = $1`, [id]) : null;
  let state = row.status, signedAt = row.signed_at, problem = null;
  if (row.status === 'sent' || row.status === 'viewed') {
    try {
      const st = await documenso.getStatus(row.documenso_id);
      state = st.state;
      if (state === 'signed') signedAt = st.signedAt ? new Date(st.signedAt) : new Date();
    } catch (e) { problem = e.message; }
  }
  let pdf = row.signed_pdf;
  if (state === 'signed' && !pdf) {
    try { pdf = await documenso.downloadSigned(row.documenso_id); } catch (e) { problem = e.message; }
  }
  await run(`UPDATE signature_requests SET status = $2, signed_at = $3, signed_pdf = $4, error = $5, last_checked_at = now() WHERE id = $1`,
    [id, state, signedAt, pdf, problem]);
  return get(`${PUBLIC} WHERE s.id = $1`, [id]);
}

export async function pollPending() {
  if (!documenso.isConfigured()) return 0;
  const rows = await all(`SELECT id FROM signature_requests WHERE status IN ('sent','viewed') AND documenso_id IS NOT NULL ORDER BY id LIMIT 50`);
  for (const r of rows) await refreshRequest(r.id).catch(() => {});
  return rows.length;
}
export function startSignaturePoller() {
  setInterval(() => pollPending().catch(() => {}), 10 * 60 * 1000).unref();
}

export function mountSignatures(app, ar, { requirePlan, blockDemo }) {
  const sendLimit = makeLimiter({ windowMs: 60_000, max: 10 });

  app.get('/api/signatures/status', ar(async (_req, res) => {
    res.json({ connected: documenso.isConfigured(), ...(documenso.isConfigured() ? {} : { message: documenso.NOT_CONFIGURED_MESSAGE }) });
  }));

  app.use('/api/signatures', requirePlan('completo'));

  app.get('/api/signatures', ar(async (req, res) => {
    const where = [], params = [];
    if (KINDS.includes(req.query.kind)) { params.push(req.query.kind); where.push(`s.kind = $${params.length}`); }
    if (req.query.related_id) { params.push(Number(req.query.related_id) || 0); where.push(`s.related_id = $${params.length}`); }
    res.json(await all(`${PUBLIC} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT 200`, params));
  }));

  app.get('/api/signatures/defaults', ar(async (req, res) => {
    const kind = req.query.kind, id = Number(req.query.related_id) || 0;
    const row = kind === 'candidate' ? await get(`SELECT name, email FROM candidates WHERE id = $1`, [id])
      : kind === 'client' ? await get(`SELECT contact_name AS name, contact_email AS email FROM clients WHERE id = $1`, [id]) : null;
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json({ signer_name: row.name || '', signer_email: row.email || '' });
  }));

  app.post('/api/signatures', blockDemo, upload.single('file'), ar(async (req, res) => {
    const b = req.body || {};
    const fail = (status, error, code) => res.status(status).json({ error, code });
    if (!documenso.isConfigured()) return fail(503, documenso.NOT_CONFIGURED_MESSAGE, 'not_configured');
    const wait = sendLimit.blockedFor('sig');
    if (wait) return fail(429, 'Slow down: too many documents in a minute.', 'rate_limited');
    if (!KINDS.includes(b.kind)) return fail(400, 'Choose candidate or client.', 'invalid_kind');
    const related = b.kind === 'candidate' ? await get(`SELECT id FROM candidates WHERE id = $1`, [Number(b.related_id) || 0])
      : await get(`SELECT id FROM clients WHERE id = $1`, [Number(b.related_id) || 0]);
    if (!related) return fail(404, 'Record not found.', 'not_found');
    if (!req.file) return fail(400, 'Choose the PDF to sign.', 'file_required');
    if (req.file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return fail(400, 'That file is not a PDF.', 'not_pdf');
    const signerName = String(b.signer_name || '').trim().slice(0, 120);
    const signerEmail = String(b.signer_email || '').trim().toLowerCase();
    if (!signerName) return fail(400, 'Type the signer\'s name.', 'signer_name_required');
    if (!EMAIL_RE.test(signerEmail)) return fail(400, 'Type a valid signer e-mail.', 'signer_email_invalid');
    const title = String(b.title || req.file.originalname || 'Document').replace(/\.pdf$/i, '').trim().slice(0, 120) || 'Document';
    sendLimit.hit('sig');
    let sent;
    try {
      sent = await documenso.createAndSend({ title, pdfBuffer: req.file.buffer, signer: { name: signerName, email: signerEmail }, subject: title, message: String(b.message || '').slice(0, 500) });
    } catch (e) {
      const row = await get(`INSERT INTO signature_requests (kind, related_id, title, signer_name, signer_email, status, error, account_id) VALUES ($1,$2,$3,$4,$5,'error',$6,$7) RETURNING id`,
        [b.kind, related.id, title, signerName, signerEmail, e.message, req.account?.id || null]);
      return res.status(502).json({ error: e.message, code: 'documenso_error', request: await get(`${PUBLIC} WHERE s.id = $1`, [row.id]) });
    }
    const row = await get(`INSERT INTO signature_requests (kind, related_id, title, signer_name, signer_email, status, signing_url, documenso_id, account_id) VALUES ($1,$2,$3,$4,$5,'sent',$6,$7,$8) RETURNING id`,
      [b.kind, related.id, title, signerName, signerEmail, sent.signingUrl, sent.documentId, req.account?.id || null]);
    res.status(201).json(await get(`${PUBLIC} WHERE s.id = $1`, [row.id]));
  }));

  app.post('/api/signatures/:id/refresh', ar(async (req, res) => {
    if (!documenso.isConfigured()) return res.status(503).json({ error: documenso.NOT_CONFIGURED_MESSAGE, code: 'not_configured' });
    const row = await refreshRequest(Number(req.params.id) || 0);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  }));

  app.get('/api/signatures/:id/signed', ar(async (req, res) => {
    const row = await get(`SELECT title, signed_pdf FROM signature_requests WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (!row.signed_pdf) return res.status(409).json({ error: 'It is not signed yet.', code: 'not_signed' });
    const name = `${String(row.title).replace(/[^\w .()-]+/g, '_').slice(0, 80)} - signed.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"` }).send(row.signed_pdf);
  }));

  app.delete('/api/signatures/:id', ar(async (req, res) => {
    const row = await get(`SELECT status FROM signature_requests WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!row) return res.status(404).json({ error: 'not found' });
    if (row.status !== 'error') return res.status(409).json({ error: 'Only a request that failed can be removed.', code: 'not_removable' });
    await run(`DELETE FROM signature_requests WHERE id = $1`, [Number(req.params.id)]);
    res.status(204).end();
  }));
}
