import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pg returns BIGINT (e.g. COUNT(*)) as strings by default, since it can
// exceed Number.MAX_SAFE_INTEGER — but this app's counts never get remotely
// that large, and the SQLite driver it's migrated from always returned
// plain numbers, so callers do arithmetic on these results directly
// (e.g. `wonX + lostY`) without expecting string concatenation.
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required — set it to your Postgres connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
}

// Mirrors better-sqlite3's flexible .get()/.all()/.run() call signatures
// (variadic positional args, a single array, a single named object, or a
// single scalar) so the many call sites written against that API only need
// "await" added, not a full rewrite of every argument list.
function normalizeArgs(args) {
  if (args.length === 0) return undefined;
  if (args.length === 1) return args[0];
  return args;
}

function toPositional(sql, params) {
  if (params === undefined) return { text: sql, values: [] };
  if (Array.isArray(params)) {
    let i = 0;
    const text = sql.replace(/\?/g, () => `$${++i}`);
    return { text, values: params };
  }
  if (typeof params === 'object' && params !== null) {
    const values = [];
    const text = sql.replace(/@(\w+)/g, (_, name) => {
      values.push(params[name]);
      return `$${values.length}`;
    });
    return { text, values };
  }
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: [params] };
}

export async function get(sql, ...args) {
  const { text, values } = toPositional(sql, normalizeArgs(args));
  const { rows } = await pool.query(text, values);
  return rows[0];
}

export async function all(sql, ...args) {
  const { text, values } = toPositional(sql, normalizeArgs(args));
  const { rows } = await pool.query(text, values);
  return rows;
}

export async function run(sql, ...args) {
  const { text, values } = toPositional(sql, normalizeArgs(args));
  const result = await pool.query(text, values);
  return { rows: result.rows, rowCount: result.rowCount };
}

export default pool;
