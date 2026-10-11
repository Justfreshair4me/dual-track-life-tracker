// Reproduce a file preview mounted beneath a URL prefix, without Vite transforms.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const prefix = '/preview/dual-track-life-tracker/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) throw new Error('Outside preview');
    let relative = pathname.slice(prefix.length) || 'index.html';
    if (['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'].includes(relative)) relative = 'public/' + relative;
    const full = path.resolve(root, relative);
    if (!full.startsWith(root) || (!relative.startsWith('src/') && !relative.startsWith('public/') && relative !== 'index.html')) throw new Error('Outside app');
    const body = await readFile(full);
    response.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4174, '127.0.0.1');
