import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './env';
import { cleanupPendingUploads } from './services/cleanup';

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    hostname: '0.0.0.0',
  },
  (info) => {
    console.log(`Archivero API escuchando en http://localhost:${info.port}`);
  },
);

const cleanupTimer = setInterval(() => {
  cleanupPendingUploads().catch((error) => {
    console.error('Error al limpiar subidas pendientes:', error);
  });
}, 60 * 60 * 1000);
cleanupTimer.unref();

function shutdown() {
  clearInterval(cleanupTimer);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
