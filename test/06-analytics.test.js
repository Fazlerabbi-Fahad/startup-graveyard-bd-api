import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { fullCaseStudy } from './fixtures.js';

let ctx;
let admin;
before(async () => {
  ctx = await setup();
  admin = await ctx.loginAgent();
  for (const [name, views] of [['Popular', 3], ['Quiet', 1], ['Unseen', 0]]) {
    const c = await admin.post('/api/admin/case-studies').send(fullCaseStudy({ name }));
    await admin.post(`/api/admin/case-studies/${c.body._id}/publish`);
    if (views) await ctx.mongoose.connection.collection('casestudies').updateOne({ _id: new ctx.mongoose.Types.ObjectId(c.body._id) }, { $set: { viewCount: views } });
  }
});
after(() => ctx.teardown());

describe('step 6: analytics', () => {
  it('requires auth and validates range', async () => {
    assert.equal((await ctx.request.get('/api/admin/analytics')).status, 401);
    assert.equal((await admin.get('/api/admin/analytics?range=1y')).status, 400);
  });

  it('without GA4 env returns the MongoDB part plus { ga4: null, reason: "not configured" }', async () => {
    const res = await admin.get('/api/admin/analytics?range=7d');
    assert.equal(res.status, 200);
    assert.equal(res.body.range, '7d');
    assert.equal(res.body.ga4, null);
    assert.equal(res.body.reason, 'not configured');
    assert.deepEqual(res.body.topCaseStudies.map((c) => [c.slug, c.viewCount]), [['popular', 3], ['quiet', 1]]);
  });

  it('with broken GA4 credentials still returns 200 with a reason', async () => {
    const { config } = await import('../src/config/env.js');
    Object.assign(config, { GA4_PROPERTY_ID: '123', GOOGLE_SERVICE_ACCOUNT_JSON: 'bm90IGpzb24=' });
    try {
      const res = await admin.get('/api/admin/analytics?range=28d');
      assert.equal(res.status, 200);
      assert.equal(res.body.ga4, null);
      assert.match(res.body.reason, /^GA4 request failed: GOOGLE_SERVICE_ACCOUNT_JSON is not valid/);
      assert.equal(res.body.topCaseStudies.length, 2);
    } finally {
      Object.assign(config, { GA4_PROPERTY_ID: undefined, GOOGLE_SERVICE_ACCOUNT_JSON: undefined });
    }
  });

  it('builds 5 batch requests (GA4 batch maximum) covering the right number of days', async () => {
    const { buildRequests } = await import('../src/services/ga4.js');
    const reqs = buildRequests(7);
    assert.equal(reqs.length, 5);
    assert.deepEqual(reqs[0].dateRanges, [{ startDate: '6daysAgo', endDate: 'today' }]);
    assert.equal(reqs[2].dimensions[0].name, 'pagePath');
    assert.equal(reqs[2].limit, 10);
  });

  it('shapes GA4 responses and zero-fills missing days', async () => {
    const { shapeReports } = await import('../src/services/ga4.js');
    const row = (dims, mets) => ({
      dimensionValues: dims.map((value) => ({ value })),
      metricValues: mets.map((value) => ({ value: String(value) })),
    });
    const now = new Date('2026-10-08T12:00:00Z');
    const shaped = shapeReports(
      [
        { rows: [row([], [120, 150, 400])] },
        { rows: [row(['20261006'], [30]), row(['20261008'], [50])] },
        { rows: [row(['/case-studies/x'], [90]), row(['/'], [80])] },
        { rows: [row(['Bangladesh'], [100])] },
        { rows: [row(['google / organic'], [70])] },
      ],
      3,
      now,
    );
    assert.deepEqual(shaped.totals, { users: 120, sessions: 150, pageViews: 400 });
    assert.deepEqual(shaped.dailyUsers, [
      { date: '2026-10-06', users: 30 },
      { date: '2026-10-07', users: 0 },
      { date: '2026-10-08', users: 50 },
    ]);
    assert.deepEqual(shaped.topPages[0], { path: '/case-studies/x', views: 90 });
    assert.deepEqual(shaped.topCountries, [{ country: 'Bangladesh', users: 100 }]);
    assert.deepEqual(shaped.topSources, [{ source: 'google / organic', sessions: 70 }]);

    const empty = shapeReports([{}, {}, {}, {}, {}], 7, now);
    assert.deepEqual(empty.totals, { users: 0, sessions: 0, pageViews: 0 });
    assert.equal(empty.dailyUsers.length, 7);
  });
});
