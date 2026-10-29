import { Router } from 'express';
import { Message } from '../models/Message.js';
import { validate } from '../middleware/validate.js';
import { messagesLimiter } from '../middleware/rateLimiters.js';
import { createMessageSchema } from '../validation/message.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/', messagesLimiter(), validate(createMessageSchema), async (req, res) => {
  const { website, ...data } = req.body;

  // Honeypot filled in: pretend success so bots learn nothing, but store nothing.
  if (website !== undefined && website !== null && String(website).trim() !== '') {
    logger.warn(`Message honeypot triggered from ${req.ip}`);
    return res.status(201).json({ ok: true });
  }

  await Message.create(data);
  res.status(201).json({ ok: true });
});

export default router;
