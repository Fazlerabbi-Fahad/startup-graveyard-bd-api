import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { config } from '../config/env.js';
import { TtlCache } from '../utils/ttlCache.js';
import { logger } from '../utils/logger.js';

export const RANGES = { '7d': 7, '28d': 28, '90d': 90 };
// GA4 reports dates in the property's time zone; the site's audience/property is in Bangladesh.
const PROPERTY_TIMEZONE = 'Asia/Dhaka';

const cache = new TtlCache(10 * 60 * 1000);
let client;

export function isGa4Configured() {
  return Boolean(config.GA4_PROPERTY_ID && config.GOOGLE_SERVICE_ACCOUNT_JSON);
}

export function parseServiceAccount(base64) {
  let json;
  try {
    json = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON');
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  return json;
}

function getClient() {
  if (!client) {
    const sa = parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON);
    client = new BetaAnalyticsDataClient({
      credentials: { client_email: sa.client_email, private_key: sa.private_key },
      projectId: sa.project_id,
    });
  }
  return client;
}

export function buildRequests(days) {
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }];
  const top = (dimension, metric) => ({
    dateRanges,
    dimensions: [{ name: dimension }],
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit: 10,
  });
  return [
    { dateRanges, metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }] },
    {
      dateRanges,
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
    top('pagePath', 'screenPageViews'),
    top('country', 'activeUsers'),
    top('sessionSourceMedium', 'sessions'),
  ];
}

const num = (v) => Number(v ?? 0) || 0;
const rowsOf = (report) => report?.rows ?? [];
const dim = (row, i = 0) => row.dimensionValues?.[i]?.value ?? '';
const met = (row, i = 0) => num(row.metricValues?.[i]?.value);
const gaDateToIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/** Last `days` calendar dates (YYYY-MM-DD) ending today in the property time zone. */
export function lastNDates(days, now = new Date()) {
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: PROPERTY_TIMEZONE }).format(now);
  const today = new Date(`${todayIso}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/** Turn the 5 batch reports into the API response shape. Pure, so it is unit-testable. */
export function shapeReports(reports, days, now = new Date()) {
  const [totalsReport, dailyReport, pagesReport, countriesReport, sourcesReport] = reports;
  const totalsRow = rowsOf(totalsReport)[0];

  const daily = new Map(rowsOf(dailyReport).map((r) => [gaDateToIso(dim(r)), met(r)]));
  const dates = [...new Set([...lastNDates(days, now), ...daily.keys()])].sort().slice(-days);

  return {
    totals: {
      users: totalsRow ? met(totalsRow, 0) : 0,
      sessions: totalsRow ? met(totalsRow, 1) : 0,
      pageViews: totalsRow ? met(totalsRow, 2) : 0,
    },
    dailyUsers: dates.map((date) => ({ date, users: daily.get(date) ?? 0 })),
    topPages: rowsOf(pagesReport).map((r) => ({ path: dim(r), views: met(r) })),
    topCountries: rowsOf(countriesReport).map((r) => ({ country: dim(r), users: met(r) })),
    topSources: rowsOf(sourcesReport).map((r) => ({ source: dim(r), sessions: met(r) })),
  };
}

async function fetchGa4(days) {
  const [response] = await getClient().batchRunReports({
    property: `properties/${config.GA4_PROPERTY_ID}`,
    requests: buildRequests(days),
  });
  return shapeReports(response.reports ?? [], days);
}

/** Returns { ga4 } on success or { ga4: null, reason } when unavailable. Never throws. */
export async function getGa4Report(range) {
  if (!isGa4Configured()) return { ga4: null, reason: 'not configured' };
  try {
    return { ga4: await cache.wrap(range, () => fetchGa4(RANGES[range])) };
  } catch (err) {
    const detail = err?.details || err?.message || String(err);
    logger.error('GA4 request failed:', detail);
    return { ga4: null, reason: `GA4 request failed: ${detail}` };
  }
}
