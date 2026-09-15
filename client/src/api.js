// In local dev, "/api" is proxied to the local server (see vite.config.js).
// In production there's no such proxy, so VITE_API_URL must point at the
// deployed backend's base URL (e.g. https://roster-crm-api.onrender.com).
const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

async function handle(r) {
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const err = new Error((data && data.error) || `Request failed (${r.status})`);
    err.status = r.status;
    err.body = data;
    throw err;
  }
  return data;
}

function get(path) {
  return fetch(BASE + path).then(handle);
}

function post(path, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle);
}

function put(path, body) {
  return fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle);
}

function patch(path, body) {
  return fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(handle);
}

function del(path) {
  return fetch(BASE + path, { method: 'DELETE' }).then(handle);
}

export const api = {
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

  activities: () => get('/activities'),

  automations: () => get('/automations'),
  createAutomation: (body) => post('/automations', body),
  setAutomationActive: (id, active) => patch(`/automations/${id}/active`, { active }),
  deleteAutomation: (id) => del(`/automations/${id}`),
};

export default api;
