import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { fullCaseStudy } from './fixtures.js';

let ctx;
let admin;
const ids = {};

async function createAndPublish(key, body) {
  const created = await admin.post('/api/admin/case-studies').send(body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  ids[key] = created.body._id;
  const pub = await admin.post(`/api/admin/case-studies/${created.body._id}/publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  await new Promise((r) => setTimeout(r, 15)); // distinct publishedAt values
  return pub.body;
}

before(async () => {
  ctx = await setup();
  admin = await ctx.loginAgent();
  await createAndPublish('a', fullCaseStudy({ name: 'Alpha Pay', tagline: 'Fictional wallet for tea stalls.', atAGlance: { sector: 'Fintech', city: 'Dhaka', foundedYear: 2015, shutDownYear: 2019, fundingAmountUSD: 2_000_000 }, failureReasons: [{ category: 'Ran out of funding' }, { category: 'Ran out of funding' }, { category: 'Competition' }] }));
  await createAndPublish('b', fullCaseStudy({ name: 'Beta Rides', tagline: 'Fictional bike hailing.', atAGlance: { sector: 'Mobility', city: 'Chattogram', foundedYear: 2017, shutDownYear: 2020, fundingAmountUSD: null } }));
  await createAndPublish('c', fullCaseStudy({ name: 'Gamma Grocer', tagline: 'Fictional grocery delivery.', atAGlance: { sector: 'eCommerce', city: 'Dhaka', foundedYear: 2018, shutDownYear: 2021, fundingAmountUSD: 500_000 } }));
  const draft = await admin.post('/api/admin/case-studies').send(fullCaseStudy({ name: 'Delta Draft' }));
  ids.draft = draft.body._id;
});
after(() => ctx.teardown());

describe('step 4: public endpoints + stats', () => {
  it('lists only published, newest first, without long sections', async () => {
    const res = await ctx.request.get('/api/public/case-studies');
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.limit, 12);
    assert.deepEqual(res.body.items.map((i) => i.name), ['Gamma Grocer', 'Beta Rides', 'Alpha Pay']);
    assert.equal(res.body.items[0].sections, undefined);
    assert.ok(res.body.items[0].tagline);
  });

  it('filters by sector, reason, city, year and text search; paginates', async () => {
    const q = (qs) => ctx.request.get(`/api/public/case-studies?${qs}`).then((r) => r.body.items.map((i) => i.name));
    assert.deepEqual(await q('sector=Fintech'), ['Alpha Pay']);
    assert.deepEqual(await q('reason=Competition'), ['Alpha Pay']);
    assert.deepEqual(await q('city=Dhaka'), ['Gamma Grocer', 'Alpha Pay']);
    assert.deepEqual(await q('year=2020'), ['Beta Rides']);
    assert.deepEqual(await q('q=grocery'), ['Gamma Grocer']);
    assert.deepEqual(await q('q=delta'), [], 'drafts never appear in search');

    const page2 = await ctx.request.get('/api/public/case-studies?limit=2&page=2');
    assert.deepEqual(page2.body.items.map((i) => i.name), ['Alpha Pay']);
    assert.equal(page2.body.totalPages, 2);
    assert.equal(page2.body.hasPrevPage, true);
    assert.equal(page2.body.hasNextPage, false);

    assert.equal((await ctx.request.get('/api/public/case-studies?sector=Crypto')).status, 400);
  });

  it('detail returns the full doc with prev/next slugs; drafts 404', async () => {
    const mid = await ctx.request.get('/api/public/case-studies/beta-rides');
    assert.equal(mid.status, 200);
    assert.ok(mid.body.sections.executiveSummary);
    assert.equal(mid.body.prevSlug, 'alpha-pay');
    assert.equal(mid.body.nextSlug, 'gamma-grocer');

    const first = await ctx.request.get('/api/public/case-studies/alpha-pay');
    assert.equal(first.body.prevSlug, null);
    const last = await ctx.request.get('/api/public/case-studies/gamma-grocer');
    assert.equal(last.body.nextSlug, null);

    assert.equal((await ctx.request.get('/api/public/case-studies/delta-draft')).status, 404);
  });

  it('stats aggregate published case studies only', async () => {
    const res = await ctx.request.get('/api/public/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalCaseStudies, 3);
    assert.equal(res.body.totalFundingLostUSD, 2_500_000);
    assert.equal(res.body.averageLifespanYears, 3.3); // (4 + 3 + 3) / 3
    const cat = Object.fromEntries(res.body.byFailureCategory.map((r) => [r.category, r.count]));
    assert.equal(cat['Ran out of funding'], 1, 'duplicate category in one doc counts once');
    assert.equal(cat['Competition'], 1);
    assert.equal(cat['Unit economics / cash burn'], 2);
    assert.equal(cat['Legal'], 0);
    assert.equal(res.body.byFailureCategory.length, 19);
    const sec = Object.fromEntries(res.body.bySector.map((r) => [r.sector, r.count]));
    assert.equal(sec.Fintech, 1);
    assert.equal(sec.Logistics, 0);
  });

  it('stats are cached, and invalidated when publishing changes', async () => {
    const first = await ctx.request.get('/api/public/stats');
    const cached = await ctx.request.get('/api/public/stats');
    assert.equal(cached.body.generatedAt, first.body.generatedAt);

    await admin.post(`/api/admin/case-studies/${ids.b}/unpublish`);
    const fresh = await ctx.request.get('/api/public/stats');
    assert.equal(fresh.body.totalCaseStudies, 2);
    await admin.post(`/api/admin/case-studies/${ids.b}/publish`);
  });

  it('taxonomies returns the shared lists', async () => {
    const res = await ctx.request.get('/api/public/taxonomies');
    assert.equal(res.body.sectors.length, 15);
    assert.equal(res.body.failureCategories.length, 19);
    assert.deepEqual(res.body.cities, ['Dhaka', 'Chattogram', 'Sylhet', 'Khulna', 'Rajshahi', 'Other']);
  });
});
