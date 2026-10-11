import { test, expect } from '@playwright/test';

test('offline app update waits for old tabs, replaces only shell caches, and preserves existing IndexedDB entries', async ({ page, context }) => {
  let olderShell = true;
  await context.route('**/sw.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: olderShell ? source.replace(/dual-track-shell-[a-f0-9]{16}/, '$&-previous') : source });
  });
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some(key => key.endsWith('-previous')))).toBe(true);
  await page.locator('#entry-text').fill('Fictional memory saved before app update');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('before app update');
  olderShell = false;
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state)).toBe('installed');
  // Same procedure users follow: close app tabs, then reopen. No site-data reset.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('http://localhost:4173/dual-track-life-tracker/');
  await expect.poll(() => reopened.evaluate(async () => (await caches.keys()).some(key => key.endsWith('-previous')))).toBe(false);
  await expect(reopened.locator('#recent-list')).toContainText('before app update');
  await context.setOffline(true);
  await reopened.reload();
  await expect(reopened.locator('#recent-list')).toContainText('before app update');
  await reopened.locator('#entry-text').fill('Fictional offline note after update');
  await reopened.locator('#save-entry').click();
  await expect(reopened.locator('#recent-list')).toContainText('offline note after update');
});
