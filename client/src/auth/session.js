// Where the sign-in token lives. "Remember me" -> localStorage (survives
// closing the browser); otherwise sessionStorage (gone with the tab).
// Imported by api.js, so it must not import anything from the app.
import { BRAND } from './brand.jsx';

export const AUTH_EXPIRED_EVENT = 'crm-auth-expired';

function read(storage) {
  try {
    const raw = storage.getItem(BRAND.storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readSession() {
  try {
    return read(localStorage) || read(sessionStorage);
  } catch {
    return null;
  }
}

export function isRemembered() {
  try {
    return !!localStorage.getItem(BRAND.storageKey);
  } catch {
    return true;
  }
}

export function writeSession(remember, value) {
  clearSession();
  try {
    (remember ? localStorage : sessionStorage).setItem(BRAND.storageKey, JSON.stringify(value));
  } catch {
    // storage blocked: the session just lasts until the page is closed
  }
}

export function clearSession() {
  try { localStorage.removeItem(BRAND.storageKey); } catch { /* ignore */ }
  try { sessionStorage.removeItem(BRAND.storageKey); } catch { /* ignore */ }
}

export function getToken() {
  return readSession()?.token || null;
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Called by api.js when any request comes back 401 while holding a token.
export function handleUnauthorized() {
  if (!getToken()) return;
  clearSession();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
