import { CaseStudy } from '../models/CaseStudy.js';
import { FAILURE_CATEGORIES, SECTORS } from '../constants/taxonomies.js';
import { TtlCache } from '../utils/ttlCache.js';

const cache = new TtlCache(10 * 60 * 1000);

async function computeStats() {
  const [result] = await CaseStudy.aggregate([
    { $match: { status: 'published' } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalCaseStudies: { $sum: 1 },
              totalFundingLostUSD: { $sum: { $ifNull: ['$atAGlance.fundingAmountUSD', 0] } },
              averageLifespanYears: { $avg: '$atAGlance.lifespanYears' }, // $avg ignores nulls
            },
          },
        ],
        byFailureCategory: [
          { $unwind: '$failureReasons' },
          // Count each case study once per category even if it lists the category twice.
          { $group: { _id: { category: '$failureReasons.category', id: '$_id' } } },
          { $group: { _id: '$_id.category', count: { $sum: 1 } } },
        ],
        bySector: [
          { $match: { 'atAGlance.sector': { $ne: null } } },
          { $group: { _id: '$atAGlance.sector', count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const totals = result.totals[0] ?? { totalCaseStudies: 0, totalFundingLostUSD: 0, averageLifespanYears: null };
  const toMap = (rows) => new Map(rows.map((r) => [r._id, r.count]));
  const categories = toMap(result.byFailureCategory);
  const sectors = toMap(result.bySector);

  return {
    totalCaseStudies: totals.totalCaseStudies,
    totalFundingLostUSD: totals.totalFundingLostUSD,
    averageLifespanYears:
      totals.averageLifespanYears == null ? null : Math.round(totals.averageLifespanYears * 10) / 10,
    // Every taxonomy value is listed (zero counts included) so charts have stable axes.
    byFailureCategory: FAILURE_CATEGORIES.map((category) => ({ category, count: categories.get(category) ?? 0 })),
    bySector: SECTORS.map((sector) => ({ sector, count: sectors.get(sector) ?? 0 })),
    generatedAt: new Date().toISOString(),
  };
}

export const getPublicStats = () => cache.wrap('public', computeStats);

/** Called whenever the set of published case studies changes. */
export const invalidateStats = () => cache.clear();
