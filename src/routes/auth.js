import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimiters.js';
import { AUTH_COOKIE, requireAuth } from '../middleware/requireAuth.js';
import { unauthorized } from '../utils/errors.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().min(1).max(200),
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    // Admin and API live on different sites in production, so the cookie must be cross-site.
    sameSite: config.isProd ? 'none' : 'lax',
    path: '/',
  };
}

function expiresInMs(expiresIn) {
  const decoded = jwt.decode(jwt.sign({}, 'x', { expiresIn }));
  return (decoded.exp - decoded.iat) * 1000;
}

router.post('/login', loginLimiter(), validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const emailMatches = email.toLowerCase() === config.ADMIN_EMAIL;
  // Always run bcrypt so a wrong email and a wrong password take the same time.
  const passwordMatches = await bcrypt.compare(password, config.ADMIN_PASSWORD_HASH);
  if (!emailMatches || !passwordMatches) throw unauthorized('Invalid email or password');

  const token = jwt.sign({}, config.JWT_SECRET, {
    subject: 'admin',
    expiresIn: config.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions(), maxAge: expiresInMs(config.JWT_EXPIRES_IN) });
  res.json({ admin: { email: config.ADMIN_EMAIL } });
});

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ admin: req.admin });
});

export default router;
