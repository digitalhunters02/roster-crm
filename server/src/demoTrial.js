// Ends the 3-day free trials: deletes trial logins whose time is up. A trial login owns no durable data
// (it only works on the shared sample data), so removing the account row is enough.
import { all, run } from './db.js';

export async function cleanupExpiredDemoTrials() {
  const expired = await all(`SELECT id FROM accounts WHERE is_demo_trial = TRUE AND demo_expires_at < now()`);
  for (const row of expired) {
    try { await run(`DELETE FROM accounts WHERE id = $1`, [row.id]); }
    catch (err) { console.error('Demo trial cleanup: error removing account', row.id, err.message); }
  }
  return expired.length;
}

export function startDemoTrialScheduler() {
  setTimeout(() => cleanupExpiredDemoTrials().catch((e) => console.error('Demo trial cleanup failed:', e)), 15000).unref();
  setInterval(() => cleanupExpiredDemoTrials().catch((e) => console.error('Demo trial cleanup failed:', e)), 60 * 60 * 1000).unref();
}
