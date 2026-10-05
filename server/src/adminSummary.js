// GET /api/admin-summary — read by Harbor (Impact Digital's admin CRM) with the shared key in X-Admin-Key.
// Same JSON contract as the other products: { subscribers: [...], billingEnabled }.
// This app is a single-company installation with no customer subscriptions of its own, so the list
// is empty; `accounts` is just the number of staff logins on this installation.
// 503 when ADMIN_SUMMARY_KEY is not set, 401 on a wrong key (constant-time comparison).
import crypto from 'node:crypto';

const digest = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
export const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

export function mountAdminSummary(app, ar, get) {
  app.get('/api/admin-summary', ar(async (req, res) => {
    const adminKey = process.env.ADMIN_SUMMARY_KEY;
    if (!adminKey) return res.status(503).json({ error: 'ADMIN_SUMMARY_KEY is not configured on this server.' });
    if (!safeEqual(req.headers['x-admin-key'], adminKey)) return res.status(401).json({ error: 'Not authorized.' });
    const row = await get('SELECT COUNT(*) AS n FROM accounts');
    res.json({ subscribers: [], billingEnabled: false, accounts: Number(row?.n) || 0 });
  }));
}
