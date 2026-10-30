import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { activityLog, users } from '../db/schema';
import { activityDto } from '../dto';
import { validationHook } from '../lib/http';
import { type AppEnv, requireAuth, requireRole } from '../middleware/auth';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const activityRoutes = new Hono<AppEnv>()
  .use('*', requireAuth, requireRole('admin'))
  .get('/', zValidator('query', querySchema, validationHook), async (c) => {
    const { limit, offset } = c.req.valid('query');

    const rows = await db
      .select({
        entry: activityLog,
        userName: users.name,
        userEmail: users.email,
      })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;

    return c.json(
      {
        entries: visible.map((row) =>
          activityDto(
            row.entry,
            row.userName && row.entry.userId
              ? {
                  id: row.entry.userId,
                  name: row.userName,
                  email: row.userEmail ?? '',
                }
              : null,
          ),
        ),
        hasMore,
        nextOffset: offset + visible.length,
      },
      200,
    );
  });
