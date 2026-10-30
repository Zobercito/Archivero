import { beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createFolder,
  downloadContent,
  loginAs,
  resetDatabase,
  sha256,
  uploadFile,
  uploadVersion,
} from './helpers';

let editor = '';
let viewer = '';

beforeEach(async () => {
  await resetDatabase();
  editor = (await loginAs('editor')).cookie;
  viewer = (await loginAs('viewer')).cookie;
});

describe('archivos', () => {
  it('sube un archivo, lo lista, lo descarga y lo renombra', async () => {
    const upload = await uploadFile(editor, {
      name: 'acta.txt',
      content: 'Acta de constitución',
    });
    expect(upload.prepared.status).toBe(201);
    expect(upload.prepared.body.file.status).toBe('pending');
    expect(upload.confirmed.status).toBe(201);
    expect(upload.confirmed.body.file.status).toBe('ready');
    expect(upload.confirmed.body.file.versionNumber).toBe(1);

    const list = await api('/api/files', { cookie: viewer });
    expect(list.body.files.map((file: { name: string }) => file.name)).toEqual(['acta.txt']);

    const detail = await api(`/api/files/${upload.fileId}`, { cookie: viewer });
    expect(detail.body.file.size).toBe(upload.size);

    const download = await api(`/api/files/${upload.fileId}/download`, { cookie: viewer });
    expect(download.status).toBe(200);
    expect(await downloadContent(download.body.url)).toBe(upload.content);

    const renamed = await api(`/api/files/${upload.fileId}`, {
      method: 'PATCH',
      cookie: editor,
      body: { name: 'acta-final.txt' },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.file.name).toBe('acta-final.txt');

    const wrongExtension = await api(`/api/files/${upload.fileId}`, {
      method: 'PATCH',
      cookie: editor,
      body: { name: 'acta.png' },
    });
    expect(wrongExtension.status).toBe(400);
    expect(wrongExtension.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
  });

  it('mueve archivos entre carpetas', async () => {
    const destino = await createFolder(editor, 'Archivo histórico');
    const upload = await uploadFile(editor, { name: 'nota.txt', content: 'Nota' });

    const moved = await api(`/api/files/${upload.fileId}`, {
      method: 'PATCH',
      cookie: editor,
      body: { folderId: destino.body.folder.id },
    });
    expect(moved.status).toBe(200);

    const root = await api('/api/files', { cookie: editor });
    expect(root.body.files).toHaveLength(0);

    const inside = await api(`/api/files?folderId=${destino.body.folder.id}`, { cookie: editor });
    expect(inside.body.files.map((file: { id: string }) => file.id)).toEqual([upload.fileId]);
  });

  it('rechaza tipos no permitidos y confirma que el tamaño coincide', async () => {
    const blocked = await api('/api/files/upload-url', {
      cookie: editor,
      body: { name: 'instalador.exe', size: 10, mimeType: 'application/x-msdownload' },
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');

    const mismatch = await uploadFile(editor, {
      name: 'carta.txt',
      content: 'Contenido real',
      declaredSize: 999,
    });
    expect(mismatch.confirmed.status).toBe(409);
    expect(mismatch.confirmed.body.error.code).toBe('SIZE_MISMATCH');
  });

  it('detecta subidas incompletas y confirmaciones duplicadas', async () => {
    const prepared = await api('/api/files/upload-url', {
      cookie: editor,
      body: { name: 'pendiente.txt', size: 12, mimeType: 'text/plain' },
    });
    expect(prepared.status).toBe(201);
    const fileId = prepared.body.file.id as string;

    const download = await api(`/api/files/${fileId}/download`, { cookie: editor });
    expect(download.status).toBe(409);
    expect(download.body.error.code).toBe('FILE_NOT_READY');

    const notStored = await api(`/api/files/${fileId}/confirm`, {
      cookie: editor,
      body: { ticket: prepared.body.ticket },
    });
    expect(notStored.status).toBe(409);
    expect(notStored.body.error.code).toBe('UPLOAD_INCOMPLETE');

    const upload = await uploadFile(editor, { name: 'duplicado.txt', content: 'Hola' });
    const again = await api(`/api/files/${upload.fileId}/confirm`, {
      cookie: editor,
      body: { ticket: upload.prepared.body.ticket, checksum: sha256(upload.content) },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CONFIRMED');
  });

  it('gestiona versiones y restaura una anterior', async () => {
    const upload = await uploadFile(editor, { name: 'plan.txt', content: 'Plan inicial' });

    const v2 = await uploadVersion(editor, upload.fileId, 'Plan revisado');
    expect(v2.status).toBe(201);
    expect(v2.body.version.versionNumber).toBe(2);

    const versions = await api(`/api/files/${upload.fileId}/versions`, { cookie: viewer });
    expect(
      versions.body.versions.map((version: { versionNumber: number }) => version.versionNumber),
    ).toEqual([2, 1]);

    const restored = await api(`/api/files/${upload.fileId}/versions/1/restore`, {
      method: 'POST',
      cookie: editor,
    });
    expect(restored.status).toBe(201);
    expect(restored.body.version.versionNumber).toBe(3);

    const download = await api(`/api/files/${upload.fileId}/download`, { cookie: viewer });
    expect(await downloadContent(download.body.url)).toBe('Plan inicial');

    const missing = await api(`/api/files/${upload.fileId}/versions/9/restore`, {
      method: 'POST',
      cookie: editor,
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('VERSION_NOT_FOUND');
  });

  it('envía a la papelera y restaura archivos sueltos', async () => {
    const upload = await uploadFile(editor, { name: 'descartable.txt', content: 'Temporal' });

    const deleted = await api(`/api/files/${upload.fileId}`, { method: 'DELETE', cookie: editor });
    expect(deleted.status).toBe(200);

    const detail = await api(`/api/files/${upload.fileId}`, { cookie: editor });
    expect(detail.status).toBe(404);

    const trash = await api('/api/trash', { cookie: editor });
    expect(trash.body.files.map((file: { id: string }) => file.id)).toEqual([upload.fileId]);

    const restored = await api(`/api/trash/file/${upload.fileId}/restore`, {
      method: 'POST',
      cookie: editor,
    });
    expect(restored.status).toBe(200);

    const list = await api('/api/files', { cookie: editor });
    expect(list.body.files.map((file: { id: string }) => file.id)).toEqual([upload.fileId]);
  });
});
