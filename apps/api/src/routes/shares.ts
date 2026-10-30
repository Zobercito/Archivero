import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { fileVersions, files, shareLinks, users } from '../db/schema';
import { shareLinkDto } from '../dto';
import { env } from '../env';
import { logActivity } from '../lib/activity';
import { HttpError, validationHook } from '../lib/http';
import { rateLimit } from '../lib/rate-limit';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  generateShareToken,
  hashToken,
  signDownloadUrl,
} from '../lib/storage';
import { uuidSchema } from '../lib/validation';
import { requireAuth, requireRole, type AppEnv } from '../middleware/auth';

const createShareSchema = z
  .object({
    expiresAt: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida')
      .nullish(),
    maxDownloads: z.coerce.number().int().min(1).max(100_000).nullish(),
  })
  .refine(
    (value) => Boolean(value.expiresAt) || Boolean(value.maxDownloads),
    'Indica una fecha de caducidad o un límite de descargas',
  );

const idParamSchema = z.object({ id: uuidSchema });
const fileParamSchema = z.object({ id: uuidSchema });
const tokenParamSchema = z.object({ token: z.string().min(10).max(200) });

type ShareWithFile = {
  link: typeof shareLinks.$inferSelect;
  file: typeof files.$inferSelect;
  version: typeof fileVersions.$inferSelect | null;
  authorName: string | null;
};

async function findShareByToken(token: string): Promise<ShareWithFile | null> {
  const [row] = await db
    .select({
      link: shareLinks,
      file: files,
      version: fileVersions,
      authorName: users.name,
    })
    .from(shareLinks)
    .innerJoin(files, eq(shareLinks.fileId, files.id))
    .leftJoin(fileVersions, eq(files.currentVersionId, fileVersions.id))
    .leftJoin(users, eq(shareLinks.createdBy, users.id))
    .where(eq(shareLinks.tokenHash, hashToken(token)))
    .limit(1);

  return row ?? null;
}

function shareIsUsable(row: ShareWithFile) {
  const now = Date.now();
  if (row.link.revokedAt) return false;
  if (row.link.expiresAt && row.link.expiresAt.getTime() <= now) return false;
  if (
    row.link.maxDownloads !== null &&
    row.link.downloadCount >= row.link.maxDownloads
  ) {
    return false;
  }
  return (
    row.file.deletedAt === null &&
    row.file.status === 'ready' &&
    row.version !== null
  );
}

function publicBaseUrl() {
  return env.APP_ORIGIN.split(',')[0]?.trim() ?? env.APP_ORIGIN;
}

const publicShares = new Hono<AppEnv>()
  .use('*', rateLimit({ name: 'public-share', limit: 120, windowMs: 60_000 }))
  .get(
    '/:token',
    zValidator('param', tokenParamSchema, validationHook),
    async (c) => {
      const { token } = c.req.valid('param');
      const row = await findShareByToken(token);

      if (!row || !shareIsUsable(row) || !row.version) {
        throw new HttpError(
          404,
          'SHARE_UNAVAILABLE',
          'Este enlace no está disponible.',
        );
      }

      return c.json(
        {
          share: {
            fileName: row.file.name,
            mimeType: row.version.mimeType,
            size: row.version.size,
            versionNumber: row.version.versionNumber,
            sharedAt: row.link.createdAt.toISOString(),
            expiresAt: row.link.expiresAt?.toISOString() ?? null,
            maxDownloads: row.link.maxDownloads,
            downloadCount: row.link.downloadCount,
            remainingDownloads:
              row.link.maxDownloads === null
                ? null
                : Math.max(0, row.link.maxDownloads - row.link.downloadCount),
          },
        },
        200,
      );
    },
  )
  .post(
    '/:token/download',
    zValidator('param', tokenParamSchema, validationHook),
    async (c) => {
      const { token } = c.req.valid('param');
      const tokenHash = hashToken(token);

      const result = await db.execute(sql`
        UPDATE share_links
        SET download_count = download_count + 1
        WHERE token_hash = ${tokenHash}
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
          AND (max_downloads IS NULL OR download_count < max_downloads)
          AND file_id IN (
            SELECT id FROM files
            WHERE deleted_at IS NULL
              AND status = 'ready'
              AND current_version_id IS NOT NULL
          )
        RETURNING id, file_id, download_count, max_downloads
      `);

      const updated = (
        result as unknown as Array<{
          id: string;
          file_id: string;
          download_count: number;
          max_downloads: number | null;
        }>
      )[0];

      if (!updated) {
        throw new HttpError(
          404,
          'SHARE_UNAVAILABLE',
          'Este enlace no está disponible.',
        );
      }

      const [row] = await db
        .select({ file: files, version: fileVersions })
        .from(files)
        .innerJoin(fileVersions, eq(files.currentVersionId, fileVersions.id))
        .where(and(eq(files.id, updated.file_id), isNull(files.deletedAt)))
        .limit(1);

      if (!row) {
        throw new HttpError(
          404,
          'SHARE_UNAVAILABLE',
          'Este enlace no está disponible.',
        );
      }

      const url = await signDownloadUrl(row.version.storageKey, row.file.name);

      await logActivity({
        userId: null,
        action: 'share.download',
        targetType: 'share',
        targetId: updated.id,
        metadata: {
          fileName: row.file.name,
          downloadCount: Number(updated.download_count),
          maxDownloads: updated.max_downloads,
        },
      });

      return c.json(
        {
          url,
          fileName: row.file.name,
          mimeType: row.version.mimeType,
          size: row.version.size,
          expiresIn: DOWNLOAD_URL_TTL_SECONDS,
          remainingDownloads:
            updated.max_downloads === null
              ? null
              : Math.max(
                  0,
                  Number(updated.max_downloads) - Number(updated.download_count),
                ),
        },
        200,
      );
    },
  );

export const sharesRoutes = new Hono<AppEnv>()
  .route('/public/shares', publicShares)
  .post(
    '/files/:id/share-links',
    requireAuth,
    requireRole('admin', 'editor'),
    zValidator('param', fileParamSchema, validationHook),
    zValidator('json', createShareSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');

      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, id), isNull(files.deletedAt)))
        .limit(1);

      if (!file) throw new HttpError(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      if (file.status !== 'ready' || !file.currentVersionId) {
        throw new HttpError(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        throw new HttpError(400, 'INVALID_EXPIRY', 'La fecha debe estar en el futuro.');
      }

      const token = generateShareToken();
      const [created] = await db
        .insert(shareLinks)
        .values({
          fileId: id,
          tokenHash: hashToken(token),
          expiresAt,
          maxDownloads: input.maxDownloads ?? null,
          createdBy: user.id,
        })
        .returning();

      if (!created) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo crear el enlace.');

      await logActivity({
        userId: user.id,
        action: 'share.create',
        targetType: 'share',
        targetId: created.id,
        metadata: {
          fileName: file.name,
          expiresAt: expiresAt?.toISOString() ?? null,
          maxDownloads: created.maxDownloads,
        },
      });

      return c.json(
        {
          link: shareLinkDto(created, { id: user.id, name: user.name }),
          token,
          url: `${publicBaseUrl()}/s/${token}`,
        },
        201,
      );
    },
  )
  .get(
    '/files/:id/share-links',
    requireAuth,
    requireRole('admin', 'editor'),
    zValidator('param', fileParamSchema, validationHook),
    async (c) => {
      const { id } = c.req.valid('param');
      const [file] = await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.id, id), isNull(files.deletedAt)))
        .limit(1);

      if (!file) throw new HttpError(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');

      const rows = await db
        .select({ link: shareLinks, authorName: users.name })
        .from(shareLinks)
        .leftJoin(users, eq(shareLinks.createdBy, users.id))
        .where(eq(shareLinks.fileId, id))
        .orderBy(desc(shareLinks.createdAt));

      return c.json(
        {
          links: rows.map((row) =>
            shareLinkDto(
              row.link,
              row.authorName && row.link.createdBy
                ? { id: row.link.createdBy, name: row.authorName }
                : null,
            ),
          ),
        },
        200,
      );
    },
  )
  .delete(
    '/share-links/:id',
    requireAuth,
    requireRole('admin', 'editor'),
    zValidator('param', idParamSchema, validationHook),
    async (c) => {
      const user = c.get('user');
      const { id } = c.req.valid('param');

      const [link] = await db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.id, id))
        .limit(1);

      if (!link) throw new HttpError(404, 'SHARE_NOT_FOUND', 'Enlace no encontrado.');

      const [updated] = await db
        .update(shareLinks)
        .set({ revokedAt: link.revokedAt ?? new Date() })
        .where(eq(shareLinks.id, id))
        .returning();

      if (!updated) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo revocar.');

      await logActivity({
        userId: user.id,
        action: 'share.revoke',
        targetType: 'share',
        targetId: id,
        metadata: { fileId: link.fileId },
      });

      return c.json(
        {
          link: shareLinkDto(updated, { id: user.id, name: user.name }),
        },
        200,
      );
    },
  );
