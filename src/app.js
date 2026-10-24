import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { corsMiddleware, requireTrustedOrigin, noStore } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', noStore, requireTrustedOrigin, authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin', noStore, requireTrustedOrigin, adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
