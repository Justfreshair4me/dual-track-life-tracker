import { test, expect } from '@playwright/test';

const appPath = '/dual-track-life-tracker/';

test('Pages CSS, JavaScript, manifest, and icons stay inside the app subdirectory', async ({ page, request }) => {
  const resources = [];
  const failures = [];
  page.on('requestfailed', req => failures.push(req.url()));
  page.on('response', response => {
    if (/\.(css|js|png|svg|webmanifest)(\?|$)/.test(response.url())) resources.push(response);
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-app-status', 'ready');
  expect(new URL(page.url()).pathname).toBe(appPath);
  expect(await page.locator('#record').evaluate(node => getComputedStyle(node).width)).toBe('92px');
  const manifest = await (await request.get('manifest.webmanifest')).json();
  const manifestURL = new URL('manifest.webmanifest', page.url());
  expect(new URL(manifest.start_url, manifestURL).pathname).toBe(appPath);
  expect(new URL(manifest.scope, manifestURL).pathname).toBe(appPath);
  for (const asset of ['icon.svg', ...manifest.icons.map(icon => icon.src)]) {
    const response = await request.get(asset);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/');
  }
  expect(resources.some(response => response.headers()['content-type']?.includes('text/css'))).toBe(true);
  expect(resources.some(response => response.headers()['content-type']?.includes('javascript'))).toBe(true);
  for (const response of resources) {
    expect(new URL(response.url()).pathname.startsWith(appPath)).toBe(true);
    expect(response.status()).toBeLessThan(400);
  }
  expect(failures).toEqual([]);
});

test('offline worker is scoped to the Pages app and never caches journal data', async ({ page }) => {
  await page.goto('./');
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, script: registration.active.scriptURL };
  });
  expect(new URL(worker.scope).pathname).toBe(appPath);
  expect(new URL(worker.script).pathname).toBe(appPath + 'sw.js');
  const cachedPaths = await page.evaluate(async () => {
    const paths = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      paths.push(...(await cache.keys()).map(req => new URL(req.url).pathname));
    }
    return paths;
  });
  expect(cachedPaths.length).toBeGreaterThan(0);
  expect(cachedPaths.every(path => path.startsWith(appPath))).toBe(true);
  expect(cachedPaths.some(path => path.endsWith('.css'))).toBe(true);
  expect(cachedPaths.some(path => path.endsWith('.js'))).toBe(true);
});
