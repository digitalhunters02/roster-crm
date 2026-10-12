// Small client for the Documenso REST API (v1) — self-hosted e-signature.
//
// Configuration (environment):
//   DOCUMENSO_URL        base URL of the Documenso instance, e.g. https://sign.example.com
//   DOCUMENSO_API_TOKEN  an API token created in Documenso (Settings > API tokens)
//   DOCUMENSO_TIMEZONE   optional, IANA name used on the signing page (default America/New_York)
//   DOCUMENSO_DATE_FIELD optional, "0" to place only a signature field (no date field)
//
// Everything that depends on the exact shape of Documenso's API lives in the
// two blocks marked "ADJUST HERE" below (request paths/bodies and response
// readers), so changing it after seeing the real server is a local edit.
// The API token is never logged and never put in an error message.

// ---------------------------------------------------------------------------
// ADJUST HERE (1/2): authentication. Documenso API tokens are sent RAW in the
// Authorization header, NOT prefixed with "Bearer ". If a future version wants
// "Bearer <token>", change this one function.
// ---------------------------------------------------------------------------
export const AUTH_HEADER_NAME = "Authorization";
export const authHeaderValue = (token) => token;

// ---------------------------------------------------------------------------
// ADJUST HERE (2/2): every endpoint (method, path, request body) in one place.
// ---------------------------------------------------------------------------
export const ENDPOINTS = {
  createDocument: ({ title, recipients, meta }) => ({
    method: "POST",
    path: "/api/v1/documents",
    body: { title, recipients, meta },
  }),
  createField: (documentId, field) => ({
    method: "POST",
    path: `/api/v1/documents/${encodeURIComponent(documentId)}/fields`,
    // pageX/pageY/pageWidth/pageHeight are PERCENTAGES (0-100) of the page,
    // measured from the top-left corner; pageNumber is 1-based.
    body: field,
  }),
  sendDocument: (documentId, { sendEmail = true } = {}) => ({
    method: "POST",
    path: `/api/v1/documents/${encodeURIComponent(documentId)}/send`,
    body: { sendEmail },
  }),
  getDocument: (documentId) => ({ method: "GET", path: `/api/v1/documents/${encodeURIComponent(documentId)}` }),
  downloadDocument: (documentId) => ({ method: "GET", path: `/api/v1/documents/${encodeURIComponent(documentId)}/download` }),
  deleteDocument: (documentId) => ({ method: "DELETE", path: `/api/v1/documents/${encodeURIComponent(documentId)}` }),
};

// Response readers: map whatever Documenso answers to the small shapes the rest
// of Roster uses. They accept the v1 names plus a couple of likely variants.
export const readers = {
  // POST /documents -> { uploadUrl, documentId, recipients:[{ recipientId, signingUrl, ... }] }
  created(json) {
    const documentId = json?.documentId ?? json?.id;
    const recipients = Array.isArray(json?.recipients)
      ? json.recipients.map((r) => ({
          recipientId: r.recipientId ?? r.id,
          email: r.email,
          signingUrl: r.signingUrl || null,
        }))
      : [];
    return { documentId, uploadUrl: json?.uploadUrl, recipients };
  },
  // GET /documents/{id} -> { id, status: DRAFT|PENDING|COMPLETED|REJECTED, recipients:[{ readStatus, signingStatus, signedAt }], completedAt }
  document(json) {
    const status = String(json?.status || "").toUpperCase();
    const recipients = Array.isArray(json?.recipients) ? json.recipients : [];
    const anyRejected = recipients.some((r) => String(r.signingStatus || "").toUpperCase() === "REJECTED");
    const allSigned = recipients.length > 0 && recipients.every((r) => String(r.signingStatus || "").toUpperCase() === "SIGNED");
    const anyOpened = recipients.some((r) => String(r.readStatus || "").toUpperCase() === "OPENED" || String(r.signingStatus || "").toUpperCase() === "SIGNED");
    const signedDates = recipients.map((r) => r.signedAt).filter(Boolean).sort();
    let state = "sent";
    if (status === "COMPLETED" || (allSigned && status !== "REJECTED")) state = "signed";
    else if (status === "REJECTED" || anyRejected) state = "declined";
    else if (anyOpened) state = "viewed";
    return {
      documentStatus: status || null,
      state,
      signedAt: json?.completedAt || signedDates[signedDates.length - 1] || null,
    };
  },
  // GET /documents/{id}/download -> { downloadUrl }
  download(json) {
    return json?.downloadUrl || json?.url || null;
  },
};

// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export class DocumensoError extends Error {
  constructor(message, { status = null, step = null, documentId = null } = {}) {
    super(message);
    this.name = "DocumensoError";
    this.status = status;
    this.step = step;
    this.documentId = documentId;
  }
}

export function baseUrl() {
  return String(process.env.DOCUMENSO_URL || "").trim().replace(/\/+$/, "");
}
function token() {
  return String(process.env.DOCUMENSO_API_TOKEN || "").trim();
}
export function isConfigured() {
  return !!baseUrl() && !!token();
}
export const NOT_CONFIGURED_MESSAGE = "E-signature is not connected yet — ask the admin to set it up (DOCUMENSO_URL and DOCUMENSO_API_TOKEN).";

function requireConfigured() {
  if (!isConfigured()) throw new DocumensoError(NOT_CONFIGURED_MESSAGE, { step: "config" });
}

// Strips the token from any text that could end up in an error or a log.
function scrub(text) {
  const t = token();
  let out = String(text ?? "");
  if (t) out = out.split(t).join("***");
  return out;
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === new URL(baseUrl()).origin;
  } catch {
    return false;
  }
}

async function readErrorBody(res) {
  try {
    const text = (await res.text()).slice(0, 400);
    try {
      const j = JSON.parse(text);
      return String(j.message || j.error || j.detail || text);
    } catch {
      return text;
    }
  } catch {
    return "";
  }
}

async function doFetch(url, init, { step, timeoutMs }) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    const why = timedOut ? "timed out" : scrub(e?.cause?.code || e?.cause?.message || e?.message || "network error");
    throw new DocumensoError(`Could not reach the e-signature service (${step}: ${why}).`, { step });
  }
}

// JSON call against the Documenso API.
async function api({ method, path, body }, { step, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  requireConfigured();
  const headers = { [AUTH_HEADER_NAME]: authHeaderValue(token()), Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await doFetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, { step, timeoutMs });
  if (!res.ok) {
    const detail = scrub(await readErrorBody(res));
    let msg;
    if (res.status === 401 || res.status === 403) msg = "The e-signature service rejected our credentials (check DOCUMENSO_API_TOKEN).";
    else if (res.status === 404) msg = "The e-signature service could not find that document or endpoint.";
    else msg = `The e-signature service returned an error (${step}, HTTP ${res.status}).`;
    throw new DocumensoError(detail ? `${msg} ${detail}` : msg, { status: res.status, step });
  }
  if (res.status === 204) return {};
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new DocumensoError(`The e-signature service sent an unreadable answer (${step}).`, { status: res.status, step });
  }
}

// ---------------------------------------------------------------------------
// Signature / date field placement. Boxes are given in PDF points with the
// pdf-lib origin (bottom-left) and converted to Documenso's top-left percents.

export function boxToPercent(box, pageWidth, pageHeight) {
  const pct = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v) => Math.min(100, Math.max(0, v));
  return {
    pageX: pct(clamp((box.x / pageWidth) * 100)),
    pageY: pct(clamp(((pageHeight - (box.y + box.height)) / pageHeight) * 100)),
    pageWidth: pct(clamp((box.width / pageWidth) * 100)),
    pageHeight: pct(clamp((box.height / pageHeight) * 100)),
  };
}

// Default placement when the PDF does not tell us where to sign: the bottom of
// the chosen page (the last one by default), signature on the left, date on the
// right. Sizes are fractions of the page so any page size works.
export function defaultFieldBoxes(pageWidth, pageHeight) {
  const h = Math.min(pageHeight * 0.06, 48);
  const bottom = pageHeight * 0.1;
  return {
    signature: { x: pageWidth * 0.08, y: bottom, width: pageWidth * 0.4, height: h },
    date: { x: pageWidth * 0.56, y: bottom, width: pageWidth * 0.3, height: Math.min(h, 28) },
  };
}

async function pdfPagesInfo(pdfBuffer) {
  const { PDFDocument } = await import("pdf-lib");
  let pdf;
  try {
    pdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch {
    throw new DocumensoError("That file is not a readable PDF.", { step: "pdf" });
  }
  const pages = pdf.getPages().map((p) => p.getSize());
  if (!pages.length) throw new DocumensoError("That PDF has no pages.", { step: "pdf" });
  return pages;
}

/**
 * Creates the document in Documenso, uploads the PDF, adds a signature (and a
 * date) field for the signer and sends it by email.
 *
 * @param {object} p
 * @param {string} p.title
 * @param {Buffer|Uint8Array} p.pdfBuffer
 * @param {{name:string,email:string}} p.signer
 * @param {string} [p.subject]
 * @param {string} [p.message]
 * @param {{page?:number, signature?:object, date?:object}} [p.placement]
 *        page: 1-based page to sign on (default: last). signature/date: boxes
 *        in PDF points (bottom-left origin) {x,y,width,height} overriding the
 *        default; date: null means "no date field".
 * @returns {Promise<{documentId:string,status:string,signingUrl:string|null}>}
 */
export async function createAndSend({ title, pdfBuffer, signer, subject, message, placement = {} }) {
  requireConfigured();
  if (!pdfBuffer || !pdfBuffer.length) throw new DocumensoError("There is no PDF to send.", { step: "pdf" });
  if (!signer?.email || !signer?.name) throw new DocumensoError("The signer needs a name and an email.", { step: "input" });
  const bytes = Buffer.from(pdfBuffer);

  const pages = await pdfPagesInfo(bytes);
  const pageIndex = Math.min(pages.length, Math.max(1, Math.floor(Number(placement.page)) || pages.length)) - 1;
  const { width: pw, height: ph } = pages[pageIndex];
  const defaults = defaultFieldBoxes(pw, ph);
  const sigBox = placement.signature || defaults.signature;
  const dateBox = placement.date === null ? null : placement.date || defaults.date; // null = no date field

  // 1) create the document + recipient
  const created = readers.created(await api(ENDPOINTS.createDocument({
    title,
    recipients: [{ name: signer.name, email: signer.email, role: "SIGNER" }],
    meta: {
      subject: subject || title,
      message: message || "",
      timezone: process.env.DOCUMENSO_TIMEZONE || "America/New_York",
      dateFormat: "MM/dd/yyyy hh:mm a",
    },
  }), { step: "create" }));
  if (created.documentId == null || !created.uploadUrl) {
    throw new DocumensoError("The e-signature service did not return a document id and upload address.", { step: "create" });
  }
  const documentId = String(created.documentId);
  const recipient = created.recipients.find((r) => r.email?.toLowerCase() === signer.email.toLowerCase()) || created.recipients[0];
  if (!recipient || recipient.recipientId == null) {
    await bestEffortDelete(documentId);
    throw new DocumensoError("The e-signature service did not return the signer.", { step: "create", documentId });
  }

  try {
    // 2) upload the PDF to the pre-signed address
    const uploadHeaders = { "Content-Type": "application/octet-stream" };
    // A pre-signed storage URL (S3 etc.) must not receive our token; only an
    // upload address on the Documenso host itself gets it.
    if (sameOrigin(created.uploadUrl)) uploadHeaders[AUTH_HEADER_NAME] = authHeaderValue(token());
    const up = await doFetch(created.uploadUrl, { method: "PUT", headers: uploadHeaders, body: bytes }, { step: "upload", timeoutMs: UPLOAD_TIMEOUT_MS });
    if (!up.ok) {
      const detail = scrub(await readErrorBody(up));
      throw new DocumensoError(`The PDF upload was refused (HTTP ${up.status}).${detail ? ` ${detail}` : ""}`, { status: up.status, step: "upload" });
    }

    // 3) fields
    const base = { recipientId: recipient.recipientId, pageNumber: pageIndex + 1 };
    await api(ENDPOINTS.createField(documentId, { ...base, type: "SIGNATURE", ...boxToPercent(sigBox, pw, ph) }), { step: "field" });
    if (dateBox && process.env.DOCUMENSO_DATE_FIELD !== "0") {
      await api(ENDPOINTS.createField(documentId, { ...base, type: "DATE", ...boxToPercent(dateBox, pw, ph) }), { step: "field" });
    }

    // 4) send
    await api(ENDPOINTS.sendDocument(documentId, { sendEmail: true }), { step: "send" });
  } catch (e) {
    await bestEffortDelete(documentId);
    if (e instanceof DocumensoError) e.documentId = documentId;
    throw e;
  }
  return { documentId, status: "PENDING", signingUrl: recipient.signingUrl };
}

// Leaves no half-built draft behind in Documenso when a later step failed.
async function bestEffortDelete(documentId) {
  try {
    await api(ENDPOINTS.deleteDocument(documentId), { step: "cleanup", timeoutMs: 10_000 });
  } catch {
    /* nothing more we can do */
  }
}

/** @returns {Promise<{documentStatus:string|null,state:'sent'|'viewed'|'signed'|'declined',signedAt:string|null}>} */
export async function getStatus(documentId) {
  return readers.document(await api(ENDPOINTS.getDocument(documentId), { step: "status" }));
}

/** Downloads the completed (signed) PDF. @returns {Promise<Buffer>} */
export async function downloadSigned(documentId) {
  const json = await api(ENDPOINTS.downloadDocument(documentId), { step: "download" });
  const dl = readers.download(json);
  if (!dl) throw new DocumensoError("The e-signature service did not provide a download address (is the document completed?).", { step: "download" });
  const url = /^https?:\/\//i.test(dl) ? dl : `${baseUrl()}${dl.startsWith("/") ? "" : "/"}${dl}`;
  const headers = sameOrigin(url) ? { [AUTH_HEADER_NAME]: authHeaderValue(token()) } : {};
  const res = await doFetch(url, { method: "GET", headers }, { step: "download", timeoutMs: UPLOAD_TIMEOUT_MS });
  if (!res.ok) throw new DocumensoError(`Could not download the signed PDF (HTTP ${res.status}).`, { status: res.status, step: "download" });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new DocumensoError("The downloaded signed file is not a PDF.", { step: "download" });
  }
  return buf;
}
