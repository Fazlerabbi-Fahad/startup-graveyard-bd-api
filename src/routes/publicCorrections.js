import { Router } from 'express';
import { CaseStudy } from '../models/CaseStudy.js';
import { Correction } from '../models/Correction.js';
import { validate } from '../middleware/validate.js';
import { correctionsLimiter } from '../middleware/rateLimiters.js';
import { createCorrectionSchema } from '../validation/correction.js';
import { notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/', correctionsLimiter(), validate(createCorrectionSchema), async (req, res) => {
  const { website, ...data } = req.body;

  // Honeypot filled in: pretend success so bots learn nothing, but store nothing.
  if (website !== undefined && website !== null && String(website).trim() !== '') {
    logger.warn(`Correction honeypot triggered from ${req.ip}`);
    return res.status(201).json({ ok: true });
  }

  const exists = await CaseStudy.exists({ slug: data.caseStudySlug, status: 'published' });
  if (!exists) throw notFound('Case study not found');

  await Correction.create(data);
  res.status(201).json({ ok: true });
});

export default router;
