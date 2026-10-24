import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ORIGIN } from './helpers.js';

let ctx;
before(async () => {
  ctx = await setup();
});
after(() => ctx.teardown());

describe('step 2: auth', () => {
  it('has no register endpoint', async () => {
    const res = await ctx.request.post('/api/auth/register').send({ email: 'a@b.c', password: 'x' });
    assert.equal(res.status, 404);
  });

  it('GET /me is 401 without a cookie, and admin routes are protected', async () => {
    assert.equal((await ctx.request.get('/api/auth/me')).status, 401);
    assert.equal((await ctx.request.get('/api/admin/case-studies')).status, 401);
  });

  it('login sets an httpOnly lax cookie (dev/test) and /me works; logout clears it', async () => {
    const agent = await ctx.loginAgent();
    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, { admin: { email: ADMIN_EMAIL } });

    const login = await ctx.request.post('/api/auth/login').send({ email: ADMIN_EMAIL.toUpperCase(), password: ADMIN_PASSWORD });
    const cookie = login.headers['set-cookie'][0];
    assert.match(cookie, /^bdgy_admin=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Secure/);

    const logout = await agent.post('/api/auth/logout');
    assert.equal(logout.status, 200);
    assert.match(logout.headers['set-cookie'][0], /bdgy_admin=;/);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });

  it('rejects a tampered token', async () => {
    const res = await ctx.request.get('/api/auth/me').set('Cookie', 'bdgy_admin=eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.');
    assert.equal(res.status, 401);
  });

  it('rejects state-changing requests from a foreign Origin', async () => {
    const res = await ctx.request.post('/api/auth/logout').set('Origin', 'https://evil.example');
    assert.equal(res.status, 403);
    const ok = await ctx.request.post('/api/auth/logout').set('Origin', ADMIN_ORIGIN);
    assert.equal(ok.status, 200);
  });

  it('returns the same generic error for wrong email and wrong password, then rate-limits at 5/15min', async () => {
    // loginAgent + the case-insensitive login above already used 2 attempts on this IP.
    const wrongEmail = await ctx.request.post('/api/auth/login').send({ email: 'x@y.z', password: ADMIN_PASSWORD });
    const wrongPass = await ctx.request.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'nope' });
    assert.equal(wrongEmail.status, 401);
    assert.equal(wrongPass.status, 401);
    assert.deepEqual(wrongEmail.body, wrongPass.body);

    const fifth = await ctx.request.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'nope' });
    assert.equal(fifth.status, 401);
    const sixth = await ctx.request.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error.code, 'RATE_LIMITED');
  });
});
