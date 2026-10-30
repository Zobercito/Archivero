import type {
  ActivityPage,
  PublicDownload,
  PublicShare,
  Role,
  ShareCreated,
  TrashData,
} from '../lib/types';
import {
  activityDto,
  addVersion,
  currentVersion,
  DEMO_MAX_FILE_SIZE,
  DEMO_UPLOAD_PREFIX,
  type DemoFile,
  type DemoShare,
  type DemoState,
  type DemoUser,
  fileDto,
  folderDto,
  folderSubtreeIds,
  folderTreeNode,
  isAllowedFileType,
  logActivity,
  nextId,
  nextVersionNumber,
  purgeFile,
  sessionUser,
  shareDto,
  trashData,
  userDto,
  versionDto,
  versionUrl,
} from './state';
import { demoState } from './store';

export type DemoRequest = {
  method: string;
  url: URL;
  body: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(status: number, code: string, message: string) {
  return jsonResponse({ error: { code, message } }, status);
}

function bodyOf(request: DemoRequest): Record<string, unknown> {
  return request.body && typeof request.body === 'object'
    ? (request.body as Record<string, unknown>)
    : {};
}

function stringOf(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validName(value: string, max: number) {
  return value.length >= 1 && value.length <= max && !/[/\\\p{Cc}]/u.test(value);
}

function isRole(value: string): value is Role {
  return value === 'admin' || value === 'editor' || value === 'viewer';
}

function activeFolder(state: DemoState, id: string) {
  return state.folders.find((folder) => folder.id === id && !folder.deletedAt);
}

function activeFile(state: DemoState, id: string) {
  return state.files.find((file) => file.id === id && !file.deletedAt);
}

function destinationId(value: unknown): { ok: boolean; value: string | null } {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') return { ok: false, value: null };
  return { ok: true, value };
}

function movingIntoSubtree(state: DemoState, folderId: string, destinationIdValue: string) {
  let cursor: string | null = destinationIdValue;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === folderId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = state.folders.find((folder) => folder.id === cursor)?.parentId ?? null;
  }
  return false;
}

function shareIsUsable(state: DemoState, link: DemoShare) {
  if (link.revokedAt) return false;
  if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return false;
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) return false;
  const file = activeFile(state, link.fileId);
  if (file?.status !== 'ready') return false;
  return currentVersion(state, file) !== null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checksumOf(body: Record<string, unknown>) {
  const raw = body.checksum;
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string' || !/^[a-fA-F0-9]{64}$/.test(raw)) {
    return { ok: false, value: null };
  }
  return { ok: true, value: raw.toLowerCase() };
}

function sortByName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

export async function handleDemoRequest(request: DemoRequest): Promise<Response> {
  const state = demoState();
  const method = request.method.toUpperCase();
  const parts = request.url.pathname.split('/').filter(Boolean).slice(1);
  const body = bodyOf(request);
  const first = parts[0] ?? '';

  if (first === 'health') {
    return jsonResponse({ ok: true, service: 'archivero-demo' });
  }

  if (first === 'auth') {
    if (parts[1] === 'login' && method === 'POST') {
      const email = stringOf(body.email).trim().toLowerCase();
      const password = stringOf(body.password);
      const account = state.users.find((user) => user.email === email);
      if (!account || account.disabled || account.password !== password) {
        return fail(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
      }
      state.sessionUserId = account.id;
      logActivity(state, {
        userId: account.id,
        action: 'session.login',
        targetType: 'session',
        targetId: account.id,
      });
      return jsonResponse({ user: userDto(account) });
    }

    if (parts[1] === 'logout' && method === 'POST') {
      state.sessionUserId = null;
      return jsonResponse({ ok: true });
    }

    if (parts[1] === 'me' && method === 'GET') {
      const account = sessionUser(state);
      if (!account) return fail(401, 'UNAUTHENTICATED', 'Sesión no iniciada.');
      return jsonResponse({ user: userDto(account) });
    }

    return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
  }

  if (first === 'public' && parts[1] === 'shares') {
    const token = parts[2] ? decodeURIComponent(parts[2]) : '';
    const link = state.shares.find((item) => item.token === token);
    const usable = link ? shareIsUsable(state, link) : false;
    const file = link ? activeFile(state, link.fileId) : undefined;
    const version = file ? currentVersion(state, file) : null;

    if (parts.length === 3 && method === 'GET') {
      if (!link || !usable || !file || !version) {
        return fail(404, 'SHARE_UNAVAILABLE', 'Este enlace no está disponible.');
      }
      const share: PublicShare = {
        fileName: file.name,
        mimeType: version.mimeType,
        size: version.size,
        versionNumber: version.versionNumber,
        sharedAt: link.createdAt,
        expiresAt: link.expiresAt,
        maxDownloads: link.maxDownloads,
        downloadCount: link.downloadCount,
        remainingDownloads:
          link.maxDownloads === null ? null : Math.max(0, link.maxDownloads - link.downloadCount),
      };
      return jsonResponse({ share });
    }

    if (parts.length === 4 && parts[3] === 'download' && method === 'POST') {
      if (!link || !usable || !file || !version) {
        return fail(404, 'SHARE_UNAVAILABLE', 'Este enlace no está disponible.');
      }
      link.downloadCount += 1;
      logActivity(state, {
        userId: null,
        action: 'share.download',
        targetType: 'share',
        targetId: link.id,
        metadata: {
          fileName: file.name,
          downloadCount: link.downloadCount,
          maxDownloads: link.maxDownloads,
        },
      });
      const download: PublicDownload = {
        url: versionUrl(state, version),
        fileName: file.name,
        mimeType: version.mimeType,
        size: version.size,
        expiresIn: 900,
        remainingDownloads:
          link.maxDownloads === null ? null : Math.max(0, link.maxDownloads - link.downloadCount),
      };
      return jsonResponse(download);
    }

    return fail(404, 'SHARE_UNAVAILABLE', 'Este enlace no está disponible.');
  }

  const user = sessionUser(state);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Tu sesión terminó.');
  const canEdit = user.role === 'admin' || user.role === 'editor';
  const admin = user.role === 'admin';

  if (first === 'users') {
    if (!admin) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');

    if (parts.length === 1 && method === 'GET') {
      const users = [...state.users].sort(sortByName).map(userDto);
      return jsonResponse({ users });
    }

    if (parts.length === 1 && method === 'POST') {
      const name = stringOf(body.name).trim();
      const email = stringOf(body.email).trim().toLowerCase();
      const password = stringOf(body.password);
      const roleValue = stringOf(body.role) || 'viewer';

      if (
        name.length < 2 ||
        name.length > 120 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        password.length < 10 ||
        password.length > 128 ||
        !isRole(roleValue)
      ) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }

      if (state.users.some((item) => item.email === email)) {
        return fail(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese correo.');
      }

      const created: DemoUser = {
        id: nextId(state, 'user'),
        name,
        email,
        password,
        role: roleValue,
        disabled: false,
        createdAt: new Date().toISOString(),
      };
      state.users.push(created);
      logActivity(state, {
        userId: user.id,
        action: 'user.create',
        targetType: 'user',
        targetId: created.id,
        metadata: { email: created.email, role: created.role },
      });
      return jsonResponse({ user: userDto(created) }, 201);
    }

    if (parts.length === 2 && method === 'PATCH') {
      const id = decodeURIComponent(parts[1] ?? '');
      const target = state.users.find((item) => item.id === id);
      if (!target) return fail(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');

      const hasRole = Object.hasOwn(body, 'role');
      const hasDisabled = Object.hasOwn(body, 'disabled');
      if (!hasRole && !hasDisabled) {
        return fail(400, 'VALIDATION_ERROR', 'Indica al menos un cambio.');
      }
      if (hasDisabled && typeof body.disabled !== 'boolean') {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }

      const nextRole = hasRole ? stringOf(body.role) : target.role;
      if (!isRole(nextRole)) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }
      const nextDisabled = hasDisabled ? body.disabled === true : target.disabled;

      if (target.id === user.id && (hasRole || nextDisabled === true)) {
        return fail(
          409,
          'CANNOT_MODIFY_SELF',
          'No puedes cambiar tu propio rol ni deshabilitar tu cuenta.',
        );
      }

      const removesAdmin =
        target.role === 'admin' &&
        ((hasRole && nextRole !== 'admin') || (hasDisabled && nextDisabled === true));
      if (
        removesAdmin &&
        !state.users.some(
          (item) => item.id !== target.id && item.role === 'admin' && !item.disabled,
        )
      ) {
        return fail(409, 'LAST_ADMIN', 'Debe quedar al menos un administrador activo.');
      }

      target.role = nextRole;
      target.disabled = nextDisabled;
      logActivity(state, {
        userId: user.id,
        action: 'user.update',
        targetType: 'user',
        targetId: target.id,
        metadata: {
          ...(hasRole ? { role: nextRole } : {}),
          ...(hasDisabled ? { disabled: nextDisabled } : {}),
        },
      });
      return jsonResponse({ user: userDto(target) });
    }

    return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
  }

  if (first === 'folders') {
    if (parts.length === 1 && method === 'GET') {
      const parentId = request.url.searchParams.get('parentId');
      const folders = state.folders
        .filter(
          (folder) =>
            !folder.deletedAt &&
            (parentId ? folder.parentId === parentId : folder.parentId === null),
        )
        .sort(sortByName)
        .map((folder) => folderDto(state, folder));
      return jsonResponse({ folders });
    }

    if (parts.length === 2 && parts[1] === 'tree' && method === 'GET') {
      const folders = state.folders
        .filter((folder) => !folder.deletedAt)
        .sort(sortByName)
        .map(folderTreeNode);
      return jsonResponse({ folders });
    }

    if (parts.length === 1 && method === 'POST') {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const name = stringOf(body.name).trim();
      if (!validName(name, 120)) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }
      const parent = destinationId(body.parentId);
      if (!parent.ok) return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      if (parent.value && !activeFolder(state, parent.value)) {
        return fail(404, 'FOLDER_NOT_FOUND', 'Carpeta no encontrada.');
      }

      const created = {
        id: nextId(state, 'folder'),
        name,
        parentId: parent.value,
        ownerId: user.id,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      };
      state.folders.push(created);
      logActivity(state, {
        userId: user.id,
        action: 'folder.create',
        targetType: 'folder',
        targetId: created.id,
        metadata: { name: created.name },
      });
      return jsonResponse({ folder: folderDto(state, created) }, 201);
    }

    if (parts.length === 2 && (method === 'PATCH' || method === 'DELETE')) {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const folder = activeFolder(state, id);
      if (!folder) return fail(404, 'FOLDER_NOT_FOUND', 'Carpeta no encontrada.');

      if (method === 'DELETE') {
        const ids = folderSubtreeIds(state, folder.id);
        const now = new Date().toISOString();
        for (const item of state.folders) {
          if (ids.has(item.id)) item.deletedAt = item.deletedAt ?? now;
        }
        for (const file of state.files) {
          if (file.folderId && ids.has(file.folderId)) {
            file.deletedAt = file.deletedAt ?? now;
            file.updatedAt = now;
          }
        }
        logActivity(state, {
          userId: user.id,
          action: 'folder.delete',
          targetType: 'folder',
          targetId: folder.id,
          metadata: { name: folder.name },
        });
        return jsonResponse({ ok: true });
      }

      const hasName = Object.hasOwn(body, 'name');
      const hasParent = Object.hasOwn(body, 'parentId');
      if (!hasName && !hasParent) {
        return fail(400, 'VALIDATION_ERROR', 'Indica al menos un cambio.');
      }

      let nextParent = folder.parentId;
      if (hasParent) {
        const parent = destinationId(body.parentId);
        if (!parent.ok) return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
        if (parent.value && !activeFolder(state, parent.value)) {
          return fail(404, 'FOLDER_NOT_FOUND', 'Carpeta no encontrada.');
        }
        if (parent.value && movingIntoSubtree(state, folder.id, parent.value)) {
          return fail(400, 'INVALID_MOVE', 'No puedes mover una carpeta dentro de sí misma.');
        }
        nextParent = parent.value;
      }

      const previousName = folder.name;
      if (hasName) {
        const name = stringOf(body.name).trim();
        if (!validName(name, 120)) {
          return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
        }
        folder.name = name;
      }
      if (hasParent) folder.parentId = nextParent;

      logActivity(state, {
        userId: user.id,
        action: 'folder.update',
        targetType: 'folder',
        targetId: folder.id,
        metadata: {
          previousName,
          ...(hasName ? { name: folder.name } : {}),
          ...(hasParent ? { parentId: nextParent } : {}),
        },
      });
      return jsonResponse({ folder: folderDto(state, folder) });
    }

    return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
  }

  if (first === 'files') {
    if (parts.length === 1 && method === 'GET') {
      const folderId = request.url.searchParams.get('folderId');
      const files = state.files
        .filter(
          (file) =>
            !file.deletedAt && (folderId ? file.folderId === folderId : file.folderId === null),
        )
        .sort(sortByName)
        .map((file) => fileDto(state, file));
      return jsonResponse({ files });
    }

    if (parts.length === 2 && parts[1] === 'upload-url' && method === 'POST') {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const name = stringOf(body.name).trim();
      const size = numberOf(body.size);
      const mimeType = stringOf(body.mimeType).trim();
      const folder = destinationId(body.folderId);

      if (
        !validName(name, 200) ||
        size === null ||
        !Number.isInteger(size) ||
        size <= 0 ||
        size > DEMO_MAX_FILE_SIZE ||
        mimeType.length < 3 ||
        mimeType.length > 150 ||
        !folder.ok
      ) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }
      if (!isAllowedFileType(name, mimeType)) {
        return fail(400, 'FILE_TYPE_NOT_ALLOWED', 'Ese tipo de archivo no está permitido.');
      }
      if (folder.value && !activeFolder(state, folder.value)) {
        return fail(404, 'FOLDER_NOT_FOUND', 'La carpeta de destino no existe.');
      }

      const now = new Date().toISOString();
      const file: DemoFile = {
        id: nextId(state, 'file'),
        folderId: folder.value,
        name,
        ownerId: user.id,
        status: 'pending',
        currentVersionId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      state.files.push(file);

      const key = `demo/${file.id}/v1`;
      const ticket = nextId(state, 'ticket');
      state.pending.set(ticket, {
        userId: user.id,
        fileId: file.id,
        versionNumber: 1,
        key,
        size,
        mimeType,
      });

      return jsonResponse(
        {
          file: fileDto(state, file),
          uploadUrl: `${DEMO_UPLOAD_PREFIX}${encodeURIComponent(ticket)}`,
          ticket,
          expiresIn: 900,
        },
        201,
      );
    }

    if (parts.length === 2 && parts[1] !== 'upload-url') {
      const id = decodeURIComponent(parts[1] ?? '');
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');

      if (method === 'GET') {
        return jsonResponse({ file: fileDto(state, file) });
      }

      if (method === 'PATCH') {
        if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
        const hasName = Object.hasOwn(body, 'name');
        const hasFolder = Object.hasOwn(body, 'folderId');
        if (!hasName && !hasFolder) {
          return fail(400, 'VALIDATION_ERROR', 'Indica al menos un cambio.');
        }

        let nextName = file.name;
        if (hasName) {
          nextName = stringOf(body.name).trim();
          if (!validName(nextName, 200)) {
            return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
          }
          const version = currentVersion(state, file);
          if (version && !isAllowedFileType(nextName, version.mimeType)) {
            return fail(
              400,
              'FILE_TYPE_NOT_ALLOWED',
              'La nueva extensión no coincide con el contenido del archivo.',
            );
          }
        }

        let nextFolder = file.folderId;
        if (hasFolder) {
          const folder = destinationId(body.folderId);
          if (!folder.ok) {
            return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
          }
          if (folder.value && !activeFolder(state, folder.value)) {
            return fail(404, 'FOLDER_NOT_FOUND', 'La carpeta de destino no existe.');
          }
          nextFolder = folder.value;
        }

        const previousName = file.name;
        file.name = nextName;
        file.folderId = nextFolder;
        file.updatedAt = new Date().toISOString();
        logActivity(state, {
          userId: user.id,
          action: 'file.update',
          targetType: 'file',
          targetId: file.id,
          metadata: {
            previousName,
            ...(hasName ? { name: nextName } : {}),
            ...(hasFolder ? { folderId: nextFolder } : {}),
          },
        });
        return jsonResponse({ file: fileDto(state, file) });
      }

      if (method === 'DELETE') {
        if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
        const now = new Date().toISOString();
        file.deletedAt = now;
        file.updatedAt = now;
        logActivity(state, {
          userId: user.id,
          action: 'file.delete',
          targetType: 'file',
          targetId: file.id,
          metadata: { name: file.name },
        });
        return jsonResponse({ ok: true });
      }

      return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
    }

    if (parts.length === 3 && parts[2] === 'confirm' && method === 'POST') {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');

      const ticket = stringOf(body.ticket);
      const pending = state.pending.get(ticket);
      if (!pending || pending.userId !== user.id || pending.fileId !== file.id) {
        return fail(400, 'INVALID_UPLOAD_TICKET', 'El comprobante no corresponde.');
      }
      if (file.status !== 'pending') {
        return fail(409, 'ALREADY_CONFIRMED', 'Este archivo ya fue confirmado.');
      }
      if (!pending.blob) {
        return fail(409, 'UPLOAD_INCOMPLETE', 'El archivo todavía no está en el almacenamiento.');
      }
      if (pending.blob.size !== pending.size) {
        return fail(409, 'SIZE_MISMATCH', 'El tamaño recibido no coincide con el declarado.');
      }
      const checksum = checksumOf(body);
      if (!checksum.ok) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }

      const version = addVersion(state, {
        fileId: file.id,
        versionNumber: 1,
        storageKey: pending.key,
        blob: pending.blob,
        mimeType: pending.mimeType,
        checksum: checksum.value,
        createdBy: user.id,
      });
      file.status = 'ready';
      file.currentVersionId = version.id;
      file.updatedAt = version.createdAt;
      state.pending.delete(ticket);

      logActivity(state, {
        userId: user.id,
        action: 'file.upload',
        targetType: 'file',
        targetId: file.id,
        metadata: { name: file.name, size: version.size, version: 1 },
      });
      return jsonResponse({ file: fileDto(state, file) }, 201);
    }

    if (parts.length === 3 && parts[2] === 'download' && method === 'GET') {
      const id = decodeURIComponent(parts[1] ?? '');
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      const version = currentVersion(state, file);
      if (file.status !== 'ready' || !version) {
        return fail(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }
      logActivity(state, {
        userId: user.id,
        action: 'file.download',
        targetType: 'file',
        targetId: file.id,
        metadata: { name: file.name },
      });
      return jsonResponse({
        url: versionUrl(state, version),
        fileName: file.name,
        mimeType: version.mimeType,
        size: version.size,
        expiresIn: 900,
      });
    }

    if (parts.length === 3 && parts[2] === 'versions' && method === 'GET') {
      const id = decodeURIComponent(parts[1] ?? '');
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      const versions = state.versions
        .filter((version) => version.fileId === file.id)
        .sort((a, b) => b.versionNumber - a.versionNumber)
        .map((version) => versionDto(state, version));
      return jsonResponse({ versions });
    }

    if (
      parts.length === 4 &&
      parts[2] === 'versions' &&
      parts[3] === 'upload-url' &&
      method === 'POST'
    ) {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      if (file.status !== 'ready') {
        return fail(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const size = numberOf(body.size);
      const mimeType = stringOf(body.mimeType).trim();
      if (
        size === null ||
        !Number.isInteger(size) ||
        size <= 0 ||
        size > DEMO_MAX_FILE_SIZE ||
        mimeType.length < 3 ||
        mimeType.length > 150
      ) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }
      if (!isAllowedFileType(file.name, mimeType)) {
        return fail(
          400,
          'FILE_TYPE_NOT_ALLOWED',
          'La nueva versión debe conservar el tipo del archivo.',
        );
      }

      const versionNumber = nextVersionNumber(state, file.id);
      const key = `demo/${file.id}/v${versionNumber}`;
      const ticket = nextId(state, 'ticket');
      state.pending.set(ticket, {
        userId: user.id,
        fileId: file.id,
        versionNumber,
        key,
        size,
        mimeType,
      });

      return jsonResponse(
        {
          versionNumber,
          uploadUrl: `${DEMO_UPLOAD_PREFIX}${encodeURIComponent(ticket)}`,
          ticket,
          expiresIn: 900,
        },
        201,
      );
    }

    if (
      parts.length === 5 &&
      parts[2] === 'versions' &&
      parts[4] === 'confirm' &&
      method === 'POST'
    ) {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const n = Number(parts[3]);
      if (!Number.isInteger(n) || n <= 0) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      if (file.status !== 'ready') {
        return fail(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const ticket = stringOf(body.ticket);
      const pending = state.pending.get(ticket);
      if (
        !pending ||
        pending.userId !== user.id ||
        pending.fileId !== file.id ||
        pending.versionNumber !== n
      ) {
        return fail(400, 'INVALID_UPLOAD_TICKET', 'El comprobante no corresponde.');
      }
      if (
        state.versions.some((version) => version.fileId === file.id && version.versionNumber === n)
      ) {
        return fail(409, 'VERSION_CONFLICT', 'Esa versión ya existe.');
      }
      if (!pending.blob) {
        return fail(409, 'UPLOAD_INCOMPLETE', 'La versión todavía no está en el almacenamiento.');
      }
      if (pending.blob.size !== pending.size) {
        return fail(409, 'SIZE_MISMATCH', 'El tamaño no coincide con lo declarado.');
      }
      const checksum = checksumOf(body);
      if (!checksum.ok) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }

      const version = addVersion(state, {
        fileId: file.id,
        versionNumber: n,
        storageKey: pending.key,
        blob: pending.blob,
        mimeType: pending.mimeType,
        checksum: checksum.value,
        createdBy: user.id,
      });
      file.currentVersionId = version.id;
      file.updatedAt = version.createdAt;
      state.pending.delete(ticket);

      logActivity(state, {
        userId: user.id,
        action: 'file.version.create',
        targetType: 'file',
        targetId: file.id,
        metadata: { name: file.name, version: n, size: version.size },
      });
      return jsonResponse({ version: versionDto(state, version) }, 201);
    }

    if (
      parts.length === 5 &&
      parts[2] === 'versions' &&
      parts[4] === 'restore' &&
      method === 'POST'
    ) {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const n = Number(parts[3]);
      if (!Number.isInteger(n) || n <= 0) {
        return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
      }
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      if (file.status !== 'ready') {
        return fail(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }
      const source = state.versions.find(
        (version) => version.fileId === file.id && version.versionNumber === n,
      );
      if (!source) {
        return fail(404, 'VERSION_NOT_FOUND', 'Esa versión no existe.');
      }

      const versionNumber = nextVersionNumber(state, file.id);
      const blob = state.blobs.get(source.storageKey) ?? new Blob([], { type: source.mimeType });
      const restored = addVersion(state, {
        fileId: file.id,
        versionNumber,
        storageKey: source.storageKey,
        blob,
        mimeType: source.mimeType,
        checksum: source.checksum,
        createdBy: user.id,
      });
      file.currentVersionId = restored.id;
      file.updatedAt = restored.createdAt;

      logActivity(state, {
        userId: user.id,
        action: 'file.version.restore',
        targetType: 'file',
        targetId: file.id,
        metadata: { name: file.name, from: n, to: versionNumber },
      });
      return jsonResponse({ version: versionDto(state, restored) }, 201);
    }

    if (parts.length === 3 && parts[2] === 'share-links' && method === 'GET') {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      if (!activeFile(state, id)) {
        return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      }
      const links = state.shares
        .filter((link) => link.fileId === id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((link) => shareDto(state, link));
      return jsonResponse({ links });
    }

    if (parts.length === 3 && parts[2] === 'share-links' && method === 'POST') {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const file = activeFile(state, id);
      if (!file) return fail(404, 'FILE_NOT_FOUND', 'Archivo no encontrado.');
      if (file.status !== 'ready' || !file.currentVersionId) {
        return fail(409, 'FILE_NOT_READY', 'El archivo todavía no está disponible.');
      }

      const rawExpiry = body.expiresAt;
      const rawMax = body.maxDownloads;
      const hasExpiry = rawExpiry !== undefined && rawExpiry !== null;
      const hasMax = rawMax !== undefined && rawMax !== null;
      if (!hasExpiry && !hasMax) {
        return fail(
          400,
          'VALIDATION_ERROR',
          'Indica una fecha de caducidad o un límite de descargas.',
        );
      }

      let expiresAt: string | null = null;
      if (hasExpiry) {
        if (typeof rawExpiry !== 'string') {
          return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
        }
        const time = Date.parse(rawExpiry);
        if (Number.isNaN(time)) {
          return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
        }
        if (time <= Date.now()) {
          return fail(400, 'INVALID_EXPIRY', 'La fecha debe estar en el futuro.');
        }
        expiresAt = new Date(time).toISOString();
      }

      let maxDownloads: number | null = null;
      if (hasMax) {
        const value = numberOf(rawMax);
        if (value === null || !Number.isInteger(value) || value < 1 || value > 100_000) {
          return fail(400, 'VALIDATION_ERROR', 'Revisa los datos del formulario.');
        }
        maxDownloads = value;
      }

      const token = randomToken();
      const link = {
        id: nextId(state, 'share'),
        fileId: file.id,
        token,
        expiresAt,
        maxDownloads,
        downloadCount: 0,
        revokedAt: null,
        createdAt: new Date().toISOString(),
        createdBy: user.id,
      };
      state.shares.push(link);

      logActivity(state, {
        userId: user.id,
        action: 'share.create',
        targetType: 'share',
        targetId: link.id,
        metadata: {
          fileName: file.name,
          expiresAt,
          maxDownloads,
        },
      });

      const created: ShareCreated = {
        link: shareDto(state, link),
        token,
        url: new URL(`/s/${token}`, window.location.origin).toString(),
      };
      return jsonResponse(created, 201);
    }

    return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
  }

  if (first === 'share-links') {
    if (parts.length === 2 && method === 'DELETE') {
      if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const id = decodeURIComponent(parts[1] ?? '');
      const link = state.shares.find((item) => item.id === id);
      if (!link) return fail(404, 'SHARE_NOT_FOUND', 'Enlace no encontrado.');
      link.revokedAt = link.revokedAt ?? new Date().toISOString();
      logActivity(state, {
        userId: user.id,
        action: 'share.revoke',
        targetType: 'share',
        targetId: link.id,
        metadata: { fileId: link.fileId },
      });
      return jsonResponse({ link: shareDto(state, link) });
    }
    return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
  }

  if (first === 'trash') {
    if (!canEdit) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');

    if (parts.length === 1 && method === 'GET') {
      const data: TrashData = trashData(state);
      return jsonResponse(data);
    }

    if (parts.length === 4 && parts[3] === 'restore' && method === 'POST') {
      const type = parts[1];
      const id = decodeURIComponent(parts[2] ?? '');
      if (type === 'folder') {
        const folder = state.folders.find((item) => item.id === id && item.deletedAt);
        if (!folder) {
          return fail(404, 'TRASH_ITEM_NOT_FOUND', 'Elemento no encontrado en la papelera.');
        }
        if (folder.parentId) {
          const parent = state.folders.find((item) => item.id === folder.parentId);
          if (parent?.deletedAt) {
            return fail(409, 'PARENT_DELETED', 'Restaura primero la carpeta contenedora.');
          }
        }
        const ids = folderSubtreeIds(state, folder.id);
        const now = new Date().toISOString();
        for (const item of state.folders) {
          if (ids.has(item.id)) item.deletedAt = null;
        }
        for (const file of state.files) {
          if (file.folderId && ids.has(file.folderId)) {
            file.deletedAt = null;
            file.updatedAt = now;
          }
        }
        logActivity(state, {
          userId: user.id,
          action: 'folder.restore',
          targetType: 'folder',
          targetId: folder.id,
          metadata: { name: folder.name },
        });
        return jsonResponse({ ok: true });
      }

      if (type === 'file') {
        const file = state.files.find((item) => item.id === id && item.deletedAt);
        if (!file) {
          return fail(404, 'TRASH_ITEM_NOT_FOUND', 'Elemento no encontrado en la papelera.');
        }
        if (file.folderId) {
          const parent = state.folders.find((item) => item.id === file.folderId);
          if (parent?.deletedAt) {
            return fail(409, 'PARENT_DELETED', 'Restaura primero la carpeta contenedora.');
          }
        }
        file.deletedAt = null;
        file.updatedAt = new Date().toISOString();
        logActivity(state, {
          userId: user.id,
          action: 'file.restore',
          targetType: 'file',
          targetId: file.id,
          metadata: { name: file.name },
        });
        return jsonResponse({ ok: true });
      }

      return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
    }

    if (parts.length === 3 && method === 'DELETE') {
      if (!admin) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      const type = parts[1];
      const id = decodeURIComponent(parts[2] ?? '');

      if (type === 'folder') {
        const folder = state.folders.find((item) => item.id === id && item.deletedAt);
        if (!folder) {
          return fail(404, 'TRASH_ITEM_NOT_FOUND', 'Elemento no encontrado en la papelera.');
        }
        const ids = folderSubtreeIds(state, folder.id);
        const affected = state.files.filter((file) => file.folderId && ids.has(file.folderId));
        for (const file of affected) purgeFile(state, file.id);
        state.folders = state.folders.filter((item) => !ids.has(item.id));
        logActivity(state, {
          userId: user.id,
          action: 'folder.purge',
          targetType: 'folder',
          targetId: folder.id,
          metadata: {
            name: folder.name,
            folders: ids.size,
            files: affected.length,
          },
        });
        return jsonResponse({ ok: true });
      }

      if (type === 'file') {
        const file = state.files.find((item) => item.id === id && item.deletedAt);
        if (!file) {
          return fail(404, 'TRASH_ITEM_NOT_FOUND', 'Elemento no encontrado en la papelera.');
        }
        const name = file.name;
        purgeFile(state, file.id);
        logActivity(state, {
          userId: user.id,
          action: 'file.purge',
          targetType: 'file',
          targetId: id,
          metadata: { name },
        });
        return jsonResponse({ ok: true });
      }

      return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
    }

    return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
  }

  if (first === 'activity') {
    if (!admin) return fail(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
    if (parts.length !== 1 || method !== 'GET') {
      return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
    }
    const rawLimit = numberOf(request.url.searchParams.get('limit')) ?? 50;
    const rawOffset = numberOf(request.url.searchParams.get('offset')) ?? 0;
    const limit = Math.min(200, Math.max(1, Math.floor(rawLimit)));
    const offset = Math.max(0, Math.floor(rawOffset));
    const slice = state.activity.slice(offset, offset + limit + 1);
    const hasMore = slice.length > limit;
    const visible = hasMore ? slice.slice(0, limit) : slice;
    const page: ActivityPage = {
      entries: visible.map((entry) => activityDto(state, entry)),
      hasMore,
      nextOffset: offset + visible.length,
    };
    return jsonResponse(page);
  }

  return fail(404, 'NOT_FOUND', 'Ruta no encontrada.');
}
