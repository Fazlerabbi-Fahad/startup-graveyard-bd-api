import mongoose from 'mongoose';
import { CORRECTION_STATUSES } from '../constants/taxonomies.js';

const correctionSchema = new mongoose.Schema(
  {
    caseStudySlug: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: CORRECTION_STATUSES, default: 'new' },
  },
  {
    collection: 'corrections',
    timestamps: { createdAt: true, updatedAt: true },
    toJSON: { versionKey: false },
  },
);

correctionSchema.index({ status: 1, createdAt: -1 });
correctionSchema.index({ caseStudySlug: 1 });

export const Correction = mongoose.models.Correction || mongoose.model('Correction', correctionSchema);
