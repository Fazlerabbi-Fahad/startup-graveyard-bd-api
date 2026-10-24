import { Router } from 'express';
import { Correction } from '../../models/Correction.js';
import { validate } from '../../middleware/validate.js';
import { objectIdParam } from '../../validation/caseStudy.js';
import { listCorrectionsQuery, updateCorrectionSchema } from '../../validation/correction.js';
import { notFound } from '../../utils/errors.js';
import { paginated, skipFor } from '../../utils/pagination.js';

const router = Router();

router.get('/', validate(listCorrectionsQuery, 'query'), async (req, res) => {
  const { status, caseStudySlug, page, limit } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (caseStudySlug) filter.caseStudySlug = caseStudySlug;

  const [items, total] = await Promise.all([
    Correction.find(filter).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Correction.countDocuments(filter),
  ]);
  res.json(paginated(items, total, page, limit));
});

router.patch('/:id', validate(objectIdParam, 'params'), validate(updateCorrectionSchema), async (req, res) => {
  const doc = await Correction.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) throw notFound('Correction not found');
  res.json(doc);
});

export default router;
