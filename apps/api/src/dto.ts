import type {
  ActivityRow,
  FileRow,
  FileVersionRow,
  FolderRow,
  ShareLinkRow,
  UserRole,
  UserRow,
} from './db/schema';

export type UserDto = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
};

export type FolderDto = {
  id: string;
  name: string;
  parentId: string | null;
  owner: { id: string; name: string } | null;
  createdAt: string;
};

export type FileDto = {
  id: string;
  folderId: string | null;
  name: string;
  status: 'pending' | 'ready';
  size: number | null;
  mimeType: string | null;
  versionNumber: number | null;
  versionCount: number;
  owner: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type VersionDto = {
  id: string;
  fileId: string;
  versionNumber: number;
  size: number;
  mimeType: string;
  checksum: string | null;
  author: { id: string; name: string } | null;
  createdAt: string;
};

export type ShareLinkDto = {
  id: string;
  fileId: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  revokedAt: string | null;
  createdAt: string;
  author: { id: string; name: string } | null;
};

export type ActivityDto = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

export function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function userDto(user: UserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabledAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function folderDto(
  folder: FolderRow,
  owner: { id: string; name: string } | null,
): FolderDto {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    owner,
    createdAt: folder.createdAt.toISOString(),
  };
}

export function fileDto(input: {
  file: FileRow;
  version?: FileVersionRow | null;
  versionCount?: number;
  owner: { id: string; name: string } | null;
}): FileDto {
  return {
    id: input.file.id,
    folderId: input.file.folderId,
    name: input.file.name,
    status: input.file.status,
    size: input.version?.size ?? null,
    mimeType: input.version?.mimeType ?? null,
    versionNumber: input.version?.versionNumber ?? null,
    versionCount: input.versionCount ?? (input.version ? 1 : 0),
    owner: input.owner,
    createdAt: input.file.createdAt.toISOString(),
    updatedAt: input.file.updatedAt.toISOString(),
  };
}

export function versionDto(
  version: FileVersionRow,
  author: { id: string; name: string } | null,
): VersionDto {
  return {
    id: version.id,
    fileId: version.fileId,
    versionNumber: version.versionNumber,
    size: version.size,
    mimeType: version.mimeType,
    checksum: version.checksum,
    author,
    createdAt: version.createdAt.toISOString(),
  };
}

export function shareLinkDto(
  link: ShareLinkRow,
  author: { id: string; name: string } | null,
): ShareLinkDto {
  return {
    id: link.id,
    fileId: link.fileId,
    expiresAt: iso(link.expiresAt),
    maxDownloads: link.maxDownloads,
    downloadCount: link.downloadCount,
    revokedAt: iso(link.revokedAt),
    createdAt: link.createdAt.toISOString(),
    author,
  };
}

export function activityDto(
  entry: ActivityRow,
  user: { id: string; name: string; email: string } | null,
): ActivityDto {
  return {
    id: entry.id,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    createdAt: entry.createdAt.toISOString(),
    user,
  };
}
