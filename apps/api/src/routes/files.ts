import { zValidator } from '@hono/zod-validator';
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  sql,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { fileVersions, files, folders, users } from '../db/schema';
import { fileDto, versionDto } from '../dto';
import { logActivity } from '../lib/activity';
import { HttpError, validationHook } from '../lib/http';
import {
  buildStorageKey,
  createUploadTicket,
  DOWNLOAD_URL_TTL_SECONDS,
  headObject,
  signDownloadUrl,
  signUploadUrl,
  UPLOAD_URL_TTL_SECONDS,
  verifyUploadTicket,
} from '../lib/storage';
import {
  fileNameSchema,
  fileSizeSchema,
  isAllowedFileType,
  uuidSchema,
} from '../lib/validation';
import { requireAuth, requireRole, type AppEnv } from '../middleware/auth';

const listQuerySchema = z.object({
  folderId: uuidSchema.optional(),
});

const uploadSchema = z.object({
  folderId: uuidSchema.nullish(),
  name: fileNameSchema,
  size: fileSizeSchema,
  mimeType: z.string().trim().min(3).max(150),
});

const versionUploadSchema = z.object({
  size: fileSizeSchema,
  mimeType: z.string().trim().min(3).max(150),
});

const confirmSchema = z.object({
  ticket: z.string().min(1),
  checksum: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'La suma de verificación no es válida')
    .optional(),
});

const idParamSchema = z.object({ id: uuidSchema });
const versionParamSchema = z.object({
  id: uuidSchema,
  n: z.coerce.number().int().positive(),
});

async function getFolderNameIfValid(folderId: string | null | undefined) {
  if (!folderId) return null;
  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
    .limit(1);
  if (!folder) {
    throw new HttpError(404, 'FOLDER_NOT_FOUND', 'La carpeta de destino no existe.');
  }
  return folder.id;
}

async function getVersionCount(fileId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId));
  return Number(row?.count ?? 0);
}

async function findFile(fileId: string) {
  const [row] = await db
    .select({
      file: files,
      version: fileVersions,
      ownerName: users.name,
    })
    .from(files)
    .leftJoin(fileVersions, eq(files.currentVersionId, fileVersions.id))
    .leftJoin(users, eq(files.ownerId, users.id))
    .where(and(eq(files.id, fileId), isNull(files.deletedAt)))
    .limit(1);

  return row ?? null;
}

async function nextVersionNumber(fileId: string) {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${fileVersions.versionNumber}), 0)::int`,
    })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId));
  return Number(row?.max ?? 0) + 1;
}

async function requireFile(fileId: string) {
  const row = await findFile(fileId);
  if (!row) throw new HttpError(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
  return row;
}

function dtoFromRow(
  row: NonNullable<Awaited<ReturnType<typeof findFile>>>,
  versionCount: number,
) {
  return fileDto({
    file: row.file,
    version: row.version,
    versionCount,
    owner: row.ownerName ? { id: row.file.ownerId, name: row.ownerName } : null,
  });
}

export const filesRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get(
    '/',
    zValidator('query', listQuerySchema, validationHook),
    async (c) => {
      const { folderId } = c.req.valid('query');

      const rows = await db
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
        .leftJoin(fileVersions, eq(files.currentVersionId, fileVersions.id))
        .leftJoin(users, eq(files.ownerId, users.id))
        .where(
          and(
            isNull(files.deletedAt),
            folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
          ),
        )
        .orderBy(asc(sql`lower(${files.name})`));

      return c.json(
        {
          files: rows.map((row) =>
            dtoFromRow(
              { file: row.file, version: row.version, ownerName: row.ownerName },
              Number(row.versionCount ?? 0),
            ),
          ),
        },
        200,
      );
    },
  )
  .post(
    '/upload-url',
    requireRole('admin', 'editor'),
    zValidator('json', uploadSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const input = c.req.valid('json');

      if (!isAllowedFileType(input.name, input.mimeType)) {
        throw new HttpError(
          400,
          'FILE_TYPE_NOT_ALLOWED',
          'Ese tipo de archivo no está permitido.',
        );
      }

      const folderId = await getFolderNameIfValid(input.folderId);

      const [created] = await db
        .insert(files)
        .values({
          folderId,
          name: input.name,
          ownerId: user.id,
          status: 'pending',
        })
        .returning();

      if (!created) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo preparar la subida.');

      const versionNumber = 1;
      const key = buildStorageKey(created.id, versionNumber, input.name);

      try {
        const uploadUrl = await signUploadUrl(key, input.mimeType);
        const ticket = await createUploadTicket({
          userId: user.id,
          fileId: created.id,
          versionNumber,
          key,
          size: input.size,
          mimeType: input.mimeType,
        });

        return c.json(
          {
            file: fileDto({
              file: created,
              version: null,
              versionCount: 0,
              owner: { id: user.id, name: user.name },
            }),
            uploadUrl,
            ticket,
            expiresIn: UPLOAD_URL_TTL_SECONDS,
          },
          201,
        );
      } catch (error) {
        await db.delete(files).where(eq(files.id, created.id));
        throw error;
      }
    },
  )
  .post(
    '/:id/confirm',
    requireRole('admin', 'editor'),
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', confirmSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const { ticket, checksum } = c.req.valid('json');
      const payload = await verifyUploadTicket(ticket);

      if (payload.userId !== user.id || payload.fileId !== id) {
        throw new HttpError(400, 'INVALID_UPLOAD_TICKET', 'El comprobante no corresponde.');
      }

      const row = await requireFile(id);
      if (row.file.status !== 'pending') {
        throw new HttpError(409, 'ALREADY_CONFIRMED', 'Este archivo ya fue confirmado.');
      }

      const stored = await headObject(payload.key);
      if (!stored) {
        throw new HttpError(
          409,
          'UPLOAD_INCOMPLETE',
          'El archivo todavía no está en el almacenamiento.',
        );
      }

      if (stored.size !== payload.size) {
        throw new HttpError(
          409,
          'SIZE_MISMATCH',
          'El tamaño recibido no coincide con el declarado.',
        );
      }

      const [version] = await db
        .insert(fileVersions)
        .values({
          fileId: id,
          versionNumber: payload.versionNumber,
          storageKey: payload.key,
          size: payload.size,
          mimeType: payload.mimeType,
          checksum: checksum?.toLowerCase() ?? null,
          createdBy: user.id,
        })
        .returning();

      if (!version) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo guardar la versión.');

      const [updated] = await db
        .update(files)
        .set({
          status: 'ready',
          currentVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(files.id, id))
        .returning();

      if (!updated) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo confirmar.');

      await logActivity({
        userId: user.id,
        action: 'file.upload',
        targetType: 'file',
        targetId: id,
        metadata: { name: updated.name, size: version.size, version: version.versionNumber },
      });

      return c.json(
        {
          file: fileDto({
            file: updated,
            version,
            versionCount: 1,
            owner: { id: user.id, name: user.name },
          }),
        },
        201,
      );
    },
  )
  .get(
    '/:id',
    zValidator('param', idParamSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param');
      const row = await requireFile(id);
      return c.json(
        { file: dtoFromRow(row, await getVersionCount(id)) },
        200,
      );
    },
  )
  .get(
    '/:id/download',
    zValidator('param', idParamSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const row = await requireFile(id);

      if (row.file.status !== 'ready' || !row.version) {
        throw new HttpError(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const url = await signDownloadUrl(row.version.storageKey, row.file.name);
      await logActivity({
        userId: user.id,
        action: 'file.download',
        targetType: 'file',
        targetId: id,
        metadata: { name: row.file.name },
      });

      return c.json(
        {
          url,
          fileName: row.file.name,
          mimeType: row.version.mimeType,
          size: row.version.size,
          expiresIn: DOWNLOAD_URL_TTL_SECONDS,
        },
        200,
      );
    },
  )
  .patch(
    '/:id',
    requireRole('admin', 'editor'),
    zValidator('param', idParamSchema, validationHook),
    zValidator(
      'json',
      z
        .object({
          name: fileNameSchema.optional(),
          folderId: uuidSchema.nullish(),
        })
        .refine((value) => value.name !== undefined || value.folderId !== undefined, {
          message: 'Indica al menos un cambio',
        }),
      validationHook,
    ),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const row = await requireFile(id);

      if (
        input.name &&
        row.version &&
        !isAllowedFileType(input.name, row.version.mimeType)
      ) {
        throw new HttpError(
          400,
          'FILE_TYPE_NOT_ALLOWED',
          'La nueva extensión no coincide con el contenido del archivo.',
        );
      }

      const folderId =
        input.folderId === undefined
          ? undefined
          : await getFolderNameIfValid(input.folderId);

      const [updated] = await db
        .update(files)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(folderId === undefined ? {} : { folderId }),
          updatedAt: new Date(),
        })
        .where(eq(files.id, id))
        .returning();

      if (!updated) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo actualizar.');

      await logActivity({
        userId: user.id,
        action: 'file.update',
        targetType: 'file',
        targetId: id,
        metadata: {
          previousName: row.file.name,
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
        },
      });

      return c.json(
        {
          file: fileDto({
            file: updated,
            version: row.version,
            versionCount: await getVersionCount(id),
            owner: row.ownerName
              ? { id: updated.ownerId, name: row.ownerName }
              : null,
          }),
        },
        200,
      );
    },
  )
  .delete(
    '/:id',
    requireRole('admin', 'editor'),
    zValidator('param', idParamSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const row = await requireFile(id);

      await db
        .update(files)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(files.id, id));

      await logActivity({
        userId: user.id,
        action: 'file.delete',
        targetType: 'file',
        targetId: id,
        metadata: { name: row.file.name },
      });

      return c.json({ ok: true }, 200);
    },
  )
  .get(
    '/:id/versions',
    zValidator('param', idParamSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param');
      await requireFile(id);

      const rows = await db
        .select({ version: fileVersions, authorName: users.name })
        .from(fileVersions)
        .leftJoin(users, eq(fileVersions.createdBy, users.id))
        .where(eq(fileVersions.fileId, id))
        .orderBy(desc(fileVersions.versionNumber));

      return c.json(
        {
          versions: rows.map((row) =>
            versionDto(
              row.version,
              row.authorName && row.version.createdBy
                ? { id: row.version.createdBy, name: row.authorName }
                : null,
            ),
          ),
        },
        200,
      );
    },
  )
  .post(
    '/:id/versions/upload-url',
    requireRole('admin', 'editor'),
    zValidator('param', idParamSchema, validationHook),
    zValidator('json', versionUploadSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');
      const row = await requireFile(id);

      if (row.file.status !== 'ready') {
        throw new HttpError(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      if (!isAllowedFileType(row.file.name, input.mimeType)) {
        throw new HttpError(
          400,
          'FILE_TYPE_NOT_ALLOWED',
          'La nueva versión debe conservar el tipo del archivo.',
        );
      }

      const versionNumber = await nextVersionNumber(id);
      const key = buildStorageKey(id, versionNumber, row.file.name);
      const uploadUrl = await signUploadUrl(key, input.mimeType);
      const ticket = await createUploadTicket({
        userId: user.id,
        fileId: id,
        versionNumber,
        key,
        size: input.size,
        mimeType: input.mimeType,
      });

      return c.json(
        { versionNumber, uploadUrl, ticket, expiresIn: UPLOAD_URL_TTL_SECONDS },
        201,
      );
    },
  )
  .post(
    '/:id/versions/:n/confirm',
    requireRole('admin', 'editor'),
    zValidator('param', versionParamSchema, validationHook),
    zValidator('json', confirmSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id, n } = c.req.valid('param');
      const { ticket, checksum } = c.req.valid('json');
      const payload = await verifyUploadTicket(ticket);

      if (
        payload.userId !== user.id ||
        payload.fileId !== id ||
        payload.versionNumber !== n
      ) {
        throw new HttpError(400, 'INVALID_UPLOAD_TICKET', 'El comprobante no corresponde.');
      }

      const row = await requireFile(id);
      if (row.file.status !== 'ready') {
        throw new HttpError(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const stored = await headObject(payload.key);
      if (!stored) {
        throw new HttpError(
          409,
          'UPLOAD_INCOMPLETE',
          'La versión todavía no está en el almacenamiento.',
        );
      }
      if (stored.size !== payload.size) {
        throw new HttpError(409, 'SIZE_MISMATCH', 'El tamaño no coincide con lo declarado.');
      }

      let version: typeof fileVersions.$inferSelect | undefined;
      try {
        [version] = await db
          .insert(fileVersions)
          .values({
            fileId: id,
            versionNumber: n,
            storageKey: payload.key,
            size: payload.size,
            mimeType: payload.mimeType,
            checksum: checksum?.toLowerCase() ?? null,
            createdBy: user.id,
          })
          .returning();
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new HttpError(409, 'VERSION_CONFLICT', 'Esa versión ya existe.');
        }
        throw error;
      }

      if (!version) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo guardar la versión.');

      await db
        .update(files)
        .set({ currentVersionId: version.id, updatedAt: new Date() })
        .where(eq(files.id, id));

      await logActivity({
        userId: user.id,
        action: 'file.version.create',
        targetType: 'file',
        targetId: id,
        metadata: { name: row.file.name, version: n, size: version.size },
      });

      return c.json(
        {
          version: versionDto(version, { id: user.id, name: user.name }),
        },
        201,
      );
    },
  )
  .post(
    '/:id/versions/:n/restore',
    requireRole('admin', 'editor'),
    zValidator('param', versionParamSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id, n } = c.req.valid('param');
      const row = await requireFile(id);

      if (row.file.status !== 'ready') {
        throw new HttpError(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const [source] = await db
        .select()
        .from(fileVersions)
        .where(and(eq(fileVersions.fileId, id), eq(fileVersions.versionNumber, n)))
        .limit(1);

      if (!source) {
        throw new HttpError(404, 'VERSION_NOT_FOUND', 'Esa versión no existe.');
      }

      const versionNumber = await nextVersionNumber(id);
      const [restored] = await db
        .insert(fileVersions)
        .values({
          fileId: id,
          versionNumber,
          storageKey: source.storageKey,
          size: source.size,
          mimeType: source.mimeType,
          checksum: source.checksum,
          createdBy: user.id,
        })
        .returning();

      if (!restored) {
        throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo restaurar la versión.');
      }

      await db
        .update(files)
        .set({ currentVersionId: restored.id, updatedAt: new Date() })
        .where(eq(files.id, id));

      await logActivity({
        userId: user.id,
        action: 'file.version.restore',
        targetType: 'file',
        targetId: id,
        metadata: { name: row.file.name, from: n, to: versionNumber },
      });

      return c.json(
        {
          version: versionDto(restored, { id: user.id, name: user.name }),
        },
        201,
      );
    },
  );
