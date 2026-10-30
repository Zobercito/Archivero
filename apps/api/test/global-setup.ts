import { fileURLToPath } from 'node:url';

export default async function setup() {
  process.env.NODE_ENV = 'test';

  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const { db, sql } = await import('../src/db');
  const { ensureBucket } = await import('../src/lib/storage');

  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
  await migrate(db, { migrationsFolder });
  await ensureBucket();
  await sql.end();
}
