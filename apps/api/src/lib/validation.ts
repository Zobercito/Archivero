import { z } from 'zod';
import { maxFileSizeBytes } from '../env';

export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido').max(254);

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128);

export const displayNameSchema = z.string().trim().min(2, 'El nombre es demasiado corto').max(120);

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(120)
  .refine((value) => !/[/\\\p{Cc}]/u.test(value), 'El nombre contiene caracteres no permitidos');

export const fileNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(200)
  .refine((value) => !/[/\\\p{Cc}]/u.test(value), 'El nombre contiene caracteres no permitidos');

export const uuidSchema = z.string().uuid('Identificador inválido');

export const roleSchema = z.enum(['admin', 'editor', 'viewer']);

export const fileSizeSchema = z
  .number()
  .int()
  .positive()
  .max(maxFileSizeBytes, `El archivo supera el límite de ${maxFileSizeBytes / 1024 / 1024} MB`);

const allowedTypes: Record<string, string[]> = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

export const allowedExtensions = Object.keys(allowedTypes);

export function extensionOf(name: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}

export function isAllowedFileType(name: string, mimeType: string) {
  const extension = extensionOf(name);
  const mimes = allowedTypes[extension];
  if (!mimes) return false;
  return mimes.includes(mimeType.toLowerCase());
}
