import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ADMIN_ORIGIN } from './helpers.js';
import { fullCaseStudy } from './fixtures.js';

let ctx;
let admin;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

before(async () => {
  ctx = await setup();
  admin = await ctx.loginAgent();
  const created = await admin.post('/api/admin/case-studies').send(fullCaseStudy({ name: 'Viewable Co' }));
  await admin.post(`/api/admin/case-studies/${created.body._id}/publish`);
  await admin.post('/api/admin/case-studies').send({ name: 'Hidden Draft' });
});
after(() => ctx.teardown());

describe('step 5a: uploads', () => {
  it('requires auth', async () => {
    const res = await ctx.request.post('/api/admin/uploads').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(res.status, 401);
  });

  it('rejects missing files, wrong types, spoofed content and files over 5 MB', async () => {
    assert.equal((await admin.post('/api/admin/uploads')).body.error.code, 'NO_FILE');

    const gif = await admin.post('/api/admin/uploads').attach('file', Buffer.from('GIF89a'), { filename: 'a.gif', contentType: 'image/gif' });
    assert.equal(gif.status, 400);
    assert.equal(gif.body.error.code, 'INVALID_FILE_TYPE');

    const spoof = await admin.post('/api/admin/uploads').attach('file', Buffer.from('<svg onload=alert(1)>'), { filename: 'a.png', contentType: 'image/png' });
    assert.equal(spoof.status, 400);

    const big = await admin
      .post('/api/admin/uploads')
      .attach('file', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), { filename: 'big.png', contentType: 'image/png' });
    assert.equal(big.status, 413);
  });

  it('returns 503 when Cloudinary is not configured', async () => {
    const res = await admin.post('/api/admin/uploads').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'UPLOADS_NOT_CONFIGURED');
  });

  it('uploads to the "bdgy" store and returns the secure URL', async () => {
    const { config } = await import('../src/config/env.js');
    const { imageStore } = await import('../src/services/images.js');
    const original = imageStore.upload;
    config.CLOUDINARY_URL = 'cloudinary://k:s@demo';
    imageStore.upload = async () => ({ secure_url: 'https://res.cloudinary.com/demo/image/upload/bdgy/x.png', public_id: 'bdgy/x', width: 1, height: 1, format: 'png', bytes: 72 });
    try {
      const res = await admin.post('/api/admin/uploads').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
      assert.equal(res.status, 201);
      assert.equal(res.body.url, 'https://res.cloudinary.com/demo/image/upload/bdgy/x.png');
      assert.equal(res.body.publicId, 'bdgy/x');
    } finally {
      imageStore.upload = original;
      config.CLOUDINARY_URL = undefined;
    }
  });

  it('blocks cross-site multipart posts (CSRF) even with a valid cookie', async () => {
    const res = await admin
      .post('/api/admin/uploads')
      .set('Origin', 'https://evil.example')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(res.status, 403);
  });
});

describe('step 5b: view counter', () => {
  it('counts once per IP per slug per 6 hours', async () => {
    const first = await ctx.request.post('/api/public/case-studies/viewable-co/view');
    assert.deepEqual(first.body, { counted: true, viewCount: 1 });
    const second = await ctx.request.post('/api/public/case-studies/viewable-co/view');
    assert.deepEqual(second.body, { counted: false });

    const detail = await ctx.request.get('/api/public/case-studies/viewable-co');
    assert.equal(detail.body.viewCount, 1);
  });

  it('does not bump updatedAt, and 404s for drafts / unknown slugs', async () => {
    const before = (await ctx.request.get('/api/public/case-studies/viewable-co')).body.updatedAt;
    const { resetViewTracking } = await import('../src/routes/publicViews.js');
    resetViewTracking();
    await ctx.request.post('/api/public/case-studies/viewable-co/view');
    const afterDoc = (await ctx.request.get('/api/public/case-studies/viewable-co')).body;
    assert.equal(afterDoc.viewCount, 2);
    assert.equal(afterDoc.updatedAt, before);

    assert.equal((await ctx.request.post('/api/public/case-studies/hidden-draft/view')).status, 404);
    assert.equal((await ctx.request.post('/api/public/case-studies/nope/view')).status, 404);
  });
});

describe('step 5c: corrections', () => {
  const valid = { caseStudySlug: 'viewable-co', name: 'Reader', email: 'reader@example.test', message: 'The founding year should be 2017.' };

  it('validates input and requires a published case study', async () => {
    // All test requests share one IP: this test uses 2 of the 3 allowed submissions.
    const bad = await ctx.request.post('/api/public/corrections').send({ caseStudySlug: 'viewable-co', email: 'nope', message: 'short' });
    assert.equal(bad.status, 400);
    const paths = bad.body.error.details.map((d) => d.path).sort();
    assert.deepEqual(paths, ['email', 'message']);

    const draft = await ctx.request.post('/api/public/corrections').send({ ...valid, caseStudySlug: 'hidden-draft' });
    assert.equal(draft.status, 404);
  });

  it('silently drops honeypot submissions, then rate-limits at 3/hour', async () => {
    const bot = await ctx.request.post('/api/public/corrections').send({ ...valid, website: 'http://spam.example' });
    assert.equal(bot.status, 201);
    const blocked = await ctx.request.post('/api/public/corrections').send(valid);
    assert.equal(blocked.status, 429);

    const list = await admin.get('/api/admin/corrections');
    assert.equal(list.body.total, 0, 'honeypot submission was not stored');
  });

  it('stores valid submissions and lets the admin list and resolve them', async () => {
    const { resetRateLimits } = await import('../src/middleware/rateLimiters.js');
    await resetRateLimits();
    const ok = await ctx.request.post('/api/public/corrections').set('Origin', 'http://web.local.test').send({ ...valid, website: '' });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body, { ok: true });

    const list = await admin.get('/api/admin/corrections?status=new');
    assert.equal(list.body.total, 1);
    const item = list.body.items[0];
    assert.equal(item.caseStudySlug, 'viewable-co');
    assert.equal(item.status, 'new');
    assert.ok(item.createdAt);

    const patched = await admin.patch(`/api/admin/corrections/${item._id}`).set('Origin', ADMIN_ORIGIN).send({ status: 'resolved' });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.status, 'resolved');
    assert.equal((await admin.patch(`/api/admin/corrections/${item._id}`).send({ status: 'bogus' })).status, 400);
    assert.equal((await admin.get('/api/admin/corrections?status=new')).body.total, 0);
  });
});
