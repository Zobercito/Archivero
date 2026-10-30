import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { folders, users } from '../db/schema';
import { folderDto } from '../dto';
import { logActivity } from '../lib/activity';
import { HttpError, validationHook } from '../lib/http';
import { folderNameSchema, uuidSchema } from '../lib/validation';
import { type AppEnv, requireAuth, requireRole } from '../middleware/auth';

const listQuerySchema = z.object({
  parentId: uuidSchema.optional(),
});

const createFolderSchema = z.object({
  name: folderNameSchema,
  parentId: uuidSchema.nullish(),
});

const updateFolderSchema = z
  .object({
    name: folderNameSchema.optional(),
    parentId: uuidSchema.nullish(),
  })
  .refine((value) => value.name !== undefined || value.parentId !== undefined, {
    message: 'Indica al menos un cambio',
  });

async function getFolderOrThrow(id: string) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
    .limit(1);

  if (!folder) throw new HttpError(404, 'FOLDER_NOT_FOUND', 'Carpeta no encontrada.');
  return folder;
}

async function assertParentIsValid(parentId: string | null | undefined, movingId?: string) {
  if (!parentId) return;
  const parent = await getFolderOrThrow(parentId);

  if (movingId) {
    let cursor: string | null = parent.id;
    while (cursor) {
      if (cursor === movingId) {
        throw new HttpError(400, 'INVALID_MOVE', 'No puedes mover una carpeta dentro de sí misma.');
      }
      const [row] = await db
        .select({ parentId: folders.parentId })
        .from(folders)
        .where(eq(folders.id, cursor))
        .limit(1);
      cursor = row?.parentId ?? null;
    }
  }
}

export const foldersRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/', zValidator('query', listQuerySchema, validationHook), async (c) => {
    const { parentId } = c.req.valid('query');

    const rows = await db
      .select({ folder: folders, ownerName: users.name })
      .from(folders)
      .leftJoin(users, eq(folders.ownerId, users.id))
      .where(
        and(
          isNull(folders.deletedAt),
          parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
        ),
      )
      .orderBy(asc(sql`lower(${folders.name})`));

    return c.json(
      {
        folders: rows.map((row) =>
          folderDto(
            row.folder,
            row.ownerName ? { id: row.folder.ownerId, name: row.ownerName } : null,
          ),
        ),
      },
      200,
    );
  })
  .get('/tree', async (c) => {
    const rows = await db
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
      })
      .from(folders)
      .where(isNull(folders.deletedAt))
      .orderBy(asc(sql`lower(${folders.name})`));

    return c.json({ folders: rows }, 200);
  })
  .post(
    '/',
    requireRole('admin', 'editor'),
    zValidator('json', createFolderSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const input = c.req.valid('json');
      await assertParentIsValid(input.parentId);

      const [created] = await db
        .insert(folders)
        .values({
          name: input.name,
          parentId: input.parentId ?? null,
          ownerId: user.id,
        })
        .returning();

      if (!created) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo crear la carpeta.');

      await logActivity({
        userId: user.id,
        action: 'folder.create',
        targetType: 'folder',
        targetId: created.id,
        metadata: { name: created.name },
      });

      return c.json({ folder: folderDto(created, { id: user.id, name: user.name }) }, 201);
    },
  )
  .patch(
    '/:id',
    requireRole('admin', 'editor'),
    zValidator('param', z.object({ id: uuidSchema }), validationHook),
    zValidator('json', updateFolderSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const folder = await getFolderOrThrow(id);
      await assertParentIsValid(input.parentId, id);

      const [updated] = await db
        .update(folders)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.parentId === undefined ? {} : { parentId: input.parentId ?? null }),
        })
        .where(eq(folders.id, id))
        .returning();

      if (!updated) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo actualizar.');

      await logActivity({
        userId: user.id,
        action: 'folder.update',
        targetType: 'folder',
        targetId: updated.id,
        metadata: {
          previousName: folder.name,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
        },
      });

      const [owner] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, updated.ownerId))
        .limit(1);

      return c.json({ folder: folderDto(updated, owner ?? null) }, 200);
    },
  )
  .delete(
    '/:id',
    requireRole('admin', 'editor'),
    zValidator('param', z.object({ id: uuidSchema }), validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const folder = await getFolderOrThrow(id);

      await db.execute(sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM folders WHERE id = ${id}
          UNION ALL
          SELECT f.id FROM folders f INNER JOIN subtree s ON f.parent_id = s.id
        )
        UPDATE folders SET deleted_at = now()
        WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL
      `);

      await db.execute(sql`
        WITH RECURSIVE subtree AS (
          SELECT id FROM folders WHERE id = ${id}
          UNION ALL
          SELECT f.id FROM folders f INNER JOIN subtree s ON f.parent_id = s.id
        )
        UPDATE files SET deleted_at = now()
        WHERE folder_id IN (SELECT id FROM subtree) AND deleted_at IS NULL
      `);

      await logActivity({
        userId: user.id,
        action: 'folder.delete',
        targetType: 'folder',
        targetId: folder.id,
        metadata: { name: folder.name },
      });

      return c.json({ ok: true }, 200);
    },
  );
