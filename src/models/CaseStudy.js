import mongoose from 'mongoose';
import { CITIES, FAILURE_CATEGORIES, OUTCOMES, SECTORS, STATUSES } from '../constants/taxonomies.js';
import { computeLifespan, computeReadingTime, slugify } from '../utils/caseStudyMath.js';

const { Schema } = mongoose;

const str = { type: String, trim: true };
const nullableNumber = { type: Number, default: null, min: 0 };

const sectionsSchema = new Schema(
  {
    executiveSummary: { ...str, default: '' },
    companyBackground: { ...str, default: '' },
    marketContext: { ...str, default: '' },
    whatWentWrong: { ...str, default: '' },
    whatCouldHaveBeenDone: { ...str, default: '' },
    conclusion: { ...str, default: '' },
    researchNotes: { ...str, default: '' },
  },
  { _id: false },
);

const caseStudySchema = new Schema(
  {
    slug: { ...str, lowercase: true },
    status: { type: String, enum: STATUSES, default: 'draft' },
    publishedAt: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: null },

    name: { ...str, required: true },
    tagline: { ...str, default: '' },
    logoUrl: { ...str, default: '' },
    coverImageUrl: { ...str, default: '' },

    atAGlance: {
      sector: { type: String, enum: [...SECTORS, null], default: null },
      city: { type: String, enum: [...CITIES, null], default: null },
      foundedYear: { type: Number, default: null },
      shutDownYear: { type: Number, default: null },
      lifespanYears: { type: Number, default: null },
      founders: { type: [new Schema({ name: { ...str, required: true }, role: { ...str, default: '' } }, { _id: false })], default: [] },
      fundingAmountUSD: nullableNumber,
      fundingRounds: nullableNumber,
      investors: { type: [str], default: [] },
      outcome: { type: String, enum: [...OUTCOMES, null], default: null },
      peakTeamSize: nullableNumber,
    },

    failureReasons: {
      type: [
        new Schema(
          { category: { type: String, enum: FAILURE_CATEGORIES, required: true }, summary: { ...str, default: '' } },
          { _id: false },
        ),
      ],
      default: [],
    },

    sections: { type: sectionsSchema, default: () => ({}) },

    timeline: {
      type: [
        new Schema(
          { year: { type: Number, required: true }, month: { type: Number, min: 1, max: 12, default: null }, event: { ...str, required: true } },
          { _id: false },
        ),
      ],
      default: [],
    },
    lessons: { type: [str], default: [] },
    competitors: {
      type: [new Schema({ name: { ...str, required: true }, url: { ...str, default: '' } }, { _id: false })],
      default: [],
    },
    sources: {
      type: [
        new Schema(
          {
            title: { ...str, required: true },
            url: { ...str, required: true },
            publisher: { ...str, default: '' },
            date: { ...str, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    readingTimeMinutes: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
  },
  {
    collection: 'casestudies',
    timestamps: true, // createdAt + updatedAt
    toJSON: { versionKey: false },
    toObject: { versionKey: false },
  },
);

caseStudySchema.index({ slug: 1 }, { unique: true });
caseStudySchema.index({ status: 1, publishedAt: -1 });
caseStudySchema.index({ viewCount: -1 });
caseStudySchema.index(
  { name: 'text', tagline: 'text', 'sections.executiveSummary': 'text' },
  { name: 'casestudy_text', weights: { name: 10, tagline: 5, 'sections.executiveSummary': 1 } },
);

/** Finds a slug not used by any other document: base, base-2, base-3, ... */
caseStudySchema.statics.uniqueSlug = async function uniqueSlug(source, excludeId) {
  const base = slugify(source) || 'case-study';
  const taken = new Set(
    (
      await this.find({ slug: new RegExp(`^${base}(-\\d+)?$`), ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
        .select('slug')
        .lean()
    ).map((d) => d.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

caseStudySchema.pre('validate', async function computeDerivedFields() {
  if (!this.slug || this.isModified('slug')) {
    this.slug = await this.constructor.uniqueSlug(this.slug || this.name, this._id);
  }
  const { foundedYear, shutDownYear } = this.atAGlance;
  if (foundedYear != null && shutDownYear != null && shutDownYear < foundedYear) {
    this.invalidate('atAGlance.shutDownYear', 'shutDownYear cannot be before foundedYear');
  }
  this.atAGlance.lifespanYears = computeLifespan(foundedYear, shutDownYear);
  this.readingTimeMinutes = computeReadingTime(this.sections);
});

export const CaseStudy = mongoose.models.CaseStudy || mongoose.model('CaseStudy', caseStudySchema);
