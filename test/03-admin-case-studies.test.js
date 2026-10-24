import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { fullCaseStudy } from './fixtures.js';

let ctx;
let admin;
before(async () => {
  ctx = await setup();
  admin = await ctx.loginAgent();
});
after(() => ctx.teardown());

describe('step 3: admin case study CRUD + publish rules', () => {
  let id;

  it('creates a draft with generated slug, lifespan and reading time', async () => {
    const res = await admin.post('/api/admin/case-studies').send(fullCaseStudy({ status: 'published', viewCount: 999 }));
    assert.equal(res.status, 201);
    id = res.body._id;
    assert.equal(res.body.slug, 'test-startup-alpha');
    assert.equal(res.body.status, 'draft', 'status cannot be set through create');
    assert.equal(res.body.viewCount, 0, 'viewCount cannot be set through create');
    assert.equal(res.body.atAGlance.lifespanYears, 4);
    assert.equal(res.body.readingTimeMinutes, Math.ceil(500 / 220));
    assert.ok(res.body.updatedAt);
    assert.equal(res.body.__v, undefined);
  });

  it('makes slugs unique and slugifies a provided slug', async () => {
    const dup = await admin.post('/api/admin/case-studies').send({ name: 'Test Startup Alpha' });
    assert.equal(dup.body.slug, 'test-startup-alpha-2');
    const custom = await admin.post('/api/admin/case-studies').send({ name: 'X', slug: 'My Custom  Slug!' });
    assert.equal(custom.body.slug, 'my-custom-slug');
  });

  it('validates input with zod (name required, enums, http urls, year order)', async () => {
    const noName = await admin.post('/api/admin/case-studies').send({ tagline: 'x' });
    assert.equal(noName.status, 400);
    assert.equal(noName.body.error.code, 'VALIDATION_ERROR');

    const badEnum = await admin.post('/api/admin/case-studies').send({ name: 'Y', atAGlance: { sector: 'Crypto' } });
    assert.equal(badEnum.status, 400);
    assert.ok(badEnum.body.error.details.some((d) => d.path === 'atAGlance.sector'));

    const jsUrl = await admin
      .post('/api/admin/case-studies')
      .send({ name: 'Y', sources: [{ title: 't', url: 'javascript:alert(1)' }] });
    assert.equal(jsUrl.status, 400);

    const years = await admin
      .post('/api/admin/case-studies')
      .send({ name: 'Y', atAGlance: { foundedYear: 2020, shutDownYear: 2018 } });
    assert.equal(years.status, 400);
  });

  it('lists (without sections) and gets by id; 400 on bad id, 404 on missing', async () => {
    const list = await admin.get('/api/admin/case-studies?limit=2');
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 3);
    assert.equal(list.body.items.length, 2);
    assert.equal(list.body.totalPages, 2);
    assert.equal(list.body.items[0].sections, undefined);

    const one = await admin.get(`/api/admin/case-studies/${id}`);
    assert.equal(one.status, 200);
    assert.ok(one.body.sections.executiveSummary);

    assert.equal((await admin.get('/api/admin/case-studies/not-an-id')).status, 400);
    assert.equal((await admin.get('/api/admin/case-studies/0123456789abcdef01234567')).status, 404);
  });

  it('PUT merges nested fields and recomputes derived values; slug stays when name changes', async () => {
    const res = await admin
      .put(`/api/admin/case-studies/${id}`)
      .send({ name: 'Renamed Alpha', atAGlance: { shutDownYear: 2022 }, sections: { conclusion: 'word '.repeat(300) } });
    assert.equal(res.status, 200);
    assert.equal(res.body.slug, 'test-startup-alpha');
    assert.equal(res.body.atAGlance.sector, 'Logistics', 'untouched nested field kept');
    assert.equal(res.body.atAGlance.lifespanYears, 6);
    assert.ok(res.body.sections.executiveSummary, 'untouched section kept');
    assert.equal(res.body.readingTimeMinutes, Math.ceil(800 / 220));
  });

  it('refuses to publish incomplete documents with a list of missing fields', async () => {
    const draft = await admin.post('/api/admin/case-studies').send({ name: 'Incomplete' });
    const res = await admin.post(`/api/admin/case-studies/${draft.body._id}/publish`);
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'PUBLISH_REQUIREMENTS_NOT_MET');
    assert.deepEqual(res.body.error.missing, [
      'tagline',
      'sections.executiveSummary',
      'sections.whatWentWrong',
      'failureReasons',
      'lessons',
      'sources',
    ]);
  });

  it('publishes, keeps publishedAt on re-publish, and unpublishes', async () => {
    const pub = await admin.post(`/api/admin/case-studies/${id}/publish`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.status, 'published');
    const firstPublishedAt = pub.body.publishedAt;
    assert.ok(firstPublishedAt);

    const un = await admin.post(`/api/admin/case-studies/${id}/unpublish`);
    assert.equal(un.body.status, 'draft');
    const again = await admin.post(`/api/admin/case-studies/${id}/publish`);
    assert.equal(again.body.publishedAt, firstPublishedAt);
  });

  it('blocks an update that would make a published case study incomplete', async () => {
    const res = await admin.put(`/api/admin/case-studies/${id}`).send({ sources: [] });
    assert.equal(res.status, 422);
    assert.deepEqual(res.body.error.missing, ['sources']);
  });

  it('filters the admin list by status and deletes', async () => {
    const published = await admin.get('/api/admin/case-studies?status=published');
    assert.equal(published.body.total, 1);
    const bySlug = await admin.get('/api/admin/case-studies?slug=test-startup-alpha');
    assert.deepEqual(bySlug.body.items.map((i) => i._id), [id]);
    const del = await admin.delete(`/api/admin/case-studies/${id}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);
    assert.equal((await admin.get(`/api/admin/case-studies/${id}`)).status, 404);
  });
});
