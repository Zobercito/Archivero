import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { sign, verify } from 'hono/jwt';
import { env } from '../env';
import { HttpError } from './http';

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

function safeSegment(value: string) {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || 'archivo';
}

export function buildStorageKey(fileId: string, versionNumber: number, fileName: string) {
  return `files/${fileId}/v${versionNumber}/${randomUUID()}-${safeSegment(fileName)}`;
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateShareToken() {
  return randomBytes(32).toString('base64url');
}

export function downloadDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function signUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export async function signDownloadUrl(key: string, fileName: string) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: downloadDisposition(fileName),
  });
  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function headObject(key: string) {
  try {
    const result = await s3.send(
      new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    );
    return {
      size: result.ContentLength ?? 0,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

export async function deleteObjectKeys(keys: string[]) {
  const unique = [...new Set(keys)];
  for (let index = 0; index < unique.length; index += 1000) {
    const chunk = unique.slice(index, index + 1000);
    if (chunk.length === 0) continue;
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: env.S3_BUCKET,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      }),
    );
  }
}

export async function deleteObjectPrefix(prefix: string) {
  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));
    await deleteObjectKeys(keys);
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status !== 409 && status !== 403) throw error;
    }
  }
}

export type UploadTicket = {
  scope: 'upload';
  userId: string;
  fileId: string;
  versionNumber: number;
  key: string;
  size: number;
  mimeType: string;
  exp: number;
};

export async function createUploadTicket(
  input: Omit<UploadTicket, 'scope' | 'exp'>,
) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...input,
      scope: 'upload',
      iat: now,
      exp: now + UPLOAD_URL_TTL_SECONDS,
    },
    env.JWT_SECRET,
  );
}

export async function verifyUploadTicket(token: string) {
  let payload: Record<string, unknown>;
  try {
    payload = (await verify(token, env.JWT_SECRET, 'HS256')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'INVALID_UPLOAD_TICKET', 'El comprobante de subida no es válido.');
  }

  if (
    payload.scope !== 'upload' ||
    typeof payload.userId !== 'string' ||
    typeof payload.fileId !== 'string' ||
    typeof payload.versionNumber !== 'number' ||
    typeof payload.key !== 'string' ||
    typeof payload.size !== 'number' ||
    typeof payload.mimeType !== 'string'
  ) {
    throw new HttpError(400, 'INVALID_UPLOAD_TICKET', 'El comprobante de subida no es válido.');
  }

  return payload as unknown as UploadTicket;
}
