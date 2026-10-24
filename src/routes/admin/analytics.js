import { Router } from 'express';
import { z } from 'zod';
import { CaseStudy } from '../../models/CaseStudy.js';
import { validate } from '../../middleware/validate.js';
import { getGa4Report, RANGES } from '../../services/ga4.js';

const router = Router();

const querySchema = z.object({
  range: z.enum(Object.keys(RANGES)).default('28d'),
});

router.get('/', validate(querySchema, 'query'), async (req, res) => {
  const { range } = req.validatedQuery;
  const [topCaseStudies, ga4Result] = await Promise.all([
    CaseStudy.find({ viewCount: { $gt: 0 } })
      .sort({ viewCount: -1 })
      .limit(10)
      .select('slug name status viewCount publishedAt')
      .lean(),
    getGa4Report(range),
  ]);
  res.json({ range, topCaseStudies, ...ga4Result });
});

export default router;
