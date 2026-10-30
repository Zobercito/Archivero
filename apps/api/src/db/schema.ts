import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'viewer']);
export const fileStatusEnum = pgEnum('file_status', ['pending', 'ready']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('viewer'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, {
      onDelete: 'cascade',
    }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('folders_parent_id_idx').on(table.parentId),
    index('folders_deleted_at_idx').on(table.deletedAt),
  ],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    currentVersionId: uuid('current_version_id'),
    status: fileStatusEnum('status').notNull().default('pending'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('files_folder_id_idx').on(table.folderId),
    index('files_deleted_at_idx').on(table.deletedAt),
    index('files_status_idx').on(table.status),
  ],
);

export const fileVersions = pgTable(
  'file_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    storageKey: text('storage_key').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    mimeType: text('mime_type').notNull(),
    checksum: text('checksum'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('file_versions_file_number_unique').on(table.fileId, table.versionNumber),
    index('file_versions_file_id_idx').on(table.fileId),
  ],
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxDownloads: integer('max_downloads'),
    downloadCount: integer('download_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('share_links_token_hash_unique').on(table.tokenHash),
    index('share_links_file_id_idx').on(table.fileId),
  ],
);

export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('activity_log_created_at_idx').on(table.createdAt),
    index('activity_log_user_id_idx').on(table.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type FileVersionRow = typeof fileVersions.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;
export type ActivityRow = typeof activityLog.$inferSelect;
export type UserRole = (typeof userRoleEnum.enumValues)[number];
