import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const TIMEOUT_MS = 5000;

/**
 * Ask the Next.js site to revalidate a case study page (on-demand ISR).
 * Never throws: failures are logged so the admin request still succeeds.
 * Fire-and-forget from routes; the returned promise is only awaited by tests.
 */
export async function revalidateSlug(slug) {
  if (!config.NEXT_REVALIDATE_URL || !config.REVALIDATE_SECRET) {
    logger.warn(`Revalidation skipped for "${slug}": NEXT_REVALIDATE_URL / REVALIDATE_SECRET not set`);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(config.NEXT_REVALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: config.REVALIDATE_SECRET, slug }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.error(`Revalidation for "${slug}" failed: HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }
    logger.info(`Revalidated "${slug}"`);
    return { ok: true };
  } catch (err) {
    logger.error(`Revalidation for "${slug}" failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Kick off revalidation for one or more slugs without blocking the response. */
export function triggerRevalidation(...slugs) {
  const unique = [...new Set(slugs.filter(Boolean))];
  return Promise.all(unique.map(revalidateSlug));
}
