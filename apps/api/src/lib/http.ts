import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorPayload(code: string, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

export function validationHook(result: any, c: Context) {
  if (result.success) return;
  const details = result.error?.issues?.map(
    (issue: { path: PropertyKey[]; message: string }) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }),
  );
  return c.json(errorPayload('VALIDATION_ERROR', 'Datos inválidos.', details), 400);
}
