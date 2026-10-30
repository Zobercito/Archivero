import type { Context, MiddlewareHandler } from 'hono';
import { HttpError } from './http';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function requestIp(c: Context) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return c.req.header('x-real-ip') ?? 'local';
}

export function rateLimit(input: {
  name: string;
  limit: number;
  windowMs: number;
}): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now();
    const key = `${input.name}:${requestIp(c)}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + input.windowMs };
      buckets.set(key, bucket);
      if (buckets.size > MAX_BUCKETS) {
        for (const [storedKey, stored] of buckets) {
          if (stored.resetAt <= now) buckets.delete(storedKey);
        }
      }
    }

    bucket.count += 1;
    const remaining = Math.max(0, input.limit - bucket.count);
    c.header('RateLimit-Limit', String(input.limit));
    c.header('RateLimit-Remaining', String(remaining));
    c.header('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > input.limit) {
      throw new HttpError(
        429,
        'RATE_LIMITED',
        'Demasiadas solicitudes. Inténtalo de nuevo más tarde.',
      );
    }

    await next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}
