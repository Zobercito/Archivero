import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const envPath = fileURLToPath(
  new URL(
    process.env.NODE_ENV === 'test' ? '../../../.env.test' : '../../../.env',
    import.meta.url,
  ),
);

if (existsSync(envPath)) {
  loadEnv({ path: envPath, quiet: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(8),
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(25),
  MAINTENANCE_SECRET: z.string().min(16),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuración inválida:', z.flattenError(parsed.error).fieldErrors);
  throw new Error('Revisa las variables de entorno (usa .env.example como guía).');
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const maxFileSizeBytes = Math.floor(env.MAX_FILE_SIZE_MB * 1024 * 1024);
