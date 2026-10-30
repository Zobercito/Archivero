import { zValidator } from '@hono/zod-validator';
import { alias } from 'drizzle-orm/pg-core';
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { fileVersions, files, folders, users } from '../db/schema';
import { fileDto, folderDto } from '../dto';
import { logActivity } from '../lib/activity';
import { HttpError, validationHook } from '../lib/http';
import { deleteObjectKeys } from '../lib/storage';
import { uuidSchema } from '../lib/validation';
import { requireAuth, requireRole, type AppEnv } from '../middleware/auth';

const typeParamSchema = z.object({
  type: z.enum(['folder', 'file']),
  id: uuidSchema,
});

async function deletedFolder(id: string) {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), isNotNull(folders.deletedAt)))
    .limit(1);
  if (!folder) {
    throw new HttpError(404, 'TRASH_ITEM_NOT_FOUND', 'Elemento no encontrado en la papelera.');
  }
  return folder;
}

async function deletedFile(id: string) {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), isNotNull(files.deletedAt)))
    .limit(1);
  if (!file) {
    throw new HttpError(404, 'TRASH_ITEM_NOT_FOUND', 'Elemento no encontrado en la papelera.');
  }
  return file;
}

async function subtreeIds(folderId: string) {
  const result = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM folders WHERE id = ${folderId}
      UNION ALL
      SELECT f.id FROM folders f INNER JOIN subtree s ON f.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  return (result as unknown as Array<{ id: string }>).map((row) => row.id);
}

export const trashRoutes = new Hono<AppEnv>()
  .use('*', requireAuth, requireRole('admin', 'editor'))
  .get('/', async (c) => {
    const parent = alias(folders, 'parent');
    const fileFolder = alias(folders, 'file_folder');

    const folderRows = await db
      .select({ folder: folders, ownerName: users.name })
      .from(folders)
      .leftJoin(parent, eq(folders.parentId, parent.id))
      .leftJoin(users, eq(folders.ownerId, users.id))
      .where(
        and(
          isNotNull(folders.deletedAt),
          or(isNull(folders.parentId), isNull(parent.deletedAt)),
        ),
      )
      .orderBy(sql`lower(${folders.name})`);

    const fileRows = await db
      .select({
        file: files,
        version: fileVersions,
        ownerName: users.name,
        versionCount: sql<number>`(
          select count(*)::int from ${fileVersions}
          where ${fileVersions.fileId} = ${files.id}
        )`,
      })
      .from(files)
      .leftJoin(fileFolder, eq(files.folderId, fileFolder.id))
      .leftJoin(fileVersions, eq(files.currentVersionId, fileVersions.id))
      .leftJoin(users, eq(files.ownerId, users.id))
      .where(
        and(
          isNotNull(files.deletedAt),
          or(isNull(files.folderId), isNull(fileFolder.deletedAt)),
        ),
      )
      .orderBy(sql`lower(${files.name})`);

    return c.json(
      {
        folders: folderRows.map((row) =>
          folderDto(
            row.folder,
            row.ownerName
              ? { id: row.folder.ownerId, name: row.ownerName }
              : null,
          ),
        ),
        files: fileRows.map((row) =>
          fileDto({
            file: row.file,
            version: row.version,
            versionCount: Number(row.versionCount ?? 0),
            owner: row.ownerName
              ? { id: row.file.ownerId, name: row.ownerName }
              : null,
          }),
        ),
      },
      200,
    );
  })
  .post(
    '/:type/:id/restore',
    zValidator('param', typeParamSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { type, id } = c.req.valid('param');

      if (type === 'folder') {
        const folder = await deletedFolder(id);

        if (folder.parentId) {
          const [parent] = await db
            .select({ deletedAt: folders.deletedAt })
            .from(folders)
            .where(eq(folders.id, folder.parentId))
            .limit(1);
          if (parent?.deletedAt) {
            throw new HttpError(
              409,
              'PARENT_DELETED',
              'Restaura primero la carpeta contenedora.',
            );
          }
        }

        await db.execute(sql`
          WITH RECURSIVE subtree AS (
            SELECT id FROM folders WHERE id = ${id}
            UNION ALL
            SELECT f.id FROM folders f INNER JOIN subtree s ON f.parent_id = s.id
          )
          UPDATE folders SET deleted_at = NULL WHERE id IN (SELECT id FROM subtree)
        `);

        await db.execute(sql`
          WITH RECURSIVE subtree AS (
            SELECT id FROM folders WHERE id = ${id}
            UNION ALL
            SELECT f.id FROM folders f INNER JOIN subtree s ON f.parent_id = s.id
          )
          UPDATE files SET deleted_at = NULL
          WHERE folder_id IN (SELECT id FROM subtree)
        `);

        await logActivity({
          userId: user.id,
          action: 'folder.restore',
          targetType: 'folder',
          targetId: id,
          metadata: { name: folder.name },
        });
      } else {
        const file = await deletedFile(id);

        if (file.folderId) {
          const [parent] = await db
            .select({ deletedAt: folders.deletedAt })
            .from(folders)
            .where(eq(folders.id, file.folderId))
            .limit(1);
          if (parent?.deletedAt) {
            throw new HttpError(
              409,
              'PARENT_DELETED',
              'Restaura primero la carpeta contenedora.',
            );
          }
        }

        await db
          .update(files)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(eq(files.id, id));

        await logActivity({
          userId: user.id,
          action: 'file.restore',
          targetType: 'file',
          targetId: id,
          metadata: { name: file.name },
        });
      }

      return c.json({ ok: true }, 200);
    },
  )
  .delete(
    '/:type/:id',
    requireRole('admin'),
    zValidator('param', typeParamSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { type, id } = c.req.valid('param');

      if (type === 'folder') {
        const folder = await deletedFolder(id);
        const folderIds = await subtreeIds(id);

        const rows =
          folderIds.length === 0
            ? []
            : await db
                .select({ key: fileVersions.storageKey })
                .from(files)
                .innerJoin(fileVersions, eq(fileVersions.fileId, files.id))
                .where(inArray(files.folderId, folderIds));

        await deleteObjectKeys(rows.map((row) => row.key));
        await db.delete(folders).where(eq(folders.id, id));

        await logActivity({
          userId: user.id,
          action: 'folder.purge',
          targetType: 'folder',
          targetId: id,
          metadata: { name: folder.name, folders: folderIds.length, files: rows.length },
        });
      } else {
        const file = await deletedFile(id);
        const versions = await db
          .select({ key: fileVersions.storageKey })
          .from(fileVersions)
          .where(eq(fileVersions.fileId, id));

        await deleteObjectKeys(versions.map((row) => row.key));
        await db.delete(files).where(eq(files.id, id));

        await logActivity({
          userId: user.id,
          action: 'file.purge',
          targetType: 'file',
          targetId: id,
          metadata: { name: file.name },
        });
      }

      return c.json({ ok: true }, 200);
    },
  );
