import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mountAdminSummary } from '../src/adminSummary.js';

const KEY = 'k'.repeat(40);
const ar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const app = express();
mountAdminSummary(app, ar, async () => ({ n: '3' }));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = (headers = {}) => fetch(`${base}/api/admin-summary`, { headers });
test.after(() => server.close());

test('admin-summary: 503 without key configured, 401 wrong/missing key, 200 with the right one', async () => {
  delete process.env.ADMIN_SUMMARY_KEY;
  assert.equal((await call({ 'x-admin-key': KEY })).status, 503);
  process.env.ADMIN_SUMMARY_KEY = KEY;
  assert.equal((await call()).status, 401);
  assert.equal((await call({ 'x-admin-key': 'nope' })).status, 401);
  assert.equal((await call({ 'x-admin-key': KEY + 'x' })).status, 401);
  const ok = await call({ 'x-admin-key': KEY });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { subscribers: [], billingEnabled: false, accounts: 3 });
});
