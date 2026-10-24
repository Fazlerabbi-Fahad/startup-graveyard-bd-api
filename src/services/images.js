import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';

export const isUploadConfigured = () => Boolean(config.CLOUDINARY_URL);

/** Detect the real image type from magic bytes; never trust the client-supplied mimetype alone. */
export function sniffImageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function cloudinaryUpload(buffer) {
  // The SDK reads CLOUDINARY_URL from the environment.
  cloudinary.config({ secure: true });
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'bdgy', resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp'] },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

// Indirection so tests can stub the network call.
export const imageStore = { upload: cloudinaryUpload };
