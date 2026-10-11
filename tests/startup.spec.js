import { test, expect } from '@playwright/test';

test('blocked application scripts leave an honest startup notice and disabled save', async ({ page }) => {
  await page.route('**/assets/*.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#app-startup')).toBeVisible();
  await expect(page.locator('#app-startup')).toContainText('server-p1-3');
  await expect(page.locator('#save-entry')).toBeDisabled();
  await expect(page.locator('#record')).toBeDisabled();
  await expect(page.locator('#entry-text')).toBeDisabled();
});

test('module initialization failure is visible instead of silently leaving dead controls', async ({ page }) => {
  await page.route('**/src/main.js', route => route.abort());
  await page.goto('http://127.0.0.1:4174/preview/dual-track-life-tracker/');
  await expect(page.locator('html')).toHaveAttribute('data-app-status', 'initialization-failed');
  await expect(page.locator('#app-startup')).toContainText('could not start');
  await expect(page.locator('#save-entry')).toBeDisabled();
});

test('storage permission denial is identified and does not enable save', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => { throw new DOMException('Storage denied', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-status', 'storage-failed');
  await expect(page.locator('#app-startup')).toContainText('SecurityError');
  await expect(page.locator('#save-entry')).toBeDisabled();
});
