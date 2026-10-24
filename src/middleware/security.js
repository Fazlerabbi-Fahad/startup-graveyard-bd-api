import cors from 'cors';
import { config } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

export const corsMiddleware = cors({
  // Requests without an Origin (curl, server-side fetches from Next.js) are allowed;
  // browser requests from any other origin get no CORS headers and are blocked.
  origin(origin, cb) {
    cb(null, !origin || config.allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated routes. The auth cookie is SameSite=None in
 * production, so a cross-site form could otherwise ride on it. Browsers always send
 * Origin on cross-site state-changing requests, so reject any foreign Origin.
 */
export function requireTrustedOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.allowedOrigins.includes(origin)) {
    return next(forbidden('Origin not allowed'));
  }
  next();
}

export function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
