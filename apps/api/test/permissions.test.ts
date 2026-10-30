import { beforeEach, describe, expect, it } from 'vitest';
import { api, createFolder, loginAs, resetDatabase, uploadFile } from './helpers';

let viewer = '';
let editor = '';
let admin = '';

beforeEach(async () => {
  await resetDatabase();
  viewer = (await loginAs('viewer')).cookie;
  editor = (await loginAs('editor')).cookie;
  admin = (await loginAs('admin')).cookie;
});

describe('permisos por rol', () => {
  it('el lector puede consultar pero no modificar', async () => {
    expect((await api('/api/folders', { cookie: viewer })).status).toBe(200);
    expect((await api('/api/files', { cookie: viewer })).status).toBe(200);

    expect(
      (
        await api('/api/folders', {
          cookie: viewer,
          body: { name: 'No permitida' },
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await api('/api/files/upload-url', {
          cookie: viewer,
          body: { name: 'dato.txt', size: 5, mimeType: 'text/plain' },
        })
      ).status,
    ).toBe(403);

    expect((await api('/api/trash', { cookie: viewer })).status).toBe(403);
    expect((await api('/api/users', { cookie: viewer })).status).toBe(403);
    expect((await api('/api/activity', { cookie: viewer })).status).toBe(403);
  });

  it('el editor gestiona contenido y papelera, pero no cuentas ni auditoría', async () => {
    const folder = await createFolder(editor, 'Equipo editorial');
    expect(folder.status).toBe(201);

    const upload = await uploadFile(editor, {
      name: 'acta.txt',
      content: 'Acta de la reunión',
      folderId: folder.body.folder.id,
    });
    expect(upload.confirmed.status).toBe(201);

    const shared = await api(`/api/files/${upload.fileId}/share-links`, {
      cookie: editor,
      body: { maxDownloads: 1 },
    });
    expect(shared.status).toBe(201);

    expect((await api('/api/trash', { cookie: editor })).status).toBe(200);
    expect((await api('/api/users', { cookie: editor })).status).toBe(403);
    expect((await api('/api/activity', { cookie: editor })).status).toBe(403);

    const deleted = await api(`/api/files/${upload.fileId}`, {
      method: 'DELETE',
      cookie: editor,
    });
    expect(deleted.status).toBe(200);

    const purge = await api(`/api/trash/file/${upload.fileId}`, {
      method: 'DELETE',
      cookie: editor,
    });
    expect(purge.status).toBe(403);
    expect(purge.body.error.code).toBe('FORBIDDEN');
  });

  it('solo la administración elimina de forma definitiva y consulta la auditoría', async () => {
    expect((await api('/api/users', { cookie: admin })).status).toBe(200);
    expect((await api('/api/activity', { cookie: admin })).status).toBe(200);
    expect((await api('/api/trash', { cookie: admin })).status).toBe(200);

    const upload = await uploadFile(editor, { name: 'borrador.txt', content: 'Borrador' });
    await api(`/api/files/${upload.fileId}`, { method: 'DELETE', cookie: editor });

    const purge = await api(`/api/trash/file/${upload.fileId}`, {
      method: 'DELETE',
      cookie: admin,
    });
    expect(purge.status).toBe(200);

    const { body } = await api('/api/activity', { cookie: admin });
    const actions = body.entries.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('file.purge');
  });

  it('rechaza escrituras con un Origin no permitido', async () => {
    const result = await api('/api/folders', {
      cookie: editor,
      body: { name: 'Origen ajeno' },
      ip: '198.51.100.7',
      headers: { origin: 'https://otro-sitio.example' },
    });

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });
});
