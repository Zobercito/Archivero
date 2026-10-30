import { createHash } from 'node:crypto';
import { app } from '../src/app';
import { db, sql } from '../src/db';
import { users } from '../src/db/schema';
import { env } from '../src/env';
import { hashPassword } from '../src/lib/password';
import { resetRateLimits } from '../src/lib/rate-limit';
import { deleteObjectPrefix } from '../src/lib/storage';

export type Role = 'admin' | 'editor' | 'viewer';

export const accounts: Record<Role, { email: string; name: string; password: string }> = {
  admin: { email: 'elena@archivero.test', name: 'Elena Test', password: 'Admin!2026' },
  editor: { email: 'mateo@archivero.test', name: 'Mateo Test', password: 'Editor!2026' },
  viewer: { email: 'sofia@archivero.test', name: 'Sofía Test', password: 'Viewer!2026' },
};

const disabledAccount = {
  email: 'disabled@archivero.test',
  name: 'Cuenta deshabilitada',
  password: 'Disabled!2026',
};

let ipCounter = 0;

function nextIp() {
  ipCounter += 1;
  return `10.10.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export async function resetDatabase() {
  await sql`TRUNCATE TABLE activity_log, share_links, file_versions, files, folders, users CASCADE`;
  await deleteObjectPrefix('files/');
  resetRateLimits();

  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const account = accounts[role];
    await db.insert(users).values({
      email: account.email,
      name: account.name,
      role,
      passwordHash: await hashPassword(account.password),
    });
  }

  await db.insert(users).values({
    email: disabledAccount.email,
    name: disabledAccount.name,
    role: 'viewer',
    passwordHash: await hashPassword(disabledAccount.password),
    disabledAt: new Date(),
  });
}

export type ApiResult = {
  status: number;
  body: any;
  res: Response;
};

export async function api(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    body?: unknown;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    origin: env.APP_ORIGIN.split(',')[0] ?? env.APP_ORIGIN,
    'x-forwarded-for': options.ip ?? nextIp(),
    ...options.headers,
  };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const res = await app.request(path, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : null,
    res,
  };
}

export async function login(email: string, password: string) {
  const result = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  const setCookie = result.res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { ...result, cookie, setCookie };
}

export async function loginAs(role: Role) {
  const account = accounts[role];
  return login(account.email, account.password);
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function createFolder(cookie: string, name: string, parentId: string | null = null) {
  return api('/api/folders', { cookie, body: { name, parentId } });
}

export async function uploadFile(
  cookie: string,
  input: {
    name: string;
    content: string;
    mimeType?: string;
    folderId?: string | null;
    declaredSize?: number;
    checksum?: string;
  },
) {
  const mimeType = input.mimeType ?? 'text/plain';
  const size = Buffer.byteLength(input.content);

  const prepared = await api('/api/files/upload-url', {
    cookie,
    body: {
      name: input.name,
      size: input.declaredSize ?? size,
      mimeType,
      folderId: input.folderId ?? null,
    },
  });

  if (prepared.status !== 201) {
    throw new Error(
      `No se pudo preparar la subida (${prepared.status}): ${JSON.stringify(prepared.body)}`,
    );
  }

  const upload = await fetch(prepared.body.uploadUrl as string, {
    method: 'PUT',
    headers: { 'content-type': mimeType },
    body: input.content,
  });

  if (!upload.ok) {
    throw new Error(`La subida firmada falló con estado ${upload.status}`);
  }

  const confirmed = await api(`/api/files/${prepared.body.file.id}/confirm`, {
    cookie,
    body: {
      ticket: prepared.body.ticket,
      checksum: input.checksum ?? sha256(input.content),
    },
  });

  return {
    prepared,
    confirmed,
    fileId: prepared.body.file.id as string,
    size,
    content: input.content,
    mimeType,
  };
}

export async function uploadVersion(
  cookie: string,
  fileId: string,
  content: string,
  mimeType = 'text/plain',
) {
  const prepared = await api(`/api/files/${fileId}/versions/upload-url`, {
    cookie,
    body: { size: Buffer.byteLength(content), mimeType },
  });

  if (prepared.status !== 201) {
    throw new Error(`No se pudo preparar la versión (${prepared.status})`);
  }

  const upload = await fetch(prepared.body.uploadUrl as string, {
    method: 'PUT',
    headers: { 'content-type': mimeType },
    body: content,
  });

  if (!upload.ok) throw new Error(`La subida de la versión falló con estado ${upload.status}`);

  return api(`/api/files/${fileId}/versions/${prepared.body.versionNumber}/confirm`, {
    cookie,
    body: { ticket: prepared.body.ticket, checksum: sha256(content) },
  });
}

export async function downloadContent(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`La descarga falló con estado ${response.status}`);
  return response.text();
}
