import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import caseStudies from './caseStudies.js';
import uploads from './uploads.js';
import corrections from './corrections.js';
import analytics from './analytics.js';

const router = Router();

router.use(requireAuth);
router.use('/case-studies', caseStudies);
router.use('/uploads', uploads);
router.use('/corrections', corrections);
router.use('/analytics', analytics);

export default router;
