// /api/auth/* (public: login, forgot, reset) plus the authenticated account
// endpoints (me, change-password) and owner-only staff management.
import * as billing from './billing.js';
import crypto from 'node:crypto';
import { get, all, run } from './db.js';
import {
  MIN_PASSWORD_LENGTH, EMAIL_RE, normalizeEmail, hashPassword, verifyPassword, signToken, publicAccount,
  accountByEmail, requireOwner, makeLimiter,
} from './auth.js';
import { sendPasswordResetEmail, isMailConfigured } from './mailer.js';

const WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_MAX = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);

// Failed logins: LOGIN_MAX per ip+email, and a looser cap per ip so one
// address cannot spray many emails.
const loginByPair = makeLimiter({ windowMs: WINDOW_MS, max: LOGIN_MAX });
const loginByIp = makeLimiter({ windowMs: WINDOW_MS, max: LOGIN_MAX * 6 });
// Reset requests: counted whether or not the email exists.
const forgotByPair = makeLimiter({ windowMs: WINDOW_MS, max: 5 });
const forgotByIp = makeLimiter({ windowMs: WINDOW_MS, max: 20 });

const GENERIC_FORGOT = "If that email exists, we've sent a password reset link to it.";

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function tooMany(res, seconds) {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({
    error: 'Too many attempts. Please wait a few minutes and try again.',
    code: 'too_many_attempts',
    retryAfter: seconds,
  });
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function publicAuthRoutes(app, ar) {
  app.post('/api/auth/login', ar(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const remember = req.body?.remember !== false;
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const ip = clientIp(req);
    const pairKey = `${ip}|${email}`;
    const wait = Math.max(loginByPair.blockedFor(pairKey), loginByIp.blockedFor(ip));
    if (wait) return tooMany(res, wait);

    const account = await accountByEmail(email);
    const ok = await verifyPassword(password, account?.password_hash);
    if (!account || !ok) {
      loginByPair.hit(pairKey);
      loginByIp.hit(ip);
      return res.status(401).json({ error: 'Invalid email or password', code: 'invalid_credentials' });
    }
    loginByPair.reset(pairKey);
    res.json({ token: signToken(account, remember), account: publicAccount(account) });
  }));

  // Same response whether or not the account exists, so this cannot be used
  // to discover which emails are registered.
  const forgot = ar(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const base = { ok: true, message: GENERIC_FORGOT, emailConfigured: isMailConfigured() };
    if (!email) return res.json(base);
    const ip = clientIp(req);
    const pairKey = `${ip}|${email}`;
    const wait = Math.max(forgotByPair.blockedFor(pairKey), forgotByIp.blockedFor(ip));
    if (wait) return tooMany(res, wait);
    forgotByPair.hit(pairKey);
    forgotByIp.hit(ip);

    const account = await accountByEmail(email);
    if (account) {
      const token = crypto.randomBytes(32).toString('hex');
      // Only the hash is stored, so a database leak does not leak live links.
      await run(
        `UPDATE accounts SET reset_token_hash = $1, reset_token_expires = now() + interval '1 hour' WHERE id = $2`,
        [sha256(token), account.id]
      );
      const origin = process.env.FRONTEND_URL
        || req.get('origin')
        || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${origin.replace(/\/+$/, '')}/#/reset-password?token=${token}`;
      try {
        await sendPasswordResetEmail(account.email, resetUrl);
      } catch (err) {
        console.error('Failed to send password reset email:', err.message);
      }
    }
    res.json(base);
  });
  app.post('/api/auth/forgot', forgot);
  app.post('/api/auth/forgot-password', forgot);

  const reset = ar(async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `A valid link and a password (min. ${MIN_PASSWORD_LENGTH} characters) are required`, code: 'weak_password' });
    }
    // Single use: the UPDATE only matches an unexpired token and clears it.
    const r = await run(
      `UPDATE accounts SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL,
         must_change_password = FALSE, token_version = token_version + 1
       WHERE reset_token_hash = $2 AND reset_token_expires > now() RETURNING id`,
      [hashPassword(password), sha256(token)]
    );
    if (!r.rowCount) return res.status(400).json({ error: 'This link is invalid or has expired. Request a new one.', code: 'invalid_reset_link' });
    res.json({ ok: true });
  });
  app.post('/api/auth/reset', reset);
  app.post('/api/auth/reset-password', reset);
}

export function accountRoutes(app, ar) {
  app.get('/api/auth/me', ar(async (req, res) => {
    res.json({ account: publicAccount(req.account) });
  }));

  app.post('/api/auth/change-password', ar(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: 'weak_password' });
    }
    if (!(await verifyPassword(currentPassword, req.account.password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect', code: 'wrong_current_password' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must be different from the current one', code: 'same_password' });
    }
    const updated = (await run(
      `UPDATE accounts SET password_hash = $1, must_change_password = FALSE, token_version = token_version + 1,
         reset_token_hash = NULL, reset_token_expires = NULL
       WHERE id = $2 RETURNING *`,
      [hashPassword(newPassword), req.account.id]
    )).rows[0];
    // Fresh token so this device stays signed in; every other device is out.
    res.json({ ok: true, token: signToken(updated, true), account: publicAccount(updated) });
  }));

  // ---------- staff accounts (owner only) ----------
  app.get('/api/accounts', requireOwner, ar(async (req, res) => {
    const rows = await all(`SELECT * FROM accounts ORDER BY role DESC, lower(name)`);
    res.json(rows.map(publicAccount));
  }));

  app.post('/api/accounts', requireOwner, ar(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!name || !email || typeof password !== 'string') {
      return res.status(400).json({ error: 'Name, email and a temporary password are required' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address', code: 'invalid_email' });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: 'weak_password' });
    }
    // Limite de logins do plano (o dono conta como 1).
    const limit = await billing.userLimit();
    const { n: have } = await get(`SELECT COUNT(*)::int AS n FROM accounts`);
    if (have >= limit) {
      return res.status(402).json({ error: `Your plan allows up to ${limit} staff logins. Upgrade your plan to add more.`, code: 'user_limit', userLimit: limit });
    }
    const r = await run(
      `INSERT INTO accounts (name, email, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, 'staff', TRUE) ON CONFLICT DO NOTHING RETURNING *`,
      [name, email, hashPassword(password)]
    );
    if (!r.rowCount) return res.status(409).json({ error: 'That email is already in use', code: 'email_in_use' });
    res.status(201).json(publicAccount(r.rows[0]));
  }));

  app.post('/api/accounts/:id/reset-password', requireOwner, ar(async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const target = await get(`SELECT * FROM accounts WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!target) return res.status(404).json({ error: 'Account not found' });
    if (target.role === 'owner' && target.id !== req.account.id) {
      return res.status(403).json({ error: 'Owner passwords can only be changed by the owner themselves' });
    }
    await run(
      `UPDATE accounts SET password_hash = $1, must_change_password = $2, token_version = token_version + 1 WHERE id = $3`,
      [hashPassword(password), target.id !== req.account.id, target.id]
    );
    res.json({ ok: true });
  }));

  app.delete('/api/accounts/:id', requireOwner, ar(async (req, res) => {
    const target = await get(`SELECT * FROM accounts WHERE id = $1`, [Number(req.params.id) || 0]);
    if (!target) return res.status(404).json({ error: 'Account not found' });
    if (target.id === req.account.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Owner accounts cannot be deleted here' });
    await run(`DELETE FROM accounts WHERE id = $1`, [target.id]);
    res.status(204).end();
  }));
}
