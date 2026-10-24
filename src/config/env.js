import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ADMIN_EMAIL: z.email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(/^\$2[aby]\$\d{2}\$.{53}$/, 'ADMIN_PASSWORD_HASH must be a bcrypt hash (run: npm run hash-password)'),
  ADMIN_ORIGIN: z.url(),
  WEB_ORIGIN: z.url(),
  CLOUDINARY_URL: optionalString,
  GA4_PROPERTY_ID: optionalString,
  GOOGLE_SERVICE_ACCOUNT_JSON: optionalString,
  NEXT_REVALIDATE_URL: optionalUrl,
  REVALIDATE_SECRET: optionalString,
  TRUST_PROXY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
});

function load() {
  // Strip quotes some hosts keep around values (e.g. a pasted '$2b$...' hash).
  const raw = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/^'(.*)'$/, '$1') : v]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  const env = parsed.data;
  const stripSlash = (s) => s.replace(/\/+$/, '');
  return {
    ...env,
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    ADMIN_EMAIL: env.ADMIN_EMAIL.toLowerCase(),
    allowedOrigins: [stripSlash(env.ADMIN_ORIGIN), stripSlash(env.WEB_ORIGIN)],
    trustProxy: env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? 1 : 0),
  };
}

export const config = load();
