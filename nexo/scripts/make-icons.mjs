// Genera los PNG de la PWA desde public/icons/icon.svg usando Chromium (Playwright).
// Uso: npm run icons  (requiere `npx playwright` o PLAYWRIGHT_BROWSERS_PATH)
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/icons/${f}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0], ['icon-maskable-512.png', 512, 0.12]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<body style="margin:0;background:#0f172a;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
  await page.screenshot({ path: out(file) });
}
await browser.close();
