import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { files } from '../db/schema';
import { deleteObjectPrefix } from '../lib/storage';

const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanupPendingUploads() {
  const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS);
  const stale = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.status, 'pending'), lt(files.createdAt, cutoff)));

  for (const file of stale) {
    await deleteObjectPrefix(`files/${file.id}/`);
    await db.delete(files).where(eq(files.id, file.id));
  }

  return { removed: stale.length };
}
