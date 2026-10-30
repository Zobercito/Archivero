import { beforeEach, describe, expect, it } from 'vitest';
import { api, downloadContent, loginAs, resetDatabase, uploadFile } from './helpers';

let editor = '';

beforeEach(async () => {
  await resetDatabase();
  editor = (await loginAs('editor')).cookie;
});

async function createShare(fileId: string, body: Record<string, unknown>) {
  return api(`/api/files/${fileId}/share-links`, { cookie: editor, body });
}

describe('enlaces públicos', () => {
  it('comparte un archivo y respeta el límite de descargas', async () => {
    const upload = await uploadFile(editor, { name: 'catalogo.txt', content: 'Catálogo 2026' });

    const created = await createShare(upload.fileId, { maxDownloads: 1 });
    expect(created.status).toBe(201);
    const token = created.body.token as string;
    expect(created.body.url.endsWith(`/s/${token}`)).toBe(true);

    const info = await api(`/api/public/shares/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.share.fileName).toBe('catalogo.txt');
    expect(info.body.share.remainingDownloads).toBe(1);

    const first = await api(`/api/public/shares/${token}/download`, { method: 'POST' });
    expect(first.status).toBe(200);
    expect(first.body.remainingDownloads).toBe(0);
    expect(await downloadContent(first.body.url)).toBe('Catálogo 2026');

    const second = await api(`/api/public/shares/${token}/download`, { method: 'POST' });
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe('SHARE_UNAVAILABLE');

    expect((await api(`/api/public/shares/${token}`)).status).toBe(404);
  });

  it('revoca un enlace y deja de servirlo', async () => {
    const upload = await uploadFile(editor, { name: 'contrato.txt', content: 'Contrato' });
    const created = await createShare(upload.fileId, { maxDownloads: 5 });
    const token = created.body.token as string;

    const listing = await api(`/api/files/${upload.fileId}/share-links`, { cookie: editor });
    expect(listing.body.links).toHaveLength(1);
    expect(listing.body.links[0].revokedAt).toBeNull();

    const revoked = await api(`/api/share-links/${created.body.link.id}`, {
      method: 'DELETE',
      cookie: editor,
    });
    expect(revoked.status).toBe(200);

    const after = await api(`/api/public/shares/${token}`);
    expect(after.status).toBe(404);
    expect(after.body.error.code).toBe('SHARE_UNAVAILABLE');
  });

  it('oculta enlaces de archivos eliminados y los recupera al restaurar', async () => {
    const upload = await uploadFile(editor, { name: 'oferta.txt', content: 'Oferta' });
    const created = await createShare(upload.fileId, { maxDownloads: 3 });
    const token = created.body.token as string;

    await api(`/api/files/${upload.fileId}`, { method: 'DELETE', cookie: editor });
    expect((await api(`/api/public/shares/${token}`)).status).toBe(404);

    await api(`/api/trash/file/${upload.fileId}/restore`, { method: 'POST', cookie: editor });
    expect((await api(`/api/public/shares/${token}`)).status).toBe(200);
  });

  it('valida caducidad, límites y estado del archivo', async () => {
    const upload = await uploadFile(editor, { name: 'informe.txt', content: 'Informe' });

    const noLimit = await createShare(upload.fileId, {});
    expect(noLimit.status).toBe(400);
    expect(noLimit.body.error.code).toBe('VALIDATION_ERROR');

    const past = await createShare(upload.fileId, { expiresAt: '2020-01-01T00:00:00.000Z' });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('INVALID_EXPIRY');

    const future = await createShare(upload.fileId, {
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      maxDownloads: 10,
    });
    expect(future.status).toBe(201);
    expect((await api(`/api/public/shares/${future.body.token}`)).status).toBe(200);

    const prepared = await api('/api/files/upload-url', {
      cookie: editor,
      body: { name: 'borrador.txt', size: 8, mimeType: 'text/plain' },
    });
    const pending = await createShare(prepared.body.file.id, { maxDownloads: 1 });
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('FILE_NOT_READY');

    const unknown = await api('/api/public/shares/token-inexistente-123');
    expect(unknown.status).toBe(404);
  });
});
