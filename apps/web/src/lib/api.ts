import { hc } from 'hono/client';
import type { AppType } from '../../../api/src/app';

const origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin;

export const api = hc<AppType>(origin, {
  init: {
    credentials: 'include',
  },
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

type SuccessBody<R> = R extends { json: () => Promise<infer B> }
  ? B extends ErrorBody
    ? never
    : B
  : never;

export async function unwrap<R extends JsonResponse>(response: R): Promise<SuccessBody<R>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const failure = body as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiError(
      response.status,
      failure?.error?.code ?? 'HTTP_ERROR',
      failure?.error?.message ?? `HTTP ${response.status}`,
      failure?.error?.details,
    );
  }

  return body as SuccessBody<R>;
}
