import { Router } from 'express';
import { CaseStudy } from '../models/CaseStudy.js';
import { validate } from '../middleware/validate.js';
import { publicListQuery, slugParam } from '../validation/caseStudy.js';
import { CITIES, FAILURE_CATEGORIES, OUTCOMES, SECTORS } from '../constants/taxonomies.js';
import { notFound } from '../utils/errors.js';
import { paginated, skipFor } from '../utils/pagination.js';
import { getPublicStats } from '../services/stats.js';
import viewsRouter from './publicViews.js';
import correctionsRouter from './publicCorrections.js';
import messagesRouter from './publicMessages.js';

const router = Router();

const PUBLISHED = { status: 'published' };

router.get('/case-studies', validate(publicListQuery, 'query'), async (req, res) => {
  const { sector, reason, city, year, q, page, limit } = req.validatedQuery;
  const filter = { ...PUBLISHED };
  if (sector) filter['atAGlance.sector'] = sector;
  if (city) filter['atAGlance.city'] = city;
  if (year) filter['atAGlance.shutDownYear'] = year;
  if (reason) filter['failureReasons.category'] = reason;
  if (q) filter.$text = { $search: q };

  const [items, total] = await Promise.all([
    CaseStudy.find(filter)
      .select('-sections')
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    CaseStudy.countDocuments(filter),
  ]);
  res.json(paginated(items, total, page, limit));
});

router.get('/case-studies/:slug', validate(slugParam, 'params'), async (req, res) => {
  const doc = await CaseStudy.findOne({ ...PUBLISHED, slug: req.params.slug }).lean();
  if (!doc) throw notFound('Case study not found');

  // Ordered by publishedAt (ties broken by _id): prev = the one published just before, next = just after.
  const { publishedAt, _id } = doc;
  const [prev, next] = await Promise.all([
    CaseStudy.findOne({
      ...PUBLISHED,
      $or: [{ publishedAt: { $lt: publishedAt } }, { publishedAt, _id: { $lt: _id } }],
    })
      .sort({ publishedAt: -1, _id: -1 })
      .select('slug')
      .lean(),
    CaseStudy.findOne({
      ...PUBLISHED,
      $or: [{ publishedAt: { $gt: publishedAt } }, { publishedAt, _id: { $gt: _id } }],
    })
      .sort({ publishedAt: 1, _id: 1 })
      .select('slug')
      .lean(),
  ]);

  res.json({ ...doc, prevSlug: prev?.slug ?? null, nextSlug: next?.slug ?? null });
});

router.get('/stats', async (req, res) => {
  res.json(await getPublicStats());
});

router.get('/taxonomies', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ sectors: SECTORS, failureCategories: FAILURE_CATEGORIES, cities: CITIES, outcomes: OUTCOMES });
});

router.use('/case-studies', viewsRouter);
router.use('/corrections', correctionsRouter);
router.use('/messages', messagesRouter);

export default router;
