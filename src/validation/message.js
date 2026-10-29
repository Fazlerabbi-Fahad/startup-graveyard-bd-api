import { z } from 'zod';
import { MESSAGE_KINDS, MESSAGE_STATUSES } from '../constants/taxonomies.js';

export const createMessageSchema = z.object({
  kind: z.enum(MESSAGE_KINDS).optional().default('contact'),
  name: z.string().trim().max(100).optional().default(''),
  email: z.email('Please enter a valid email address').max(254),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(5000),
  // Honeypot: hidden in the form, so humans leave it empty. Any type is accepted; checked in the route.
  website: z.any().optional(),
});

export const listMessagesQuery = z.object({
  status: z.enum(MESSAGE_STATUSES).optional(),
  kind: z.enum(MESSAGE_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateMessageSchema = z.object({ status: z.enum(MESSAGE_STATUSES) });
