export class HttpError extends Error {
  constructor(status, message, { code, details, extra } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.extra = extra;
  }
}

export const badRequest = (message, opts) => new HttpError(400, message, { code: 'BAD_REQUEST', ...opts });
export const unauthorized = (message = 'Not authenticated') => new HttpError(401, message, { code: 'UNAUTHORIZED' });
export const forbidden = (message = 'Forbidden') => new HttpError(403, message, { code: 'FORBIDDEN' });
export const notFound = (message = 'Not found') => new HttpError(404, message, { code: 'NOT_FOUND' });
