// Authentication core: password hashing, JWT sessions, middleware, rate
// limiting and the idempotent owner bootstrap. Modelled on Harbor's auth.js
// (accounts table, bcrypt hashes, JWT bearer tokens) with a simple
// owner / staff role model.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get, all, run } from './db.js';

const IS_PROD = process.env.NODE_ENV === 'production';

// Refuse to boot in production without a real secret: a built-in fallback
// would let anyone who reads the source forge a session for any account.
if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)) {
  console.error('FATAL: JWT_SECRET must be set (at least 16 characters) when NODE_ENV=production.');
  process.exit(1);
}
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-not-for-production';

export const MIN_PASSWORD_LENGTH = 8;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

// A real-looking hash to compare against when the email is unknown, so a
// missing account costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function verifyPassword(password, hash) {
  return bcrypt.compare(String(password), hash || DUMMY_HASH);
}

export function signToken(account, remember = true) {
  return jwt.sign({ id: account.id, tv: account.token_version || 0 }, JWT_SECRET, {
    expiresIn: remember ? '30d' : '12h',
  });
}

export function publicAccount(a) {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    mustChangePassword: !!a.must_change_password,
    isDemoTrial: !!a.is_demo_trial,
    demoExpiresAt: a.demo_expires_at || null,
    userId: a.user_id || null,
    createdAt: a.created_at,
  };
}

export async function accountById(id) {
  return get(`SELECT * FROM accounts WHERE id = $1`, [id]);
}

export async function accountByEmail(email) {
  return get(`SELECT * FROM accounts WHERE lower(email) = $1`, [normalizeEmail(email)]);
}

// Gate for every /api route that is not explicitly public.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    const account = await accountById(payload.id);
    // token_version bumps on every password change/reset, which signs out
    // every other device that still holds an older token.
    if (!account || (account.token_version || 0) !== (payload.tv || 0)) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.account = account;
    next();
  } catch (e) {
    next(e);
  }
}

// Every real login is also a recruiter ("users" table) so it can own clients, jobs and candidates.
// Links the account to the recruiter with the same email (e.g. sample data) or creates a new one.
const RECRUITER_COLORS = ['#5B4EE0', '#2F6FE0', '#0E9488', '#FF6B57', '#C98A1D', '#D1477A', '#7A5AF8', '#16A34A'];
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
export async function ensureRecruiter(account) {
  if (!account || account.is_demo_trial || account.user_id) return account?.user_id || null;
  let u = await get(`SELECT id FROM users WHERE lower(email) = $1`, [normalizeEmail(account.email)]);
  if (!u) {
    const n = (await get(`SELECT COUNT(*)::int AS n FROM users`)).n;
    u = (await run(
      `INSERT INTO users (name, email, role, initials, color) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [account.name, normalizeEmail(account.email), account.role === 'owner' ? 'Owner' : 'Recruiter', initialsOf(account.name), RECRUITER_COLORS[n % RECRUITER_COLORS.length]]
    )).rows[0];
  }
  await run(`UPDATE accounts SET user_id = $1 WHERE id = $2`, [u.id, account.id]);
  account.user_id = u.id;
  return u.id;
}
export async function backfillRecruiters() {
  const rows = await all(`SELECT * FROM accounts WHERE user_id IS NULL AND is_demo_trial = FALSE`);
  for (const a of rows) await ensureRecruiter(a);
}

export function requireOwner(req, res, next) {
  if (req.account?.role !== 'owner') return res.status(403).json({ error: 'Only the account owner can do this' });
  next();
}

// A free-trial login works on the shared sample data only: no AI reads, no outgoing messages.
export function blockDemo(req, res, next) {
  if (req.account?.is_demo_trial) return res.status(403).json({ error: 'Not available in the free trial. Sign in with a real account to use this.', code: 'demo_blocked' });
  next();
}

// ---------- rate limiting (in memory, per process) ----------
export function makeLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60 * 1000);
  timer.unref();
  return {
    // seconds until allowed again, or 0 when under the limit
    blockedFor(key) {
      const v = hits.get(key);
      if (!v || v.resetAt <= Date.now()) return 0;
      return v.count >= max ? Math.ceil((v.resetAt - Date.now()) / 1000) : 0;
    },
    hit(key) {
      const now = Date.now();
      const v = hits.get(key);
      if (!v || v.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
      else v.count += 1;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

// ---------- owner bootstrap (idempotent) ----------
// Creates the owner at boot from BOOTSTRAP_OWNER_EMAIL / _PASSWORD when no
// account with that email exists. It never touches an existing account, so a
// password changed later in the app is never overwritten by the env value.
export async function bootstrapOwner() {
  const email = normalizeEmail(process.env.BOOTSTRAP_OWNER_EMAIL);
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD || '';
  if (!email || !password) {
    const n = (await get(`SELECT COUNT(*)::int AS n FROM accounts`)).n;
    if (n === 0) console.warn('No accounts exist and BOOTSTRAP_OWNER_EMAIL / BOOTSTRAP_OWNER_PASSWORD are not set: nobody can sign in.');
    return;
  }
  if (!EMAIL_RE.test(email)) {
    console.error('BOOTSTRAP_OWNER_EMAIL is not a valid email address: bootstrap skipped.');
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`BOOTSTRAP_OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters: bootstrap skipped.`);
    return;
  }
  if (await accountByEmail(email)) {
    console.log(`bootstrap owner already exists for ${email}`);
    return;
  }
  const name = (process.env.BOOTSTRAP_OWNER_NAME || '').trim() || 'Owner';
  const r = await run(
    `INSERT INTO accounts (name, email, password_hash, role) VALUES ($1, $2, $3, 'owner')
     ON CONFLICT DO NOTHING RETURNING id`,
    [name, email, hashPassword(password)]
  );
  if (r.rowCount) console.log(`bootstrap owner created for ${email}`);
}
