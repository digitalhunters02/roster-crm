// Agency profile (name, contact, logo, payment details for invoices): one per installation, stored in app_meta.
import { get } from './db.js';

export const PROFILE_FIELDS = ['name', 'address', 'phone', 'email', 'description', 'payment_url', 'payment_note'];
const LONG = { description: 600, payment_note: 400, payment_url: 500 };
export const profileLimit = (f) => LONG[f] || 200;

export async function readProfile() {
  const row = await get(`SELECT value FROM app_meta WHERE key = 'company_profile'`);
  let p = {}; try { p = row ? JSON.parse(row.value) : {}; } catch { /* corrupted: start over */ }
  return { name: '', address: '', phone: '', email: '', description: '', logo: '', payment_url: '', payment_note: '', ...p };
}

// Only plain http(s) links can become the "Pay online" button (no javascript:, no data:).
export const isHttpUrl = (s) => { try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
