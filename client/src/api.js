import { authHeaders, handleUnauthorized } from './auth/session.js';
import { planCardStr } from './plans/planCardStrings.js';
import { currentLang } from './auth/i18n.js';

// In local dev, "/api" is proxied to the local server (see vite.config.js).
// In production there's no such proxy, so VITE_API_URL must point at the
// deployed backend's base URL (e.g. https://roster-crm-api.onrender.com).
// Exported so Settings can show the exact webhook URL to paste into Meta's console.
export const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

async function handle(r) {
  // A rejected session (expired, password changed elsewhere) signs the user out.
  if (r.status === 401) handleUnauthorized();
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    // Prévia do dono ("Ver como plano"): a recusa de cobrança/IA/WhatsApp/novo login vem com este código; o texto sai no idioma da tela.
    const err = new Error(data && data.code === 'preview_readonly' ? planCardStr(currentLang()).blocked : (data && data.error) || `Request failed (${r.status})`);
    err.status = r.status;
    err.body = data;
    throw err;
  }
  return data;
}

function get(path) {
  return fetch(BASE + path, { headers: authHeaders() }).then(handle);
}

function post(path, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  }).then(handle);
}

function put(path, body) {
  return fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  }).then(handle);
}

function patch(path, body) {
  return fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  }).then(handle);
}

function del(path) {
  return fetch(BASE + path, { method: 'DELETE', headers: authHeaders() }).then(handle);
}

// Public calls of the client portal (no login: the private link is the key). A 401 here must not sign anyone out.
async function portalHandle(r) {
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${r.status})`), { status: r.status, code: data?.code });
  return data;
}
const portalGet = (path) => fetch(`${BASE}/portal/${path}`).then(portalHandle);
const portalPost = (path, body) => fetch(`${BASE}/portal/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(portalHandle);
export const portalApi = {
  load: (token) => portalGet(encodeURIComponent(token)),
  feedback: (token, body) => portalPost(`${encodeURIComponent(token)}/feedback`, body),
  approve: (token, id, body) => portalPost(`${encodeURIComponent(token)}/timesheets/${id}/approve`, body),
  dispute: (token, id, body) => portalPost(`${encodeURIComponent(token)}/timesheets/${id}/dispute`, body),
  invoice: (token, id) => portalGet(`${encodeURIComponent(token)}/invoices/${id}`),
};

// Downloads a file from an authenticated GET (CSV export) as a Blob.
export async function downloadAuthed(path, filename) {
  const r = await fetch(BASE + path, { headers: authHeaders() });
  if (r.status === 401) handleUnauthorized();
  if (!r.ok) { const d = await r.json().catch(() => null); throw Object.assign(new Error(d?.error || `Request failed (${r.status})`), { status: r.status, code: d?.code }); }
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function upload(path, form) {
  const r = await fetch(BASE + path, { method: 'POST', headers: authHeaders(), body: form });
  return handle(r);
}

export const api = {
  // ---- Etapa 3: plano Completo ----
  aiStatus: () => get('/ai/status'),
  aiCandidateSummary: (body) => post('/ai/candidate-summary', body),
  aiJobDescription: (body) => post('/ai/job-description', body),
  jobSuggestions: (id) => get(`/jobs/${id}/suggestions`),
  documentMeta: () => get('/documents/meta'),
  candidateDocuments: (id) => get(`/candidates/${id}/documents`),
  createDocument: (id, body) => post(`/candidates/${id}/documents`, body),
  updateDocument: (id, body) => put(`/documents/${id}`, body),
  deleteDocument: (id) => del(`/documents/${id}`),
  signatureStatus: () => get('/signatures/status'),
  signatures: (kind, id) => get(`/signatures?kind=${kind}&related_id=${id}`),
  signatureDefaults: (kind, id) => get(`/signatures/defaults?kind=${kind}&related_id=${id}`),
  sendSignature: (form) => upload('/signatures', form),
  refreshSignature: (id) => post(`/signatures/${id}/refresh`, {}),
  deleteSignature: (id) => del(`/signatures/${id}`),
  offices: () => get('/offices'),
  connectorStatus: () => get('/connector/status'),
  connectorPair: (body) => post('/connector/pair', body),
  connectorSave: (body) => put('/connector/settings', body),
  connectorResync: (existing) => post('/connector/resync', { existing: !!existing }),
  connectorRemove: () => del('/connector'),
  createOffice: (body) => post('/offices', body),
  updateOffice: (id, body) => put(`/offices/${id}`, body),
  deleteOffice: (id) => del(`/offices/${id}`),
  setUserOffice: (id, office_id) => put(`/users/${id}/office`, { office_id }),
  apiKeys: () => get('/api-keys'),
  createApiKey: (name) => post('/api-keys', { name }),
  deleteApiKey: (id) => del(`/api-keys/${id}`),
  webhooks: () => get('/webhooks'),
  webhookEvents: () => get('/webhooks/events'),
  createWebhook: (body) => post('/webhooks', body),
  setWebhookActive: (id, active) => patch(`/webhooks/${id}`, { active }),
  deleteWebhook: (id) => del(`/webhooks/${id}`),
  testWebhook: (id) => post(`/webhooks/${id}/test`, {}),
  webhookDeliveries: (id) => get(`/webhooks/${id}/deliveries`),
  // ---- Etapa 2: portal do cliente, fatura, mensagens ----
  clientPortal: (id) => get(`/clients/${id}/portal`),
  clientPortalAction: (id, action) => post(`/clients/${id}/portal/${action}`, {}),
  timesheetInvoice: (id) => get(`/timesheets/${id}/invoice`),
  sendInvoice: (id) => post(`/timesheets/${id}/send-invoice`, {}),
  messageTemplates: () => get('/message-templates'),
  createMessageTemplate: (body) => post('/message-templates', body),
  deleteMessageTemplate: (id) => del(`/message-templates/${id}`),
  candidateMessages: (id) => get(`/candidates/${id}/messages`),
  previewMessage: (id, body) => post(`/candidates/${id}/messages/preview`, body),
  sendMessage: (id, body) => post(`/candidates/${id}/messages`, body),
  smsStatus: () => get('/integrations/sms/status'),
  smsConnect: (body) => post('/integrations/sms/connect', body),
  smsDisconnect: () => post('/integrations/sms/disconnect', {}),

  // ---- Importar de foto (a IA lê a imagem; nada é guardado no servidor) ----
  photoApi: {
    status: () => get('/photo-import/status'),
    setCredit: (body) => put('/photo-import/credit', body),
    read: async (file, kind, lang) => {
      const form = new FormData();
      form.append('kind', kind); form.append('lang', lang); form.append('file', file, file.name || 'photo.jpg');
      const res = await fetch(`${BASE}/photo-import`, { method: 'POST', headers: authHeaders(), body: form });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) handleUnauthorized();
      if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { code: data.code, status: res.status });
      return data;
    },
  },
  // ---- Planos, cobranca, perfil da agencia ----
  billingStatus: () => get('/billing/status'),
  billingCheckout: (plan, interval) => post('/billing/checkout', { plan, interval }),
  billingPortal: () => post('/billing/portal', {}),
  companyProfile: () => get('/company-profile'),
  saveCompanyProfile: (body) => put('/company-profile', body),
  parseResume: (text) => post('/candidates/parse-resume', { text }),
  automationCatalog: () => get('/automations/catalog'),
  runAutomationsNow: () => post('/automations/run-now', {}),
  dashboard: () => get('/dashboard'),
  reports: () => get('/reports'),

  users: () => get('/users'),

  clients: () => get('/clients'),
  createClient: (body) => post('/clients', body),
  updateClient: (id, body) => put(`/clients/${id}`, body),
  deleteClient: (id) => del(`/clients/${id}`),

  jobs: () => get('/jobs'),
  createJob: (body) => post('/jobs', body),
  updateJob: (id, body) => put(`/jobs/${id}`, body),
  deleteJob: (id) => del(`/jobs/${id}`),

  candidates: () => get('/candidates'),
  createCandidate: (body) => post('/candidates', body),
  updateCandidate: (id, body) => put(`/candidates/${id}`, body),
  deleteCandidate: (id) => del(`/candidates/${id}`),

  submissions: () => get('/submissions'),
  createSubmission: (body) => post('/submissions', body),
  updateSubmission: (id, body) => put(`/submissions/${id}`, body),
  setSubmissionStage: (id, stage) => patch(`/submissions/${id}/stage`, { stage }),
  deleteSubmission: (id) => del(`/submissions/${id}`),

  interviews: () => get('/interviews'),
  createInterview: (body) => post('/interviews', body),
  updateInterview: (id, body) => put(`/interviews/${id}`, body),
  deleteInterview: (id) => del(`/interviews/${id}`),

  placements: () => get('/placements'),
  createPlacement: (body) => post('/placements', body),
  updatePlacement: (id, body) => put(`/placements/${id}`, body),
  deletePlacement: (id) => del(`/placements/${id}`),

  timesheets: () => get('/timesheets'),
  createTimesheet: (body) => post('/timesheets', body),
  updateTimesheet: (id, body) => put(`/timesheets/${id}`, body),
  deleteTimesheet: (id) => del(`/timesheets/${id}`),

  timesheetsMargin: (from, to) => get(`/timesheets/margin${from || to ? `?from=${from || ''}&to=${to || ''}` : ''}`),
  timesheetApprovalLink: (id) => post(`/timesheets/${id}/approval-link`, {}),

  // públicas (sem login)
  publicCareers: () => fetch(`${BASE}/public/careers`).then(handle),
  publicApply: (jobId, body) => fetch(`${BASE}/public/careers/${jobId}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(handle),
  publicApproval: (token) => fetch(`${BASE}/public/approval/${encodeURIComponent(token)}`).then(handle),
  publicDecide: (token, body) => fetch(`${BASE}/public/approval/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(handle),

  activities: () => get('/activities'),

  automations: () => get('/automations'),
  createAutomation: (body) => post('/automations', body),
  setAutomationActive: (id, active) => patch(`/automations/${id}/active`, { active }),
  deleteAutomation: (id) => del(`/automations/${id}`),

  whatsappStatus: () => get('/integrations/whatsapp/status'),
  whatsappConnect: (body) => post('/integrations/whatsapp/connect', body),
  whatsappDisconnect: () => post('/integrations/whatsapp/disconnect', {}),
  whatsappConversations: () => get('/integrations/whatsapp/conversations'),
  whatsappConversation: (phone) => get(`/integrations/whatsapp/conversations/${encodeURIComponent(phone)}`),
  whatsappSend: (to, text) => post('/integrations/whatsapp/send', { to, text }),
};

export default api;
