import { defineConfig } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Generate a cache of the exact production files. No CDN or external requests.
export default defineConfig({
  base: './',
  plugins: [{
    name: 'local-offline-app',
    async closeBundle() {
      async function filesIn(directory) {
        const result = [];
        for (const file of await readdir(directory, { withFileTypes: true })) {
          const full = path.join(directory, file.name);
          if (file.isDirectory()) result.push(...await filesIn(full));
          else if (file.name !== 'sw.js') result.push(full);
        }
        return result;
      }
      const files = (await filesIn('dist')).sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(await readFile(file));
      const cache = `dual-track-shell-${hash.digest('hex').slice(0, 16)}`;
      const urls = files.map(file => './' + path.relative('dist', file).split(path.sep).join('/'));
      await writeFile('dist/sw.js', `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dual-track-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    // Only our precached, static app files live in this cache. Preview servers
    // vary responses by Origin; module requests add that header on reload.
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || fetch(event.request);
    return fetch(event.request);
  }));
});
`);
    }
  }]
});
