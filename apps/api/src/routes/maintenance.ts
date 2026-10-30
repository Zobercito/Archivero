import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { env } from '../env';
import { HttpError } from '../lib/http';
import { cleanupPendingUploads } from '../services/cleanup';

function secretMatches(provided: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(env.MAINTENANCE_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const maintenanceRoutes = new Hono().post('/cleanup', async (c) => {
  const provided = c.req.header('x-maintenance-secret') ?? '';
  if (!secretMatches(provided)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Secreto de mantenimiento inválido.');
  }
  const result = await cleanupPendingUploads();
  return c.json(result, 200);
});
