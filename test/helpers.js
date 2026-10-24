// Shared test harness: in-memory MongoDB + an app instance configured with test env vars.
// Env vars must be set before any src/ module is imported, because config is read at import time.
import bcrypt from 'bcrypt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import supertest from 'supertest';

export const ADMIN_EMAIL = 'admin@example.test';
export const ADMIN_PASSWORD = 'correct horse battery staple';
export const ADMIN_ORIGIN = 'http://admin.local.test';
export const WEB_ORIGIN = 'http://web.local.test';

export async function setup(extraEnv = {}) {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri('bdgy-test'),
    JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
    JWT_EXPIRES_IN: '7d',
    ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: await bcrypt.hash(ADMIN_PASSWORD, 4),
    ADMIN_ORIGIN,
    WEB_ORIGIN,
    CLOUDINARY_URL: '',
    GA4_PROPERTY_ID: '',
    GOOGLE_SERVICE_ACCOUNT_JSON: '',
    NEXT_REVALIDATE_URL: '',
    REVALIDATE_SECRET: '',
    ...extraEnv,
  });

  const { connectDb, disconnectDb } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  const mongoose = (await import('mongoose')).default;
  await connectDb(process.env.MONGODB_URI);
  await mongoose.connection.syncIndexes?.().catch(() => {});

  const app = createApp();
  const request = supertest(app);

  return {
    app,
    request,
    mongoose,
    /** supertest agent holding the admin auth cookie */
    async loginAgent() {
      const agent = supertest.agent(app);
      const res = await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
      if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
      return agent;
    },
    async teardown() {
      await disconnectDb();
      await mongo.stop();
    },
  };
}
