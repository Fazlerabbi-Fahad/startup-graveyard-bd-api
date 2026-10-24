import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

export const AUTH_COOKIE = 'bdgy_admin';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.sub !== 'admin') return next(unauthorized());
    req.admin = { email: config.ADMIN_EMAIL };
    next();
  } catch {
    next(unauthorized('Session expired or invalid'));
  }
}
