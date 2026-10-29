import mongoose from 'mongoose';
import { MESSAGE_KINDS, MESSAGE_STATUSES } from '../constants/taxonomies.js';

const messageSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: MESSAGE_KINDS, default: 'contact' },
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, required: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'new' },
  },
  {
    collection: 'messages',
    timestamps: { createdAt: true, updatedAt: true },
    toJSON: { versionKey: false },
  },
);

messageSchema.index({ status: 1, createdAt: -1 });

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
