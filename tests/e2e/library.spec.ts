import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

async function pdf(texts: string[]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const text of texts)
    document.addPage([595, 842]).drawText(text, { x: 60, y: 740, size: 24, font });
  return Buffer.from(await document.save());
}

test('lee archivos de la sesión, busca dentro del lector y permite reabrirlos sin conexión', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.goto('/');
  await expect(page.getByText('Dale un lugar a tu música')).toBeVisible();
  await page.screenshot({ path: `/tmp/atril-${test.info().project.name}.png`, fullPage: true });
  const first = await pdf(['Sonata - Allegro', 'Andante especial']);
  const second = await pdf(['Vals para piano']);
  await page.locator('#file-input').setInputFiles([
    { name: 'Sonata.pdf', mimeType: 'application/pdf', buffer: first },
    { name: 'Vals.pdf', mimeType: 'application/pdf', buffer: second },
  ]);
  await expect(page.locator('.score-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#page-total')).toHaveText('/ 2');
  await page.screenshot({ path: `/tmp/atril-reader-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: 'En este PDF', exact: true }).click();
  await page.locator('#reader-search').fill('Andante');
  await page.getByRole('button', { name: /Página 2/ }).click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  if (await page.locator('#reader-search-panel').isHidden())
    await page.locator('#reader-search-toggle').click();
  await page.getByRole('button', { name: 'Otra partitura', exact: true }).click();
  await page.locator('#reader-search').fill('Vals');
  await page.locator('.quick-result').click();
  await expect(page.locator('#reader-title')).toHaveText('Vals');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await page.locator('#close-reader').click();
  await page.locator('[data-favorite="Importados/Sonata.pdf"]').click();
  await expect(page.locator('[data-favorite="Importados/Sonata.pdf"]')).toHaveClass(/is-favorite/);
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#close-reader').click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.score-card')).toHaveCount(0);
  await page.locator('#file-input').setInputFiles({
    name: 'Vals.pdf',
    mimeType: 'application/pdf',
    buffer: second,
  });
  await expect(page.locator('#reader-title')).toHaveText('Vals');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('preserva subcarpetas importadas y admite puntuación literal en la búsqueda', async ({
  page,
}) => {
  await page.goto('/');
  const bytes = [...(await pdf(['Estudio']))];
  await page.evaluate(async (data) => {
    const input = document.querySelector<HTMLInputElement>('#folder-input')!;
    const transfer = new DataTransfer();
    const file = new File([new Uint8Array(data)], 'Estudio [1]+.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'Repertorio/Piano/Estudio [1]+.pdf',
    });
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  }, bytes);
  await expect(page.locator('.score-card')).toHaveCount(1);
  await expect(page.locator('[data-folder="Repertorio/Piano"]')).toHaveCount(1);
  await page.locator('#library-search').fill('[1]+');
  await expect(page.locator('.score-card')).toHaveCount(1);
  await page.locator('#library-search').fill('no existe');
  await expect(page.getByText('No encontramos partituras', { exact: true })).toBeVisible();
  await page.locator('#library-search').fill('');
  await page.locator('[data-remove]').click();
  await page.locator('#confirm-delete').click();
  await expect(page.getByText('Dale un lugar a tu música')).toBeVisible();
});

test('abre un PDF directamente sin guardar contenido en IndexedDB', async ({ page }) => {
  await page.goto('/');
  const buffer = await pdf(['Lectura local']);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Abrir PDF', exact: true }).first().click();
  await (await chooser).setFiles({ name: 'Local.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#reader-title')).toHaveText('Local');
  expect(
    await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
  ).not.toContain('atril-library');
  await page.reload();
  await expect(page.locator('.score-card')).toHaveCount(0);
  await expect(page.locator('#reader')).toBeHidden();
});

test('vincula varias carpetas, restaura referencias y actualiza altas, cambios y bajas', async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle(sessionStorage.getItem('test-folder') || 'Repertorio', {
          create: true,
        });
      },
    });
  });
  await page.goto('/');
  const first = [...(await pdf(['Sonata', 'Andante']))];
  const second = [...(await pdf(['Vals']))];
  async function write(folder: string, name: string, bytes: number[]) {
    await page.evaluate(
      async ({ folder, name, bytes }) => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle(folder, { create: true });
        const file = await directory.getFileHandle(name, { create: true });
        const writer = await file.createWritable();
        await writer.write(new Uint8Array(bytes));
        await writer.close();
      },
      { folder, name, bytes },
    );
  }
  const refreshButton = page.getByRole('button', { name: 'Actualizar carpetas', exact: true });
  await expect(refreshButton).toBeVisible();
  await expect(refreshButton).toBeDisabled();
  await expect(page.locator('.heading-actions #refresh-folders')).toHaveCount(1);
  expect(
    await refreshButton.evaluate((button) => parseFloat(getComputedStyle(button).fontSize)),
  ).toBeGreaterThan(0);
  const bounds = await refreshButton.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await write('Repertorio', 'Sonata.pdf', first);
  await page.locator('.heading-actions [data-action="import"]').click();
  await page.locator('#pick-folder').click();
  await expect(page.locator('.score-card')).toHaveCount(1);
  await expect(refreshButton).toBeEnabled();
  await page.locator('[data-favorite]').click();
  await expect(page.locator('[data-favorite]')).toHaveClass(/is-favorite/);
  await page.reload();
  await expect(page.locator('.score-card')).toHaveCount(1);
  await expect(page.locator('[data-favorite]')).toHaveClass(/is-favorite/);
  await write('Ensayos', 'Vals.pdf', second);
  await page.evaluate(() => sessionStorage.setItem('test-folder', 'Ensayos'));
  await page.locator('.heading-actions [data-action="import"]').click();
  await page.locator('#pick-folder').click();
  await expect(page.locator('.folder-options')).toHaveCount(2);
  await expect(page.locator('.score-card')).toHaveCount(2);
  await write('Repertorio', 'Nuevo.pdf', second);
  await page.clock.fastForward(60000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(1000);
  await expect(page.locator('.score-card')).toHaveCount(2);
  await page.locator('#refresh-folders').click();
  await expect(page.locator('.score-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-total')).toHaveText('/ 2');
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#close-reader').click();
  await write('Repertorio', 'Sonata.pdf', second);
  await page.locator('#refresh-folders').click();
  await expect(page.locator('#refresh-folders')).toBeEnabled();
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-total')).toHaveText('/ 1');
  await expect(page.locator('#page-input')).toHaveValue('1');
  await page.locator('#close-reader').click();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('Repertorio');
    await directory.removeEntry('Nuevo.pdf');
  });
  await page.locator('#refresh-folders').click();
  await expect(page.locator('.score-card')).toHaveCount(2);
  await expect(page.locator('.sidebar .linked-folder')).toHaveCount(0);
  await expect(page.locator('[data-folder="Repertorio"]')).toHaveCount(1);
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await page.evaluate(() => {
    let granted = false;
    const prototype = FileSystemDirectoryHandle.prototype;
    prototype.queryPermission = async () => (granted ? 'granted' : 'prompt');
    prototype.requestPermission = async () => (granted ? 'granted' : 'denied');
    Object.defineProperty(window, 'restoreTestPermission', {
      value: () => {
        granted = true;
      },
    });
  });
  // Updating exposes the permission actions on the folder itself.
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await page.locator('#refresh-folders').click();
  await expect(page.locator('.folder-warning')).toHaveCount(2);
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await page.getByLabel('Opciones de carpeta Ensayos', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Restablecer acceso a Ensayos', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `/tmp/atril-folder-actions-${test.info().project.name}.png` });
  await page.evaluate(() =>
    (window as unknown as { restoreTestPermission: () => void }).restoreTestPermission(),
  );
  await page.getByRole('button', { name: 'Restablecer acceso a Ensayos', exact: true }).click();
  await expect(page.locator('.folder-warning')).toHaveCount(1);
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await page.locator('#refresh-folders').click();
  await expect(page.locator('.folder-warning')).toHaveCount(0);
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await page.getByLabel('Opciones de carpeta Ensayos', { exact: true }).click();
  await page.getByRole('button', { name: 'Desvincular Ensayos', exact: true }).click();
  await expect(page.locator('.score-card')).toHaveCount(1);
  expect(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle('Ensayos');
      return (await directory.getFileHandle('Vals.pdf')).name;
    }),
  ).toBe('Vals.pdf');

  await page.screenshot({
    path: `/tmp/atril-linked-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('conserva PDFs importados sin permiso al recargar y solo pide acceso al actualizar', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('permission-requests', '0');
    sessionStorage.setItem('folder-reads', '0');
    const prototype = FileSystemDirectoryHandle.prototype;
    const values = prototype.values;
    prototype.values = function () {
      sessionStorage.setItem(
        'folder-reads',
        String(Number(sessionStorage.getItem('folder-reads')) + 1),
      );
      if (sessionStorage.getItem('block-folder') === 'yes') throw new Error('Sin acceso');
      return values.call(this);
    };
    prototype.requestPermission = async () => {
      sessionStorage.setItem(
        'permission-requests',
        String(Number(sessionStorage.getItem('permission-requests')) + 1),
      );
      return sessionStorage.getItem('block-folder') === 'yes' ? 'denied' : 'granted';
    };
    prototype.queryPermission = async () => {
      throw new Error('La apertura no debe consultar permisos');
    };
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('Guardadas', { create: true }),
    });
  });
  await page.goto('/');
  async function write(bytes: number[]) {
    await page.evaluate(async (bytes) => {
      const folder = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('Guardadas', { create: true });
      const writer = await (
        await folder.getFileHandle('Sonata.pdf', { create: true })
      ).createWritable();
      await writer.write(new Uint8Array(bytes));
      await writer.close();
    }, bytes);
  }
  await write([...(await pdf(['Guardada', 'Segunda página']))]);
  await page.locator('.heading-actions [data-action="import"]').click();
  await page.locator('#pick-folder').click();
  await expect(page.locator('.score-card')).toHaveCount(1);
  await page.locator('[data-favorite]').click();
  await expect(page.locator('[data-favorite]')).toHaveClass(/is-favorite/);
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-total')).toHaveText('/ 2');
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#close-reader').click();
  // The original changes while the persisted import remains readable.
  await write([...(await pdf(['Versión actualizada']))]);
  await page.evaluate(() => sessionStorage.setItem('block-folder', 'yes'));
  await page.reload();
  await expect(page.locator('.score-card')).toHaveCount(1);
  await expect(page.locator('[data-favorite]')).toHaveClass(/is-favorite/);
  await expect(page.locator('.folder-warning')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('permission-requests'))).toBe('0');
  expect(await page.evaluate(() => sessionStorage.getItem('folder-reads'))).toBe('0');
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-total')).toHaveText('/ 2');
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#close-reader').click();
  await page.locator('#refresh-folders').click();
  await expect(page.locator('.folder-warning')).toHaveCount(1);
  await expect(page.locator('.score-card')).toHaveCount(1);
  expect(await page.evaluate(() => sessionStorage.getItem('permission-requests'))).toBe('1');
  expect(await page.evaluate(() => sessionStorage.getItem('folder-reads'))).toBe('0');
  await page.evaluate(() => sessionStorage.setItem('block-folder', 'no'));
  await page.locator('#refresh-folders').click();
  await expect(page.locator('#refresh-folders')).toBeEnabled();
  await expect(page.locator('.folder-warning')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-total')).toHaveText('/ 1');
  await expect(page.locator('#page-input')).toHaveValue('1');
  await page.locator('#close-reader').click();
  await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Guardadas');
    await folder.removeEntry('Sonata.pdf');
    sessionStorage.setItem('block-folder', 'yes');
    await navigator.serviceWorker.ready;
  });
  // Navigate once after activation so the cached app shell controls this page.
  await page.reload();
  await expect(page.locator('.score-card')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.score-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#page-total')).toHaveText('/ 1');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('permission-requests'))).toBe('0');
  expect(await page.evaluate(() => sessionStorage.getItem('folder-reads'))).toBe('0');
  await context.setOffline(false);
});

test('navega entre PDFs desde el lector respetando filtros, orden y progreso', async ({ page }) => {
  await page.goto('/');
  const buffer = await pdf(['Primera', 'Segunda']);
  await page.locator('#file-input').setInputFiles([
    { name: 'B.pdf', mimeType: 'application/pdf', buffer },
    { name: 'A.pdf', mimeType: 'application/pdf', buffer },
    { name: 'Excluido.pdf', mimeType: 'application/pdf', buffer },
  ]);
  await expect(page.locator('.score-card')).toHaveCount(3);
  await page.locator('[data-favorite="Importados/A.pdf"]').click();
  await expect(page.locator('[data-favorite="Importados/A.pdf"]')).toHaveClass(/is-favorite/);
  await page.locator('[data-favorite="Importados/B.pdf"]').click();
  await expect(page.locator('[data-favorite="Importados/B.pdf"]')).toHaveClass(/is-favorite/);
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await page.locator('[data-section="favorites"]').click();
  await expect(page.locator('.score-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir A', exact: true }).click();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDF anterior', exact: true })).toBeDisabled();
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.getByRole('button', { name: 'PDF siguiente', exact: true }).click();
  await expect(page.locator('#reader-title')).toHaveText('B');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#page-input')).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'PDF siguiente', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'PDF anterior', exact: true }).click();
  await expect(page.locator('#reader-title')).toHaveText('A');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.screenshot({ path: `/tmp/atril-navigation-${test.info().project.name}.png` });
});

test('divide el lector y mantiene desplazamiento, páginas y zoom independientes', async ({
  page,
}) => {
  await page.goto('/');
  const buffer = await pdf(['Primera página', 'Segunda página']);
  await page.locator('#file-input').setInputFiles([
    { name: 'Primera.pdf', mimeType: 'application/pdf', buffer },
    { name: 'Segunda.pdf', mimeType: 'application/pdf', buffer },
    { name: 'Dañado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\ninvalid') },
  ]);
  await expect(page.locator('.score-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Abrir Primera', exact: true }).click();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.getByRole('button', { name: 'Ocultar controles', exact: true }).click();
  await expect(page.locator('.reader-header')).toBeHidden();
  await expect(page.locator('.primary-reader .reader-controls')).toBeHidden();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click();
  await expect(page.locator('.reader-header')).toBeVisible();
  await page.getByRole('button', { name: 'Dividir y buscar', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Buscar segunda partitura por nombre' })
    .fill('Segunda');
  await page.locator('[data-secondary-open]').click();
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await expect(page.locator('#reader-title')).toHaveText('Primera');
  await expect(page.locator('#secondary-title')).toHaveText('Segunda');
  await expect(page.locator('#page-input')).toHaveValue('2');
  await expect(page.locator('#secondary-page')).toHaveValue('1');
  await page.getByRole('button', { name: 'Acercar segunda partitura', exact: true }).click();
  await expect(page.locator('#secondary-zoom')).toHaveText('125%');
  await expect(page.locator('#zoom-label')).toHaveText('100%');
  await page
    .getByRole('button', { name: 'Página siguiente de segunda partitura', exact: true })
    .click();
  await expect(page.locator('#secondary-page')).toHaveValue('2');
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#secondary-scroll').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#secondary-page')).toHaveValue('1');
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#canvas-scroll').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#page-input')).toHaveValue('1');
  await page.locator('#zoom-in').click();
  await page.locator('#zoom-in').click();
  await expect(page.locator('#zoom-label')).toHaveText('150%');
  await expect(page.locator('#secondary-zoom')).toHaveText('125%');
  await page.waitForFunction(() => {
    const first = document.querySelector('#canvas-scroll')!;
    const second = document.querySelector('#secondary-scroll')!;
    return first.scrollHeight > first.clientHeight && second.scrollHeight > second.clientHeight;
  });
  await page.locator('#canvas-scroll').evaluate((element) => {
    element.scrollTop = 80;
  });
  await page.locator('#secondary-scroll').evaluate((element) => {
    element.scrollTop = 40;
  });
  expect(await page.locator('#canvas-scroll').evaluate((element) => element.scrollTop)).toBe(80);
  expect(await page.locator('#secondary-scroll').evaluate((element) => element.scrollTop)).toBe(40);
  const firstBounds = await page.locator('.primary-reader').boundingBox();
  const secondBounds = await page.locator('#secondary-reader').boundingBox();
  expect(firstBounds!.height).toBeGreaterThan(100);
  expect(secondBounds!.height).toBeGreaterThan(100);
  expect(firstBounds!.x + firstBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(secondBounds!.x + secondBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: 'Ocultar controles', exact: true }).click();
  await expect(page.locator('.reader-header')).toBeHidden();
  await expect(page.locator('.secondary-header')).toBeHidden();
  await expect(page.locator('#secondary-reader .reader-controls')).toBeHidden();
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await page.screenshot({ path: `/tmp/atril-focus-${test.info().project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-header')).toBeVisible();
  await expect(page.locator('.secondary-header')).toBeVisible();
  await page.screenshot({ path: `/tmp/atril-split-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Buscar segunda partitura', exact: true }).click();
  await page.locator('#secondary-query').fill('Dañado');
  await page.locator('[data-secondary-open]').click();
  await expect(page.locator('#secondary-status')).toContainText('No se pudo abrir este PDF');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Buscar segunda partitura', exact: true }).click();
  await page.locator('#secondary-query').fill('Segunda');
  await page.locator('[data-secondary-open]').click();
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar división', exact: true }).click();
  await expect(page.locator('#secondary-reader')).toBeHidden();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#reader-title')).toHaveText('Primera');
  await page.locator('#close-reader').click();
  await expect(page.locator('#reader')).toBeHidden();
});

test('muestra primeras páginas como miniaturas en tarjetas y lista', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles([
    { name: 'Sonata.pdf', mimeType: 'application/pdf', buffer: await pdf(['Sonata']) },
    { name: 'Vals.pdf', mimeType: 'application/pdf', buffer: await pdf(['Vals']) },
    { name: 'Dañado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\ninvalid') },
  ]);
  await expect(page.locator('.score-card')).toHaveCount(3);
  // Previews are lazy: visit each card before checking the complete set.
  for (const name of ['Sonata', 'Vals', 'Dañado']) {
    await page.getByRole('button', { name: `Abrir ${name}`, exact: true }).scrollIntoViewIfNeeded();
    if (name !== 'Dañado')
      await expect(page.locator(`[data-preview="Importados/${name}.pdf"] img`)).toBeVisible();
  }
  await expect(page.locator('.score-thumbnail')).toHaveCount(2);
  await expect(page.locator('.score-preview-placeholder')).toHaveCount(1);
  const sonata = page.locator('[data-preview="Importados/Sonata.pdf"] img');
  await sonata.scrollIntoViewIfNeeded();
  await expect(sonata).toBeVisible();
  await expect(sonata).toHaveJSProperty('complete', true);
  expect(await sonata.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const src = await sonata.getAttribute('src');
  await page.getByRole('button', { name: 'Vista de lista', exact: true }).click();
  await expect(page.locator('.score-thumbnail')).toHaveCount(2);
  await expect(sonata).toHaveAttribute('src', src!);
  await expect(sonata).toBeVisible();
  await page.screenshot({ path: `/tmp/atril-thumbnails-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Abrir Sonata', exact: true }).click();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#reader-title')).toHaveText('Sonata');
});

test('oculta y muestra la barra lateral sin perder la biblioteca', async ({ page }) => {
  await page.goto('/');
  const mobile = page.viewportSize()!.width <= 650;
  if (mobile)
    await page.getByRole('button', { name: 'Mostrar barra lateral', exact: true }).click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#menu')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Ocultar barra lateral', exact: true }).click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#menu')).toHaveAttribute('aria-expanded', 'false');
  expect((await page.locator('.main').boundingBox())!.x).toBe(0);
  await page.reload();
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar barra lateral', exact: true }).click();
  await expect(page.locator('#sidebar')).toBeVisible();
  if (mobile) {
    await page.locator('[data-section="favorites"]').click();
    await expect(page.locator('#sidebar')).toBeHidden();
    await expect(page.locator('#menu')).toHaveAttribute('aria-expanded', 'false');
  } else {
    expect((await page.locator('.main').boundingBox())!.x).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('#sidebar')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#sidebar')).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#sidebar')).toBeVisible();
  }
});

test('admite gestos táctiles para cambiar PDF y conserva el scroll y las secciones independientes', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const buffer = await pdf(['Primera', 'Segunda']);
  await page
    .locator('#file-input')
    .setInputFiles(
      ['A', 'B', 'C'].map((name) => ({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer })),
    );
  await expect(page.locator('.score-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Abrir B', exact: true }).click();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  const touch = await context.newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  async function swipe(selector: string, dx: number, dy = 0) {
    const bounds = (await page.locator(selector).boundingBox())!;
    const startX = bounds.x + bounds.width * (dx < 0 ? 0.75 : 0.25);
    const startY = bounds.y + bounds.height * (dy < 0 ? 0.75 : 0.35);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    for (let step = 1; step <= 6; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + (dx * step) / 6, y: startY + (dy * step) / 6 }],
      });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const distance = Math.min(180, page.viewportSize()!.width * 0.45);
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await swipe('#canvas-scroll', -distance);
  await expect(page.locator('#reader-title')).toHaveText('C');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await swipe('#canvas-scroll', distance);
  await expect(page.locator('#reader-title')).toHaveText('B');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await expect(page.locator('#page-input')).toHaveValue('2');
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 480 });
  await page.waitForFunction(() => {
    const element = document.querySelector('#canvas-scroll')!;
    return element.scrollHeight > element.clientHeight;
  });
  await page.locator('#canvas-scroll').evaluate((element) => {
    element.scrollTop = 0;
  });
  await swipe('#canvas-scroll', 0, -140);
  await expect
    .poll(() => page.locator('#canvas-scroll').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.locator('#reader-title')).toHaveText('B');
  await page.setViewportSize(viewport);
  await page.getByRole('button', { name: 'Dividir y buscar', exact: true }).click();
  await page.locator('#secondary-query').fill('B');
  await page.locator('[data-secondary-open]').click();
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Ocultar controles', exact: true }).click();
  await swipe('#secondary-scroll', -distance);
  await expect(page.locator('#secondary-title')).toHaveText('C');
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await expect(page.locator('#reader-title')).toHaveText('B');
  await swipe('#secondary-scroll', distance);
  await expect(page.locator('#secondary-title')).toHaveText('B');
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar controles', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar división', exact: true }).click();
  await page.locator('#zoom-in').click();
  await page.locator('#zoom-in').click();
  await page.waitForFunction(() => {
    const element = document.querySelector('#canvas-scroll')!;
    return element.scrollWidth > element.clientWidth;
  });
  await swipe('#canvas-scroll', -distance);
  await expect(page.locator('#reader-title')).toHaveText('B');
  await expect
    .poll(() => page.locator('#canvas-scroll').evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await page.locator('#fit-page').click();
  await expect(page.locator('#zoom-label')).toHaveText('100%');
  await page.waitForFunction(() => {
    const element = document.querySelector('#canvas-scroll')!;
    return element.scrollWidth <= element.clientWidth + 2;
  });
  await swipe('#canvas-scroll', distance);
  await expect(page.locator('#reader-title')).toHaveText('A');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await swipe('#canvas-scroll', distance);
  await expect(page.locator('#reader-title')).toHaveText('A');
});

test('selecciona una lista ordenada y navega únicamente por esos PDFs', async ({ page }) => {
  await page.goto('/');
  const buffer = await pdf(['Lista de ensayo']);
  await page.locator('#file-input').setInputFiles([
    { name: 'A.pdf', mimeType: 'application/pdf', buffer },
    { name: 'B.pdf', mimeType: 'application/pdf', buffer },
    { name: 'C.pdf', mimeType: 'application/pdf', buffer },
    { name: '.trashed-123-B.pdf', mimeType: 'application/pdf', buffer },
    { name: '._A.pdf', mimeType: 'application/pdf', buffer },
  ]);
  await expect(page.locator('.score-card')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Añadir C a la lista', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Añadir A a la lista', exact: true }).check();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#reading-list-count')).toHaveText('2');
  await page.locator('#library-search').fill('B');
  await expect(page.locator('.score-card')).toHaveCount(1);
  // Starting the selection ignores unrelated search results and alphabetical order.
  await page.getByRole('button', { name: 'Leer lista', exact: true }).click();
  await expect(page.locator('#reader-title')).toHaveText('C');
  await expect(page.locator('#reader-queue-position')).toHaveText('1 / 2');
  await expect(page.locator('#previous-score')).toBeDisabled();
  await page.locator('#next-score').click();
  await expect(page.locator('#reader-title')).toHaveText('A');
  await expect(page.locator('#reader-queue-position')).toHaveText('2 / 2');
  await expect(page.locator('#next-score')).toBeDisabled();
  await page.locator('#close-reader').click();
  await page.getByRole('button', { name: 'Ver y ordenar', exact: true }).click();
  await expect(page.locator('.score-info h2')).toHaveText(['C', 'A']);
  await expect(page.locator('#sort')).toBeDisabled();
  await page.getByRole('button', { name: 'Subir A en la lista', exact: true }).click();
  await expect(page.locator('.score-info h2')).toHaveText(['A', 'C']);
  await page.locator('#list-view').click();
  await expect(page.locator('.score-info h2')).toHaveText(['A', 'C']);
  await page.getByRole('button', { name: 'Leer lista', exact: true }).click();
  await expect(page.locator('#reader-title')).toHaveText('A');
  await page.locator('#next-score').click();
  await expect(page.locator('#reader-title')).toHaveText('C');
  await page.locator('#close-reader').click();
  // Removing a selected item also removes its checkbox from this view.
  await page.getByRole('checkbox', { name: 'Añadir C a la lista', exact: true }).click();
  await expect(page.locator('.score-info h2')).toHaveText(['A']);
  await page.locator('#clear-reading-list').click();
  await expect(page.getByText('Tu lista está vacía', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir partituras', exact: true }).click();
  await expect(page.locator('.score-card')).toHaveCount(3);
});

test('recuerda subcarpetas, ubicación y lista sin cargar todas las partituras al volver', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('Música', { create: true }),
    });
  });
  await page.goto('/');
  const bytes = [...(await pdf(['Biblioteca guardada']))];
  await page.evaluate(async (bytes) => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('Música', { create: true });
    for (const path of [
      'Piano/Clásico/A.pdf',
      'Piano/B.pdf',
      'Violín/C.pdf',
      '.trashed-123-A.pdf',
      '__MACOSX/._B.pdf',
      '.Trash/Eliminada.pdf',
    ]) {
      const parts = path.split('/');
      const name = parts.pop()!;
      let folder = root;
      for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true });
      const writer = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await writer.write(new Uint8Array(bytes));
      await writer.close();
    }
  }, bytes);
  await page.locator('.heading-actions [data-action="import"]').click();
  await page.locator('#pick-folder').click();
  await expect(page.locator('.score-card')).toHaveCount(3);
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await expect(page.locator('[data-folder="Música/Piano"]')).toBeHidden();
  await page.getByRole('button', { name: 'Mostrar subcarpetas de Música', exact: true }).click();
  await expect(page.locator('[data-folder="Música/Piano"]')).toBeVisible();
  await expect(page.locator('[data-folder="Música/Piano/Clásico"]')).toBeHidden();
  await page
    .getByRole('button', { name: 'Mostrar subcarpetas de Música/Piano', exact: true })
    .click();
  await page.locator('[data-folder="Música/Piano/Clásico"]').click();
  await expect(page.locator('.score-info h2')).toHaveText(['A']);
  await page.getByRole('checkbox', { name: 'Añadir A a la lista', exact: true }).check();
  await page.reload();
  await expect(page.locator('#heading')).toHaveText('Clásico');
  await expect(page.locator('#breadcrumb')).toHaveText('Música/Piano/Clásico');
  await expect(page.locator('.score-card')).toHaveCount(1);
  await expect(page.locator('[data-preview]')).toHaveCount(1);
  await expect(
    page.getByRole('checkbox', { name: 'Añadir A a la lista', exact: true }),
  ).toBeChecked();
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await expect(
    page.getByRole('button', { name: 'Ocultar subcarpetas de Música', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-folder="Música/Piano/Clásico"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Ocultar subcarpetas de Música/Piano', exact: true })
    .click();
  await expect(page.locator('[data-folder="Música/Piano/Clásico"]')).toBeHidden();
  await page.locator('[data-folder="Música/Violín"]').click();
  await page.getByRole('checkbox', { name: 'Añadir C a la lista', exact: true }).check();
  await page.getByRole('button', { name: 'Ver y ordenar', exact: true }).click();
  await expect(page.locator('.score-info h2')).toHaveText(['A', 'C']);
  await page.getByRole('button', { name: 'Subir C en la lista', exact: true }).click();
  await page.reload();
  await expect(page.locator('#heading')).toHaveText('Tu lista de lectura');
  await expect(page.locator('.score-info h2')).toHaveText(['C', 'A']);
  await page.getByRole('button', { name: 'Leer lista', exact: true }).click();
  await expect(page.locator('#reader-title')).toHaveText('C');
  await page.locator('#next-score').click();
  await expect(page.locator('#reader-title')).toHaveText('A');
  await page.locator('#close-reader').click();
  if (page.viewportSize()!.width <= 650) await page.locator('#menu').click();
  await expect(page.locator('[data-folder="Música/Piano/Clásico"]')).toBeHidden();
  await page.screenshot({
    path: `/tmp/atril-library-tree-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('renderiza partituras con densidad nativa y renueva la resolución al ampliar', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const document = await PDFDocument.create();
  const sheet = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  sheet.drawText('Thin staff lines', { x: 60, y: 750, size: 18, font });
  for (let line = 0; line < 5; line++) {
    sheet.drawLine({
      start: { x: 60, y: 700 + line * 7 },
      end: { x: 535, y: 700 + line * 7 },
      thickness: 0.2,
    });
  }
  await page.locator('#file-input').setInputFiles({
    name: 'Nitidez.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await document.save()),
  });
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  async function expectResolution(selector: string) {
    await expect
      .poll(async () =>
        page.locator(selector).evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const expected = devicePixelRatio * (visualViewport?.scale || 1);
          return Math.abs(canvas.width / parseFloat(canvas.style.width) - expected);
        }),
      )
      .toBeLessThan(0.02);
  }
  await expectResolution('#pdf-canvas');
  const width = await page
    .locator('#pdf-canvas')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).width);
  await page.locator('#zoom-in').click();
  await expect(page.locator('#zoom-label')).toHaveText('125%');
  await expect
    .poll(async () =>
      page.locator('#pdf-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(width);
  await expectResolution('#pdf-canvas');
  await page.getByRole('button', { name: 'Dividir y buscar', exact: true }).click();
  await page.locator('[data-secondary-open]').click();
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await expectResolution('#secondary-canvas');
  // Browser pinch zoom must trigger a new bitmap instead of magnifying old pixels.
  if (page.viewportSize()!.width <= 650) {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
    await expect.poll(() => page.evaluate(() => visualViewport?.scale)).toBeCloseTo(1.5, 1);
    await expectResolution('#pdf-canvas');
    await expectResolution('#secondary-canvas');
    await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await session.detach();
  }
  await page.screenshot({ path: `/tmp/atril-pdf-resolution-${test.info().project.name}.png` });
});

test('selecciona con pulsación prolongada sin abrir el PDF y conserva toques y scroll', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const buffer = await pdf(['Selección táctil']);
  await page
    .locator('#file-input')
    .setInputFiles(
      ['A', 'B', 'C'].map((name) => ({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer })),
    );
  await expect(page.locator('.score-card')).toHaveCount(3);
  const touch = await context.newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  async function start(name: string) {
    const score = page.getByRole('button', { name: `Abrir ${name}`, exact: true });
    await score.scrollIntoViewIfNeeded();
    const bounds = (await score.boundingBox())!;
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + 30 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    return point;
  }
  async function end() {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await start('B');
  await expect(
    page.getByRole('checkbox', { name: 'Añadir B a la lista', exact: true }),
  ).toBeChecked();
  await end();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#reading-list-count')).toHaveText('1');
  await start('C');
  await expect(
    page.getByRole('checkbox', { name: 'Añadir C a la lista', exact: true }),
  ).toBeChecked();
  await end();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#reading-list-count')).toHaveText('2');
  await start('B');
  await expect(
    page.getByRole('checkbox', { name: 'Añadir B a la lista', exact: true }),
  ).not.toBeChecked();
  await end();
  await expect(page.locator('#reading-list-count')).toHaveText('1');
  await expect(page.locator('#reader')).toBeHidden();
  // A short touch opens normally, without changing the selection.
  await start('A');
  await end();
  await expect(page.locator('#reader-title')).toHaveText('A');
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await page.locator('#close-reader').click();
  // Moving to scroll cancels the hold even if the finger remains down afterwards.
  await expect(page.locator('#reader')).toBeHidden();
  await page.setViewportSize({ ...page.viewportSize()!, height: 480 });
  const point = await start('A');
  const before = await page.evaluate(() => scrollY);
  for (let step = 1; step <= 5; step++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x, y: point.y + step * 12 }],
    });
  }
  await page.waitForTimeout(500); // Hold beyond the long-press threshold after scrolling.
  await end();
  await expect(
    page.getByRole('checkbox', { name: 'Añadir A a la lista', exact: true }),
  ).not.toBeChecked();
  await expect(page.locator('#reader')).toBeHidden();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before);
  // The same delegated handler works after switching to rows.
  await page.locator('#list-view').click();
  await start('B');
  await expect(
    page.getByRole('checkbox', { name: 'Añadir B a la lista', exact: true }),
  ).toBeChecked();
  await end();
  await expect(page.locator('#reader')).toBeHidden();
  await touch.detach();
});

test('ofrece acciones táctiles amplias y separadas en móvil y tablet', async ({ page }) => {
  const bytes = [...(await pdf(['Estudio táctil']))];
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.evaluate((data) => {
      const input = document.querySelector<HTMLInputElement>('#folder-input')!;
      const transfer = new DataTransfer();
      const file = new File([new Uint8Array(data)], 'Estudio.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'webkitRelativePath', { value: 'Repertorio/Piano/Estudio.pdf' });
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    }, bytes);
    await expect(page.locator('.score-card')).toHaveCount(1);
    await expect(page.locator('.heading-actions .button').first()).toHaveCSS('font-size', '15px');
    await expect(page.locator('#library-search')).toHaveCSS('font-size', '16px');
    const favorite = page.locator('[data-favorite]');
    const remove = page.locator('[data-remove]');
    for (const view of ['#grid-view', '#list-view']) {
      await page.locator(view).click();
      const first = (await favorite.boundingBox())!;
      const second = (await remove.boundingBox())!;
      expect(first.width).toBeGreaterThanOrEqual(44);
      expect(first.height).toBeGreaterThanOrEqual(44);
      expect(second.width).toBeGreaterThanOrEqual(44);
      expect(second.height).toBeGreaterThanOrEqual(44);
      expect(second.x - (first.x + first.width)).toBeGreaterThanOrEqual(4);
    }
    await favorite.click();
    await expect(favorite).toHaveClass(/is-favorite/);
    await expect(page.locator('#reader')).toBeHidden();
    await remove.click();
    await expect(page.locator('#delete-dialog')).toBeVisible();
    await page.locator('#cancel-delete').click();
    if (width <= 650) await page.locator('#menu').click();
    for (const selector of ['.folder-toggle', '.folder-heading .icon-button']) {
      const bounds = (await page.locator(selector).first().boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    if (width <= 650) await page.locator('#menu').click();
    await page.getByRole('button', { name: 'Abrir Estudio', exact: true }).click();
    await expect(page.locator('#pdf-canvas')).toBeVisible();
    for (const selector of ['#close-reader', '#reader-theme', '.zoom-controls .icon-button']) {
      const bounds = (await page.locator(selector).first().boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#close-reader').click();
    await expect(page.locator('#reader')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
});
