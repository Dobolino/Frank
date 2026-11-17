#!/usr/bin/env node
/**
 * Erzeugt die iOS-Startbildschirme (apple-touch-startup-image) für alle iPhone-Grössen
 * und schreibt die passenden <link>-Zeilen in index.html (zwischen splash:start und splash:end).
 *
 *   node scripts/generate-splash.mjs
 *
 * Braucht Playwright mit Chromium (nur zum Erzeugen, nicht im Build). Die PNG-Dateien
 * liegen im Repository, damit der Build ohne Browser auskommt.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'public/splash');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

/** iPhone-Bildschirme hochkant: CSS-Breite × CSS-Höhe @ Pixeldichte (iPhone SE 1 bis iPhone 17). */
export const DEVICES = [
  [320, 568, 2], // SE (1. Gen.)
  [375, 667, 2], // SE (2./3. Gen.), 8, 7, 6s
  [414, 736, 3], // 8 Plus, 7 Plus
  [375, 812, 3], // X, XS, 11 Pro, 12 mini, 13 mini
  [414, 896, 2], // XR, 11
  [414, 896, 3], // XS Max, 11 Pro Max
  [390, 844, 3], // 12, 12 Pro, 13, 13 Pro, 14, 16e
  [428, 926, 3], // 12 Pro Max, 13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [420, 912, 3], // Air
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
];

const BACKGROUND = '#0b0d12';
const icon = (await readFile(path.join(root, 'public/icon-512.png'))).toString('base64');

const html = (w) => `<!doctype html><html><body style="margin:0;background:${BACKGROUND};height:100vh;display:flex;align-items:center;justify-content:center">
<img src="data:image/png;base64,${icon}" style="width:${Math.round(w * 0.3)}px;height:${Math.round(w * 0.3)}px;border-radius:22%">
</body></html>`;

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const links = [];
for (const [w, h, dpr] of DEVICES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await page.setContent(html(w));
  const name = `splash-${w * dpr}x${h * dpr}.png`;
  await page.screenshot({ path: path.join(out, name) });
  await page.close();
  links.push(
    `    <link rel="apple-touch-startup-image" href="./splash/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
  );
}
await browser.close();
// Links zwischen den Markierungen in index.html ersetzen
const indexPath = path.join(root, 'index.html');
const index = await readFile(indexPath, 'utf8');
const start = '    <!-- splash:start -->';
const end = '    <!-- splash:end -->';
if (!index.includes(start) || !index.includes(end)) throw new Error('Markierungen splash:start/end fehlen in index.html');
const before = index.slice(0, index.indexOf(start) + start.length);
const after = index.slice(index.indexOf(end));
await writeFile(indexPath, `${before}\n${links.join('\n')}\n${after}`);
console.log(`${DEVICES.length} Startbildschirme in public/splash/, Links in index.html aktualisiert`);
