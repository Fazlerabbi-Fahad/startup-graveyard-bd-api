import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ADMIN_ORIGIN } from './helpers.js';

let ctx;
before(async () => {
  ctx = await setup();
});
after(() => ctx.teardown());

describe('step 1: setup + health', () => {
  it('GET /api/health reports ok with a live DB', async () => {
    const res = await ctx.request.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.db, 'connected');
  });

  it('sets helmet headers and no x-powered-by', async () => {
    const res = await ctx.request.get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('CORS allows listed origins with credentials and ignores others', async () => {
    const ok = await ctx.request.get('/api/health').set('Origin', ADMIN_ORIGIN);
    assert.equal(ok.headers['access-control-allow-origin'], ADMIN_ORIGIN);
    assert.equal(ok.headers['access-control-allow-credentials'], 'true');
    const bad = await ctx.request.get('/api/health').set('Origin', 'https://evil.example');
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await ctx.request.get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('rejects malformed JSON and bodies over 1 MB', async () => {
    const bad = await ctx.request.post('/api/public/corrections').set('Content-Type', 'application/json').send('{oops');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_JSON');
    const big = await ctx.request
      .post('/api/public/corrections')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ message: 'x'.repeat(1_100_000) }));
    assert.equal(big.status, 413);
  });
});
