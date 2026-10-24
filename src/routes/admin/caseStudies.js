import { Router } from 'express';
import { CaseStudy } from '../../models/CaseStudy.js';
import { validate } from '../../middleware/validate.js';
import {
  adminListQuery,
  createCaseStudySchema,
  objectIdParam,
  updateCaseStudySchema,
} from '../../validation/caseStudy.js';
import { getPublishMissingFields } from '../../utils/caseStudyMath.js';
import { HttpError, notFound } from '../../utils/errors.js';
import { paginated, skipFor } from '../../utils/pagination.js';
import { triggerRevalidation } from '../../services/revalidate.js';
import { invalidateStats } from '../../services/stats.js';

const router = Router();

const NESTED_MERGE_KEYS = new Set(['atAGlance', 'sections']);

/** Apply a validated (partial) body: nested objects merge field by field, everything else replaces. */
function applyInput(doc, input) {
  for (const [key, value] of Object.entries(input)) {
    if (NESTED_MERGE_KEYS.has(key)) {
      for (const [sub, subValue] of Object.entries(value)) doc.set(`${key}.${sub}`, subValue);
    } else {
      doc.set(key, value);
    }
  }
}

function publishError(missing) {
  return new HttpError(422, 'Cannot publish: required fields are missing', {
    code: 'PUBLISH_REQUIREMENTS_NOT_MET',
    extra: { missing },
  });
}

/** Called after any change that affects the public site. */
function onPublicChange(...slugs) {
  invalidateStats();
  triggerRevalidation(...slugs);
}

async function loadById(id) {
  const doc = await CaseStudy.findById(id);
  if (!doc) throw notFound('Case study not found');
  return doc;
}

router.get('/', validate(adminListQuery, 'query'), async (req, res) => {
  const { status, slug, q, page, limit } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (slug) filter.slug = slug;
  if (q) filter.$text = { $search: q };

  const [items, total] = await Promise.all([
    CaseStudy.find(filter)
      .select('-sections')
      .sort({ updatedAt: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    CaseStudy.countDocuments(filter),
  ]);
  res.json(paginated(items, total, page, limit));
});

router.post('/', validate(createCaseStudySchema), async (req, res) => {
  const doc = new CaseStudy();
  applyInput(doc, req.body);
  await doc.save();
  res.status(201).json(doc);
});

router.get('/:id', validate(objectIdParam, 'params'), async (req, res) => {
  res.json(await loadById(req.params.id));
});

router.put('/:id', validate(objectIdParam, 'params'), validate(updateCaseStudySchema), async (req, res) => {
  const doc = await loadById(req.params.id);
  const previousSlug = doc.slug;
  applyInput(doc, req.body);

  const isPublished = doc.status === 'published';
  if (isPublished) {
    const missing = getPublishMissingFields(doc);
    if (missing.length) throw publishError(missing);
  }
  await doc.save();

  // Revalidate the old slug too if it changed, so the stale page disappears.
  if (isPublished) onPublicChange(previousSlug, doc.slug);
  res.json(doc);
});

router.delete('/:id', validate(objectIdParam, 'params'), async (req, res) => {
  const doc = await loadById(req.params.id);
  await doc.deleteOne();
  if (doc.status === 'published') onPublicChange(doc.slug);
  res.json({ ok: true, id: doc.id, slug: doc.slug });
});

router.post('/:id/publish', validate(objectIdParam, 'params'), async (req, res) => {
  const doc = await loadById(req.params.id);
  const missing = getPublishMissingFields(doc);
  if (missing.length) throw publishError(missing);

  doc.status = 'published';
  // Keep the original publish date on re-publish so prev/next ordering stays stable.
  doc.publishedAt ??= new Date();
  await doc.save();
  onPublicChange(doc.slug);
  res.json(doc);
});

router.post('/:id/unpublish', validate(objectIdParam, 'params'), async (req, res) => {
  const doc = await loadById(req.params.id);
  const wasPublished = doc.status === 'published';
  doc.status = 'draft';
  await doc.save();
  if (wasPublished) onPublicChange(doc.slug);
  res.json(doc);
});

export default router;
