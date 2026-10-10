import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

// Original demonstration notation; no private or third-party scores are captured.
async function sample(title, seed) {
  const pdf = await PDFDocument.create();
  const heading = await pdf.embedFont(StandardFonts.TimesRoman);
  const text = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.16, 0.16, 0.16);
  for (let number = 1; number <= 2; number++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(title, { x: 60, y: 775, size: 27, font: heading, color: ink });
    page.drawText('ATRIL DEMO  /  ORIGINAL PRACTICE NOTATION', {
      x: 60,
      y: 747,
      size: 8,
      font: text,
      color: rgb(0.5, 0.45, 0.4),
    });
    page.drawText('Andante', { x: 60, y: 714, size: 11, font: heading });
    for (let system = 0; system < 7; system++) {
      const baseline = 665 - system * 82;
      for (let line = 0; line < 5; line++) {
        page.drawLine({
          start: { x: 60, y: baseline + line * 7 },
          end: { x: 535, y: baseline + line * 7 },
          thickness: 0.5,
          color: ink,
        });
      }
      for (let bar = 0; bar <= 4; bar++) {
        const x = 60 + bar * 118.75;
        page.drawLine({
          start: { x, y: baseline },
          end: { x, y: baseline + 28 },
          thickness: 0.7,
          color: ink,
        });
      }
      for (let note = 0; note < 16; note++) {
        const x = 77 + note * 29.4;
        const y = baseline + ((note + system + seed + number) % 8) * 3.5;
        page.drawEllipse({ x, y, xScale: 4, yScale: 2.8, rotate: degrees(18), color: ink });
        page.drawLine({
          start: { x: x + 3.5, y },
          end: { x: x + 3.5, y: y + 24 },
          thickness: 0.8,
          color: ink,
        });
      }
    }
    page.drawText(`${number} / 2`, { x: 285, y: 38, size: 9, font: text });
  }
  return Buffer.from(await pdf.save());
}

const port = 4175;
const url = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: 'inherit' },
);
let browser;
try {
  const deadline = Date.now() + 20000;
  while (true) {
    if (server.exitCode !== null) throw new Error('The preview server failed to start.');
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Server is starting. */
    }
    if (Date.now() > deadline) throw new Error('Preview server startup timed out.');
    await delay(150);
  }
  await mkdir('docs/images', { recursive: true });
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(url);
  const names = [
    'Morning Study',
    'Evening Waltz',
    'Quiet Prelude',
    'Violin Practice',
    'Piano Study',
    'Rehearsal Notes',
  ];
  const files = await Promise.all(
    names.map(async (name, index) => ({
      name: `${name}.pdf`,
      mimeType: 'application/pdf',
      buffer: await sample(name, index),
    })),
  );
  await page.locator('#file-input').setInputFiles(files);
  await expect(page.locator('.score-thumbnail')).toHaveCount(6);
  await page.locator('[data-favorite="Importados/Morning Study.pdf"]').click();
  await expect(page.locator('[data-favorite="Importados/Morning Study.pdf"]')).toHaveClass(
    /is-favorite/,
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.locator('#toast')).toBeHidden({ timeout: 10000 });
  await page.screenshot({ path: 'docs/images/library.png' });
  await page.getByRole('button', { name: 'Abrir Morning Study', exact: true }).click();
  await expect(page.locator('#pdf-canvas')).toBeVisible();
  await page.locator('#reader-queue-toggle').click();
  await expect(page.locator('.queue-score')).toHaveCount(4);
  await page.screenshot({ path: 'docs/images/queue.png' });
  await page.locator('#close-search').click();
  await page.getByRole('button', { name: 'Dividir y buscar', exact: true }).click();
  await page.locator('#secondary-query').fill('Evening Waltz');
  await page.locator('[data-secondary-open]').click();
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await page.screenshot({ path: 'docs/images/split-reader.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#secondary-canvas')).toBeVisible();
  await delay(250); // Allow debounced PDF resizing to settle before capture.
  await page.screenshot({ path: 'docs/images/mobile-reader.png' });
  console.log('Saved portfolio screenshots to docs/images/.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
