import { z } from 'zod';
import { CORRECTION_STATUSES } from '../constants/taxonomies.js';

export const createCorrectionSchema = z.object({
  caseStudySlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,100}$/, 'Invalid case study'),
  name: z.string().trim().max(100).optional().default(''),
  email: z.union([z.literal(''), z.email().max(254)]).optional().default(''),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(5000),
  // Honeypot: hidden in the form, so humans leave it empty. Any type is accepted; checked in the route.
  website: z.any().optional(),
});

export const listCorrectionsQuery = z.object({
  status: z.enum(CORRECTION_STATUSES).optional(),
  caseStudySlug: z.string().trim().toLowerCase().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateCorrectionSchema = z.object({ status: z.enum(CORRECTION_STATUSES) });
