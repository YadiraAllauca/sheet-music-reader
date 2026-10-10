import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// One editable vector source for the interface, favicon, and installed app.
const source = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const [filename, size, fullBleed] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, true],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${source}`,
    );
    if (fullBleed)
      await page.locator('svg > rect').evaluate((background) => background.setAttribute('rx', '0'));
    await page.screenshot({
      path: fileURLToPath(new URL(`../public/${filename}`, import.meta.url)),
      omitBackground: true,
    });
    await page.close();
    console.log(`Generated ${filename} (${size} × ${size}).`);
  }
} finally {
  await browser.close();
}
