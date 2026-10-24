import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setup } from './helpers.js';
import { fullCaseStudy } from './fixtures.js';

let ctx;
let admin;
let config;
let server;
let received = [];
let respondWith = 200;

const waitFor = async (predicate, ms = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error(`timed out; received ${JSON.stringify(received)}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};
const settle = () => new Promise((r) => setTimeout(r, 150));

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ method: req.method, contentType: req.headers['content-type'], body: JSON.parse(body) });
      res.writeHead(respondWith).end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  ctx = await setup({
    NEXT_REVALIDATE_URL: `http://127.0.0.1:${server.address().port}/api/revalidate`,
    REVALIDATE_SECRET: 'shared-secret',
  });
  ({ config } = await import('../src/config/env.js'));
  admin = await ctx.loginAgent();
});
after(async () => {
  await ctx.teardown();
  server.close();
});
beforeEach(() => {
  received = [];
  respondWith = 200;
});

describe('step 7: on-demand revalidation', () => {
  let id;

  it('does not revalidate when a draft is created or edited', async () => {
    const res = await admin.post('/api/admin/case-studies').send(fullCaseStudy({ name: 'Reval One' }));
    id = res.body._id;
    await admin.put(`/api/admin/case-studies/${id}`).send({ tagline: 'Edited while draft.' });
    await settle();
    assert.equal(received.length, 0);
  });

  it('POSTs { secret, slug } as JSON on publish', async () => {
    await admin.post(`/api/admin/case-studies/${id}/publish`);
    await waitFor(() => received.length === 1);
    assert.deepEqual(received[0], {
      method: 'POST',
      contentType: 'application/json',
      body: { secret: 'shared-secret', slug: 'reval-one' },
    });
  });

  it('revalidates on update of a published item, including the old slug after a rename', async () => {
    await admin.put(`/api/admin/case-studies/${id}`).send({ tagline: 'Edited after publish.' });
    await waitFor(() => received.length === 1);
    received = [];

    await admin.put(`/api/admin/case-studies/${id}`).send({ slug: 'reval-renamed' });
    await waitFor(() => received.length === 2);
    assert.deepEqual(received.map((r) => r.body.slug).sort(), ['reval-one', 'reval-renamed']);
  });

  it('revalidates on unpublish and on delete of a published item', async () => {
    await admin.post(`/api/admin/case-studies/${id}/unpublish`);
    await waitFor(() => received.length === 1);
    await admin.post(`/api/admin/case-studies/${id}/publish`);
    await admin.delete(`/api/admin/case-studies/${id}`);
    await waitFor(() => received.length === 3);
    assert.deepEqual(received.map((r) => r.body.slug), ['reval-renamed', 'reval-renamed', 'reval-renamed']);
  });

  it('logs but never fails the request when the Next.js endpoint errors or is unreachable', async () => {
    const created = await admin.post('/api/admin/case-studies').send(fullCaseStudy({ name: 'Reval Two' }));
    respondWith = 500;
    const pub = await admin.post(`/api/admin/case-studies/${created.body._id}/publish`);
    assert.equal(pub.status, 200);
    await waitFor(() => received.length === 1);

    const { revalidateSlug } = await import('../src/services/revalidate.js');
    assert.deepEqual(await revalidateSlug('reval-two'), { ok: false, status: 500 });

    const original = config.NEXT_REVALIDATE_URL;
    config.NEXT_REVALIDATE_URL = 'http://127.0.0.1:1/unreachable';
    try {
      const un = await admin.post(`/api/admin/case-studies/${created.body._id}/unpublish`);
      assert.equal(un.status, 200);
      const result = await revalidateSlug('reval-two');
      assert.equal(result.ok, false);
      assert.ok(result.error);
    } finally {
      config.NEXT_REVALIDATE_URL = original;
    }
  });
});
