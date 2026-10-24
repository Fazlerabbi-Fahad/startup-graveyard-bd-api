// Each test file runs in its own process, so NODE_ENV=production here does not leak into other files.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers.js';

let ctx;
before(async () => {
  ctx = await setup();
  process.env.NODE_ENV = 'production';
  // config was already loaded as "test" by setup(); flip the derived flags the way a prod boot would set them.
  const { config } = await import('../src/config/env.js');
  Object.assign(config, { NODE_ENV: 'production', isProd: true, isTest: false });
});
after(() => ctx.teardown());

describe('production behaviour', () => {
  it('auth cookie is Secure + SameSite=None', async () => {
    const res = await ctx.request.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=None/);
  });

  it('unexpected errors return a generic message with no stack trace', async () => {
    const { errorHandler } = await import('../src/middleware/errorHandler.js');
    let status;
    let body;
    const res = { status: (s) => ((status = s), res), json: (b) => (body = b) };
    errorHandler(new Error('db password is hunter2'), { method: 'GET', originalUrl: '/x' }, res, () => {});
    assert.equal(status, 500);
    assert.deepEqual(body, { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
  });
});
