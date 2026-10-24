import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from '../config/env.js';
import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' } });
}

function normalize(err) {
  if (err instanceof HttpError) {
    return { status: err.status, body: { message: err.message, code: err.code, details: err.details, ...err.extra } };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return {
      status: tooLarge ? 413 : 400,
      body: { message: tooLarge ? 'File too large (max 5 MB)' : err.message, code: err.code },
    };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      body: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      },
    };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, body: { message: `Invalid value for ${err.path}`, code: 'INVALID_ID' } };
  }
  if (err?.code === 11000) {
    return { status: 409, body: { message: 'Duplicate value', code: 'DUPLICATE', details: err.keyValue } };
  }
  // body-parser errors
  if (err?.type === 'entity.too.large') {
    return { status: 413, body: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' } };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, body: { message: 'Malformed JSON body', code: 'INVALID_JSON' } };
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const known = normalize(err);
  if (known) {
    return res.status(known.status).json({ error: known.body });
  }

  logger.error(`${req.method} ${req.originalUrl}`, err);
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const body = {
    message: status < 500 && err?.expose ? err.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
  };
  if (!config.isProd) {
    body.message = err?.message ?? body.message;
    body.stack = err?.stack;
  }
  res.status(status).json({ error: body });
}
