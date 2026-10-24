import { Router } from 'express';
import multer from 'multer';
import { imageStore, isUploadConfigured, sniffImageType } from '../../services/images.js';
import { badRequest, HttpError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const router = Router();

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest('Only JPG, PNG or WebP images are allowed', { code: 'INVALID_FILE_TYPE' }));
    }
    cb(null, true);
  },
});

// Field name: "file" (multipart/form-data)
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded (use multipart field "file")', { code: 'NO_FILE' });
  if (!sniffImageType(req.file.buffer)) {
    throw badRequest('File content is not a valid JPG, PNG or WebP image', { code: 'INVALID_FILE_TYPE' });
  }
  if (!isUploadConfigured()) {
    throw new HttpError(503, 'Image uploads are not configured (CLOUDINARY_URL missing)', { code: 'UPLOADS_NOT_CONFIGURED' });
  }

  let result;
  try {
    result = await imageStore.upload(req.file.buffer);
  } catch (err) {
    logger.error('Cloudinary upload failed:', err?.message ?? err);
    throw new HttpError(502, 'Image upload failed', { code: 'UPLOAD_FAILED' });
  }
  res.status(201).json({
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  });
});

export default router;
