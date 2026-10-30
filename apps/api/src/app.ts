import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env';
import { errorPayload, HttpError } from './lib/http';
import { activityRoutes } from './routes/activity';
import { authRoutes } from './routes/auth';
import { filesRoutes } from './routes/files';
import { foldersRoutes } from './routes/folders';
import { maintenanceRoutes } from './routes/maintenance';
import { sharesRoutes } from './routes/shares';
import { trashRoutes } from './routes/trash';
import { usersRoutes } from './routes/users';
import type { AppEnv } from './middleware/auth';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const api = new Hono<AppEnv>()
  .route('/auth', authRoutes)
  .route('/users', usersRoutes)
  .route('/folders', foldersRoutes)
  .route('/files', filesRoutes)
  .route('/trash', trashRoutes)
  .route('/activity', activityRoutes)
  .route('/maintenance', maintenanceRoutes)
  .route('/', sharesRoutes);

export const app = new Hono<AppEnv>()
  .use('*', secureHeaders())
  .use('/api/*', async (c, next) => {
    if (!writeMethods.has(c.req.method)) return next();
    const origin = c.req.header('origin');
    if (!origin) return next();

    const allowed = env.APP_ORIGIN.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!allowed.includes(origin)) {
      throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido.');
    }
    await next();
  })
  .use(
    '/api/*',
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: () => {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
      },
    }),
  )
  .get('/api/health', (c) => c.json({ ok: true, service: 'archivero-api' }, 200))
  .route('/api', api)
  .notFound((c) => c.json(errorPayload('NOT_FOUND', 'Ruta no encontrada.'), 404))
  .onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(
        errorPayload(error.code, error.message, error.details),
        error.status,
      );
    }
    console.error(error);
    return c.json(
      errorPayload('INTERNAL_ERROR', 'Ocurrió un error inesperado.'),
      500,
    );
  });

export type AppType = typeof app;
