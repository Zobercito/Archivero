import { Buffer } from 'node:buffer';
import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const editor = { email: 'mateo@archivero.demo', password: 'Editor!2026' };
const viewer = { email: 'sofia@archivero.demo', password: 'Lector!2026' };
const fileName = 'acta-e2e.txt';

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/');
}

function fileRow(page: Page, name: string) {
  return page.getByRole('listitem').filter({ hasText: name });
}

async function closeDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
  await expect(dialog).toBeHidden();
}

test('flujo completo del editor', async ({ page }) => {
  await login(page, editor);

  await test.step('sube un archivo', async () => {
    await page.getByRole('button', { name: 'Subir documentos', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from('Versión 1') });
    await dialog.getByRole('button', { name: 'Subir 1' }).click();
    await expect(dialog.getByText('Listo', { exact: true })).toBeVisible();
    await closeDialog(page);
    await expect(fileRow(page, fileName)).toBeVisible();
  });

  await test.step('sube una nueva versión y restaura la anterior', async () => {
    await fileRow(page, fileName).getByRole('button', { name: 'Acciones' }).click();
    await page.getByRole('menuitem', { name: 'Versiones' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('v1', { exact: true })).toBeVisible();

    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from('Versión 2') });
    await expect(dialog.getByText('v2', { exact: true })).toBeVisible();

    const firstVersion = dialog.getByRole('listitem').filter({ hasText: 'v1' });
    await firstVersion.getByRole('button', { name: 'Restaurar esta versión' }).click();
    await dialog.getByRole('button', { name: 'Sí, restaurar la versión 1' }).click();

    const restored = dialog.getByRole('listitem').filter({ hasText: 'v3' });
    await expect(restored.getByText('Actual')).toBeVisible();
    await closeDialog(page);
  });

  await test.step('envía a la papelera y recupera el archivo', async () => {
    await fileRow(page, fileName).getByRole('button', { name: 'Acciones' }).click();
    await page.getByRole('menuitem', { name: 'Enviar a la papelera' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Enviar a la papelera' }).click();
    await expect(fileRow(page, fileName)).toHaveCount(0);

    await page.getByRole('link', { name: 'Papelera' }).click();
    await page.waitForURL((url) => url.pathname === '/trash');
    const trashed = fileRow(page, fileName);
    await expect(trashed).toBeVisible();
    await trashed.getByRole('button', { name: 'Restaurar' }).click();
    await expect(trashed).toHaveCount(0);

    await page.getByRole('link', { name: 'Explorador' }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(fileRow(page, fileName)).toBeVisible();
  });

  await test.step('crea un enlace con caducidad y lo abre sin sesión', async () => {
    await fileRow(page, fileName).getByRole('button', { name: 'Acciones' }).click();
    await page.getByRole('menuitem', { name: 'Compartir' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Crear enlace' }).click();
    const linkInput = dialog.locator('input[readonly]');
    await expect(linkInput).toBeVisible();
    const shareUrl = await linkInput.inputValue();
    expect(shareUrl).toContain('/s/');
    await closeDialog(page);

    await page.context().clearCookies();
    await page.goto(shareUrl);
    await expect(page.getByRole('heading', { name: fileName })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar documento' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(fileName);
  });
});

test('el lector puede consultar pero no modificar', async ({ page }) => {
  await login(page, viewer);

  await expect(page.getByRole('button', { name: 'Subir documentos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nueva carpeta' })).toHaveCount(0);

  await page
    .locator('main')
    .getByRole('link', { name: /Contratos 2026/ })
    .click();
  await page.waitForURL(/\/folder\//);

  const row = fileRow(page, 'Contrato de servicios - Aurora Digital.pdf');
  await row.getByRole('button', { name: 'Acciones' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Versiones' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Compartir' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Renombrar' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Enviar a la papelera' })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.goto('/trash');
  await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
});
