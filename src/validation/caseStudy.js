import { z } from 'zod';
import {
  CITIES,
  FAILURE_CATEGORIES,
  OUTCOMES,
  SECTION_KEYS,
  SECTORS,
  STATUSES,
} from '../constants/taxonomies.js';

// No defaults here on purpose: omitted fields stay untouched on update; Mongoose fills defaults on create.

const text = (max) => z.string().trim().max(max);
const year = z.number().int().min(1900).max(2100);
const nonNegInt = z.number().int().min(0);

/** Only http(s) URLs, so nothing like `javascript:` ever reaches the public site. */
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      return ['http:', 'https:'].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, 'Must be an http(s) URL');
const optionalUrl = z.union([z.literal(''), httpUrl]);

const nullableDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable());

const atAGlance = z
  .object({
    sector: z.enum(SECTORS).nullable(),
    city: z.enum(CITIES).nullable(),
    foundedYear: year.nullable(),
    shutDownYear: year.nullable(),
    founders: z.array(z.object({ name: text(120).min(1), role: text(120).optional() })).max(20),
    fundingAmountUSD: z.number().min(0).max(1e12).nullable(),
    fundingRounds: nonNegInt.max(100).nullable(),
    investors: z.array(text(120).min(1)).max(50),
    outcome: z.enum(OUTCOMES).nullable(),
    peakTeamSize: nonNegInt.max(1_000_000).nullable(),
  })
  .partial();

const sections = z.object(Object.fromEntries(SECTION_KEYS.map((k) => [k, text(100_000)]))).partial();

export const caseStudyInput = z
  .object({
    name: text(200).min(1, 'Name is required'),
    slug: text(100),
    tagline: text(300),
    logoUrl: optionalUrl,
    coverImageUrl: optionalUrl,
    lastVerifiedAt: nullableDate,
    atAGlance,
    failureReasons: z.array(z.object({ category: z.enum(FAILURE_CATEGORIES), summary: text(1000).optional() })).max(12),
    sections,
    timeline: z
      .array(
        z.object({
          year,
          month: z.number().int().min(1).max(12).nullable().optional(),
          event: text(500).min(1),
        }),
      )
      .max(100),
    lessons: z.array(text(500).min(1)).max(10),
    competitors: z.array(z.object({ name: text(120).min(1), url: optionalUrl.optional() })).max(30),
    sources: z
      .array(
        z.object({
          title: text(300).min(1),
          url: httpUrl,
          publisher: text(200).optional(),
          date: text(40).optional(),
        }),
      )
      .max(100),
  })
  // Unknown/read-only keys (_id, status, viewCount, lifespanYears, ...) are stripped, so the
  // admin client can PUT back a document it fetched without tripping validation.
  .partial();

export const createCaseStudySchema = caseStudyInput.required({ name: true });
export const updateCaseStudySchema = caseStudyInput;

export const adminListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  slug: z.string().trim().toLowerCase().max(100).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicListQuery = z.object({
  sector: z.enum(SECTORS).optional(),
  reason: z.enum(FAILURE_CATEGORIES).optional(),
  city: z.enum(CITIES).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const objectIdParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });
export const slugParam = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,100}$/, 'Invalid slug') });
