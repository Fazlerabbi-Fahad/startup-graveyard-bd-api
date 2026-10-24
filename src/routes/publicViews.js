import { Router } from 'express';
import { CaseStudy } from '../models/CaseStudy.js';
import { validate } from '../middleware/validate.js';
import { slugParam } from '../validation/caseStudy.js';
import { notFound } from '../utils/errors.js';

const router = Router();

const WINDOW_MS = 6 * 60 * 60 * 1000;
/** `${ip}|${slug}` -> timestamp until which further views from that IP are not counted. */
const seen = new Map();

function prune(now = Date.now()) {
  for (const [key, until] of seen) if (until <= now) seen.delete(key);
}
setInterval(prune, 10 * 60 * 1000).unref();

export const resetViewTracking = () => seen.clear();

router.post('/:slug/view', validate(slugParam, 'params'), async (req, res) => {
  const { slug } = req.params;
  const key = `${req.ip}|${slug}`;
  const now = Date.now();

  if ((seen.get(key) ?? 0) > now) {
    return res.json({ counted: false });
  }

  const doc = await CaseStudy.findOneAndUpdate(
    { slug, status: 'published' },
    { $inc: { viewCount: 1 } },
    { returnDocument: 'after', timestamps: false, projection: { viewCount: 1 } },
  ).lean();
  if (!doc) throw notFound('Case study not found');

  if (seen.size > 200_000) prune(now);
  seen.set(key, now + WINDOW_MS);
  res.json({ counted: true, viewCount: doc.viewCount });
});

export default router;
