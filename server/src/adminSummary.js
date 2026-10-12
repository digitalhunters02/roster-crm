// GET /api/admin-summary — read by Harbor (Impact Digital's admin CRM) with the shared key in X-Admin-Key.
// Same JSON contract as the other products: { subscribers: [...], billingEnabled }.
// Single-company installation: at most one subscriber (the Stripe subscription of this install, read live from Stripe);
// `accounts` is the number of staff logins (free-trial logins not counted).
// 503 when ADMIN_SUMMARY_KEY is not set, 401 on a wrong key (constant-time comparison).
import crypto from 'node:crypto';

const digest = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
export const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

export function mountAdminSummary(app, ar, get, getAdminSummary = async () => ({ subscribers: [], billingEnabled: false })) {
  app.get('/api/admin-summary', ar(async (req, res) => {
    const adminKey = process.env.ADMIN_SUMMARY_KEY;
    if (!adminKey) return res.status(503).json({ error: 'ADMIN_SUMMARY_KEY is not configured on this server.' });
    if (!safeEqual(req.headers['x-admin-key'], adminKey)) return res.status(401).json({ error: 'Not authorized.' });
    const row = await get('SELECT COUNT(*) AS n FROM accounts WHERE is_demo_trial = FALSE');
    const summary = await getAdminSummary();
    res.json({ ...summary, accounts: Number(row?.n) || 0 });
  }));
}
