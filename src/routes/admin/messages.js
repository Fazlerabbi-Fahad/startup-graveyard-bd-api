import { Router } from 'express';
import { Message } from '../../models/Message.js';
import { validate } from '../../middleware/validate.js';
import { objectIdParam } from '../../validation/caseStudy.js';
import { listMessagesQuery, updateMessageSchema } from '../../validation/message.js';
import { notFound } from '../../utils/errors.js';
import { paginated, skipFor } from '../../utils/pagination.js';

const router = Router();

router.get('/', validate(listMessagesQuery, 'query'), async (req, res) => {
  const { status, kind, page, limit } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (kind) filter.kind = kind;

  const [items, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Message.countDocuments(filter),
  ]);
  res.json(paginated(items, total, page, limit));
});

router.patch('/:id', validate(objectIdParam, 'params'), validate(updateMessageSchema), async (req, res) => {
  const doc = await Message.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: 'after', runValidators: true },
  );
  if (!doc) throw notFound('Message not found');
  res.json(doc);
});

export default router;
