import { BASE } from '../api.js';
import { authHeaders } from './session.js';

export class AuthError extends Error {
  constructor(message, { status = 0, code = null, retryAfter = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthError('Network error', { code: 'network' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new AuthError((data && data.error) || `Request failed (${res.status})`, {
      status: res.status, code: data?.code || null, retryAfter: data?.retryAfter || null,
    });
  }
  return data;
}

export const authApi = {
  login: (email, password, remember) => request('POST', '/auth/login', { email, password, remember }),
  forgot: (email) => request('POST', '/auth/forgot', { email }),
  reset: (token, password) => request('POST', '/auth/reset', { token, password }),
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) => request('POST', '/auth/change-password', { currentPassword, newPassword }),
  accounts: () => request('GET', '/accounts'),
  createAccount: (body) => request('POST', '/accounts', body),
  setAccountPassword: (id, password) => request('POST', `/accounts/${id}/reset-password`, { password }),
  deleteAccount: (id) => request('DELETE', `/accounts/${id}`),
};
