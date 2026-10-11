import { test, expect } from '@playwright/test';
import { playStoredAudio } from './audio-helpers.js';

async function writeNote(page, text) {
  await page.locator('#entry-text').fill(text);
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('#recent-list')).toContainText(text);
}
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('dual-track-life-tracker', 1);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('entries').objectStore('entries').getAll();
      read.onsuccess = () => { resolve(read.result.map(({ audio, ...entry }) => ({ ...entry, audioSize: audio?.size || 0 }))); db.close(); };
      read.onerror = () => reject(read.error);
    };
  }));
}

test('notes persist after closing the page, modes stay separate, and edits preserve originals', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('#personal')).toHaveAttribute('aria-pressed', 'true');
  await writeNote(page, 'Fictional picnic with Alex.');
  await page.locator('#work').click();
  await expect(page.locator('#recent-list')).not.toContainText('picnic');
  await writeNote(page, 'Fictional Orion project meeting.');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('./#history');
  await expect(reopened.locator('#history-list')).toContainText('picnic');
  await expect(reopened.locator('#history-list')).not.toContainText('Orion');
  await reopened.locator('#history-list .entry-card').click();
  await reopened.locator('#edit-text').fill('Fictional picnic with Alex by the lake.');
  await reopened.getByRole('button', { name: 'Save changes' }).click();
  await expect(reopened.locator('#history-list')).toContainText('by the lake');
  const data = await records(reopened);
  expect(data).toHaveLength(2);
  expect(data.find(entry => entry.mode === 'personal').originalText).toBe('Fictional picnic with Alex.');
  await reopened.locator('#work').click();
  await expect(reopened.locator('#history-list')).toContainText('Orion');
  await expect(reopened.locator('#history-list')).not.toContainText('picnic');
});

test('empty notes cannot save; mode cannot change mid-draft; deletion requires confirmation', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('#message')).toContainText('Write a note');
  expect(await records(page)).toHaveLength(0);
  await page.locator('#entry-text').fill('Fictional garden idea');
  await expect(page.locator('#work')).toBeDisabled();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('#recent-list')).toContainText('garden idea');
  await page.locator('#recent-list .entry-card').click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete entry' }).click();
  expect(await records(page)).toHaveLength(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete entry' }).click();
  await expect(page.locator('#recent-list')).not.toContainText('garden idea');
  expect(await records(page)).toHaveLength(0);
});

test('notes are rendered as text, not executable markup', async ({ page }) => {
  await page.goto('./');
  const text = '<img src=x onerror="window.injected=true">';
  await writeNote(page, text);
  await expect(page.locator('#recent-list img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('install manifest and icons are available without external app requests', async ({ page, request }) => {
  const remoteRequests = [];
  page.on('request', req => {
    if (new URL(req.url()).origin !== 'http://localhost:4173') remoteRequests.push(req.url());
  });
  await page.goto('./');
  await expect(page.locator('#recent-list')).toContainText('story starts here');
  const response = await request.get('manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
  }
  expect(remoteRequests).toEqual([]);
});

test('recording saves a real audio blob, plays back, persists, and cancellation discards audio', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.locator('#record-status')).toContainText('Recording locally');
  await expect(page.locator('#timer')).not.toHaveText('00:00');
  await page.getByRole('button', { name: 'Stop & save recording' }).click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].audioSize).toBeGreaterThan(100);
  await page.reload();
  await page.locator('#recent-list .entry-card').click();
  await playStoredAudio(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.locator('#record-status')).toContainText('Recording locally');
  await page.getByRole('button', { name: 'Cancel recording' }).click();
  await expect(page.locator('#message')).toContainText('canceled');
  expect(await records(page)).toHaveLength(1);
});

test('permission denial still allows written notes', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.locator('#message')).toContainText('permission was denied');
  await writeNote(page, 'Fictional typed memory after permission denial');
});

test('a failed save preserves the draft and can be retried', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = original;
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await page.locator('#entry-text').fill('Fictional recoverable note');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('#message')).toContainText('storage is full');
  await expect(page.locator('#entry-text')).toHaveValue('Fictional recoverable note');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('#recent-list')).toContainText('recoverable note');
  expect(await records(page)).toHaveLength(1);
});

test('installed shell reopens offline and saves notes without network', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await writeNote(page, 'Fictional online memory');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#recent-list')).toContainText('online memory');
  await writeNote(page, 'Fictional offline memory');
  await page.reload();
  await expect(page.locator('#recent-list')).toContainText('offline memory');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`layout fits ${viewport.width}px and core buttons have touch-sized targets`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['record', 'personal', 'work', 'save-entry']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await page.goto('./#settings');
    await page.locator('#theme').selectOption('dark');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  });
}
