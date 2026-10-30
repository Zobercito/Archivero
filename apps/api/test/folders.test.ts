import { beforeEach, describe, expect, it } from 'vitest';
import { api, createFolder, loginAs, resetDatabase, uploadFile } from './helpers';

let editor = '';
let admin = '';

beforeEach(async () => {
  await resetDatabase();
  editor = (await loginAs('editor')).cookie;
  admin = (await loginAs('admin')).cookie;
});

describe('carpetas', () => {
  it('crea carpetas y las lista en orden alfabético', async () => {
    const zeta = await createFolder(editor, 'Zeta');
    expect(zeta.status).toBe(201);
    expect(zeta.body.folder.name).toBe('Zeta');
    expect(zeta.body.folder.parentId).toBeNull();

    const alfa = await createFolder(editor, 'alfa');
    expect(alfa.status).toBe(201);

    const { body } = await api('/api/folders', { cookie: editor });
    expect(body.folders.map((folder: { name: string }) => folder.name)).toEqual(['alfa', 'Zeta']);

    const tree = await api('/api/folders/tree', { cookie: editor });
    expect(tree.body.folders).toHaveLength(2);
  });

  it('renombra y mueve carpetas entre niveles', async () => {
    const padre = await createFolder(editor, 'Padre');
    const hija = await createFolder(editor, 'Hija');

    const renamed = await api(`/api/folders/${hija.body.folder.id}`, {
      method: 'PATCH',
      cookie: editor,
      body: { name: 'Hija renombrada' },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.folder.name).toBe('Hija renombrada');

    const moved = await api(`/api/folders/${hija.body.folder.id}`, {
      method: 'PATCH',
      cookie: editor,
      body: { parentId: padre.body.folder.id },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.folder.parentId).toBe(padre.body.folder.id);

    const root = await api('/api/folders', { cookie: editor });
    expect(root.body.folders.map((folder: { id: string }) => folder.id)).toEqual([
      padre.body.folder.id,
    ]);

    const children = await api(`/api/folders?parentId=${padre.body.folder.id}`, {
      cookie: editor,
    });
    expect(children.body.folders.map((folder: { id: string }) => folder.id)).toEqual([
      hija.body.folder.id,
    ]);
  });

  it('impide mover una carpeta dentro de sí misma o de sus descendientes', async () => {
    const padre = await createFolder(editor, 'Padre');
    const hija = await createFolder(editor, 'Hija', padre.body.folder.id);

    const intoSelf = await api(`/api/folders/${padre.body.folder.id}`, {
      method: 'PATCH',
      cookie: editor,
      body: { parentId: padre.body.folder.id },
    });
    expect(intoSelf.status).toBe(400);
    expect(intoSelf.body.error.code).toBe('INVALID_MOVE');

    const intoChild = await api(`/api/folders/${padre.body.folder.id}`, {
      method: 'PATCH',
      cookie: editor,
      body: { parentId: hija.body.folder.id },
    });
    expect(intoChild.status).toBe(400);
    expect(intoChild.body.error.code).toBe('INVALID_MOVE');
  });

  it('valida nombres y carpetas de destino inexistentes', async () => {
    const empty = await api('/api/folders', { cookie: editor, body: { name: '   ' } });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const invalid = await api('/api/folders', {
      cookie: editor,
      body: { name: 'ruta/inválida' },
    });
    expect(invalid.status).toBe(400);

    const missingParent = await api('/api/folders', {
      cookie: editor,
      body: { name: 'Huérfana', parentId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(missingParent.status).toBe(404);
    expect(missingParent.body.error.code).toBe('FOLDER_NOT_FOUND');
  });

  it('la papelera conserva el subárbol y exige restaurar el contenedor primero', async () => {
    const padre = await createFolder(editor, 'Proyecto');
    const hija = await createFolder(editor, 'Documentos', padre.body.folder.id);
    const upload = await uploadFile(editor, {
      name: 'memoria.txt',
      content: 'Memoria del proyecto',
      folderId: hija.body.folder.id,
    });
    expect(upload.confirmed.status).toBe(201);

    const deleted = await api(`/api/folders/${padre.body.folder.id}`, {
      method: 'DELETE',
      cookie: editor,
    });
    expect(deleted.status).toBe(200);

    const root = await api('/api/folders', { cookie: editor });
    expect(root.body.folders).toHaveLength(0);
    const files = await api('/api/files', { cookie: editor });
    expect(files.body.files).toHaveLength(0);

    const trash = await api('/api/trash', { cookie: admin });
    expect(trash.body.folders.map((folder: { name: string }) => folder.name)).toEqual(['Proyecto']);

    const childFirst = await api(`/api/trash/folder/${hija.body.folder.id}/restore`, {
      method: 'POST',
      cookie: editor,
    });
    expect(childFirst.status).toBe(409);
    expect(childFirst.body.error.code).toBe('PARENT_DELETED');

    const restored = await api(`/api/trash/folder/${padre.body.folder.id}/restore`, {
      method: 'POST',
      cookie: editor,
    });
    expect(restored.status).toBe(200);

    const filesAfter = await api(`/api/files?folderId=${hija.body.folder.id}`, {
      cookie: editor,
    });
    expect(filesAfter.body.files.map((file: { name: string }) => file.name)).toEqual([
      'memoria.txt',
    ]);
  });
});
