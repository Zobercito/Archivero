import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sql } from './index';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

await migrate(db, { migrationsFolder });
await sql.end();

console.log('Migraciones aplicadas.');
