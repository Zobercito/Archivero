import { Buffer } from 'node:buffer';
import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const fileName = 'nota-demo.txt';

function fileRow(page: Page, name: string) {
  return page.getByRole('listitem').filter({ hasText: name });
}

async function enterAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.waitForURL((url) => url.pathname === '/');
}

async function closeDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await expect(dialog).toBeHidden();
}

test('la demo permite editar, versionar y compartir sin servidor', async ({ page }) => {
  await enterAs(page, 'Mateo Vidal');

  await expect(page.getByText(/Demo interactiva/).first()).toBeVisible();

  await test.step('sube un archivo', async () => {
    await page.getByRole('button', { name: 'Subir documentos', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from('Demo 1') });
    await dialog.getByRole('button', { name: 'Subir 1' }).click();
    await expect(dialog.getByText('Listo', { exact: true })).toBeVisible();
    await closeDialog(page);
    await expect(fileRow(page, fileName)).toBeVisible();
  });

  await test.step('crea y restaura una versión', async () => {
    await fileRow(page, fileName).getByRole('button', { name: 'Acciones' }).click();
    await page.getByRole('menuitem', { name: 'Versiones' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('v1', { exact: true })).toBeVisible();

    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from('Demo 2') });
    await expect(dialog.getByText('v2', { exact: true })).toBeVisible();

    const firstVersion = dialog.getByRole('listitem').filter({ hasText: 'v1' });
    await firstVersion.getByRole('button', { name: 'Restaurar esta versión' }).click();
    await dialog.getByRole('button', { name: 'Sí, restaurar la versión 1' }).click();
    const restored = dialog.getByRole('listitem').filter({ hasText: 'v3' });
    await expect(restored.getByText('Actual')).toBeVisible();
    await closeDialog(page);
  });

  await test.step('abre el enlace público dentro de la demo y descarga', async () => {
    await fileRow(page, fileName).getByRole('button', { name: 'Acciones' }).click();
    await page.getByRole('menuitem', { name: 'Compartir' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Crear enlace' }).click();
    await expect(dialog.locator('input[readonly]')).toBeVisible();

    await dialog.getByRole('link', { name: 'Abrir la vista pública de este enlace' }).click();
    await page.waitForURL(/\/s\//);
    await expect(page.getByRole('heading', { name: fileName })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar documento' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(fileName);

    await page
      .getByRole('link', { name: /Archivero/ })
      .first()
      .click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(fileRow(page, fileName)).toBeVisible();
  });
});

test('el rol de lectura no ve acciones de edición', async ({ page }) => {
  await enterAs(page, 'Sofía Marín');

  await expect(page.getByRole('button', { name: 'Subir documentos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nueva carpeta' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Papelera' })).toHaveCount(0);

  await page
    .locator('main')
    .getByRole('link', { name: /Contratos 2026/ })
    .click();
  await page.waitForURL(/\/folder\//);

  const row = fileRow(page, 'Contrato marco · Norte.pdf');
  await row.getByRole('button', { name: 'Acciones' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Versiones' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Compartir' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Renombrar' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Enviar a la papelera' })).toHaveCount(0);
});

test('el enlace público de ejemplo funciona y la demo se reinicia al recargar', async ({
  page,
}) => {
  await page.goto('/s/demo-norte-2026');
  await expect(page.getByRole('heading', { name: 'Contrato marco · Norte.pdf' })).toBeVisible();
  await expect(page.getByText(/Demo interactiva/).first()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar documento' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Contrato marco · Norte.pdf');

  await page.goto('/login');
  await page.getByRole('button', { name: /Elena Ríos/ }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('button', { name: 'Subir documentos' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});
