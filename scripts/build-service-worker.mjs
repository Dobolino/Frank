import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');

async function collect(directory, relative = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path.join(directory, entry.name), file));
    // Startbildschirme lädt iOS beim Hinzufügen zum Home-Bildschirm selbst, sie gehören nicht in den Offline-Cache
    else if (entry.isFile() && file !== 'sw.js' && !file.endsWith('.map') && !file.startsWith('splash/')) result.push(file);
  }
  return result;
}

const files = (await collect(dist)).sort();
if (!files.includes('index.html') || !files.some((file) => file.endsWith('.js')) || !files.some((file) => file.endsWith('.css'))) {
  throw new Error('Vollständiger Vite-Build fehlt: index.html, JavaScript und CSS werden benötigt.');
}
const template = await readFile(path.join(root, 'public/sw.js'), 'utf8');
const versionMarker = '__FRANK_BUILD_VERSION__';
const fileMarker = '/* __FRANK_PRECACHE__ */ []';
if (!template.includes(versionMarker) || !template.includes(fileMarker)) {
  throw new Error('Die Service-Worker-Vorlage enthält nicht die erwarteten Build-Marker.');
}
const hash = createHash('sha256').update(template);
for (const file of files) hash.update(file).update('\0').update(await readFile(path.join(dist, file)));
const version = hash.digest('hex').slice(0, 20);
const urls = files.map((file) => file === 'index.html' ? './' : `./${file}`);
await writeFile(path.join(dist, 'sw.js'), template.replace(versionMarker, version).replace(fileMarker, JSON.stringify(urls)));
console.log(`Offline-Build ${version}: ${urls.length} Dateien vorgemerkt (inkl. HTML, JavaScript und CSS).`);
