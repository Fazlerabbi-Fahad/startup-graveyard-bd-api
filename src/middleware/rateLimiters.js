import { MemoryStore, rateLimit } from 'express-rate-limit';

const stores = [];

const limiter = (windowMs, limit, message, code) => {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { message, code } }),
  });
};

export const loginLimiter = () =>
  limiter(15 * 60 * 10000, 5, 'Too many login attempts. Try again in 15 minutes.', 'RATE_LIMITED');

export const correctionsLimiter = () =>
  limiter(60 * 60 * 1000, 3, 'Too many corrections submitted. Try again in an hour.', 'RATE_LIMITED');

export const messagesLimiter = () =>
  limiter(60 * 60 * 1000, 5, 'Too many messages sent. Try again in an hour.', 'RATE_LIMITED');

/** Clears every in-memory limiter (used by tests). */
export const resetRateLimits = () => Promise.all(stores.map((s) => s.resetAll()));
