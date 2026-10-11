import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function note(page, text, mode = 'personal') {
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('#' + mode).click();
  await page.locator('#entry-text').fill(text);
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText(text);
}
async function settings(page) { await page.getByRole('link', { name: 'Settings', exact: true }).click(); }
async function exportFile(page) {
  await settings(page);
  const download = page.waitForEvent('download');
  await page.locator('#export-backup').click();
  const result = await download;
  expect(result.suggestedFilename()).toMatch(/\.dtbackup$/);
  return readFile(await result.path());
}
async function importFile(page, bytes) {
  await settings(page);
  await page.locator('#backup-file').setInputFiles({ name: 'fictional.dtbackup', mimeType: 'application/octet-stream', buffer: bytes });
}
async function rows(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('dual-track-life-tracker', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('entries').objectStore('entries').getAll();
      get.onsuccess = () => {
        resolve(get.result.map(({ audio, ...data }) => ({ ...data, audioSize: audio?.size || 0, audioType: audio?.type || '' })));
        db.close();
      };
    };
  }));
}
function readManifest(buffer) {
  return JSON.parse(buffer.subarray(44, 44 + buffer.readUInt32LE(8)).toString());
}
function rewriteManifest(buffer, change) {
  const manifest = readManifest(buffer);
  change(manifest);
  const bytes = Buffer.from(JSON.stringify(manifest));
  const header = Buffer.alloc(44);
  header.write('DTLTBK01');
  header.writeUInt32LE(bytes.length, 8);
  createHash('sha256').update(bytes).digest().copy(header, 12);
  return Buffer.concat([header, bytes, buffer.subarray(44 + buffer.readUInt32LE(8))]);
}

test('exports all modes and metadata; restores on another device and skips exact duplicates', async ({ page, browser }) => {
  await page.goto('./');
  await note(page, 'Fictional picnic with Alex');
  await page.locator('#recent-list .entry-card').click();
  await page.locator('#edit-text').fill('Fictional picnic with Alex — edited note');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('#recent-list')).toContainText('edited note');
  await note(page, 'Fictional Orion meeting', 'work');
  const original = await rows(page);
  const bytes = await exportFile(page);
  const metadata = readManifest(bytes);
  expect(metadata.entries).toHaveLength(2);
  expect(metadata.entries.map(item => item.data.originalText).sort()).toEqual(original.map(row => row.originalText).sort());
  expect(metadata.entries.some(item => item.data.text !== item.data.originalText)).toBe(true);
  expect(metadata.entries.every(item => item.audio === null)).toBe(true);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  await phone.goto('http://localhost:4173/dual-track-life-tracker/');
  await importFile(phone, bytes);
  await expect(phone.locator('#backup-summary')).toContainText('Backup date:');
  await expect(phone.locator('#backup-summary')).toContainText('2 entries: 1 Personal, 1 Work');
  await expect(phone.locator('#backup-summary')).toContainText('0 original recordings');
  expect(await rows(phone)).toHaveLength(0);
  await phone.locator('#confirm-restore').click();
  await expect(phone.locator('#backup-status')).toContainText('Restore complete');
  expect(await rows(phone)).toEqual(original);
  await phone.reload();
  await phone.getByRole('link', { name: 'History', exact: true }).click();
  await expect(phone.locator('#history-list')).toContainText('picnic');
  await expect(phone.locator('#history-list')).not.toContainText('Orion');
  await phone.locator('#work').click();
  await expect(phone.locator('#history-list')).toContainText('Orion');
  await importFile(phone, bytes);
  await expect(phone.locator('#backup-summary')).toContainText('skip 2 identical');
  await phone.locator('#confirm-restore').click();
  await expect(phone.locator('#backup-status')).toContainText('Restore complete');
  expect(await rows(phone)).toHaveLength(2);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mobile.close();
});

test('conflicting duplicate IDs preserve both originals and reimport does not add more copies', async ({ page }) => {
  await page.goto('./');
  await note(page, 'Fictional original idea');
  const bytes = await exportFile(page);
  const changed = rewriteManifest(bytes, manifest => { manifest.entries[0].data.text = 'Fictional other-device edit'; });
  await importFile(page, changed);
  await expect(page.locator('#backup-summary')).toContainText('1 ID conflicts');
  await page.locator('#confirm-restore').click();
  await expect(page.locator('#backup-status')).toContainText('Restore complete');
  let data = await rows(page);
  expect(data.map(row => row.text).sort()).toEqual(['Fictional original idea', 'Fictional other-device edit'].sort());
  expect(new Set(data.map(row => row.id)).size).toBe(2);
  await importFile(page, changed);
  await expect(page.locator('#backup-summary')).toContainText('skip 1 identical');
  await page.locator('#confirm-restore').click();
  await expect(page.locator('#backup-status')).toContainText('Restore complete');
  data = await rows(page);
  expect(data).toHaveLength(2);
});

test('replacement requires confirmation; cancel preserves entries; successful replacement restores snapshot', async ({ page }) => {
  await page.goto('./');
  await note(page, 'Fictional saved backup note');
  const bytes = await exportFile(page);
  await note(page, 'Fictional newer work note', 'work');
  await importFile(page, bytes);
  await expect(page.locator('#backup-dialog')).toBeVisible();
  await page.locator('#replace-backup').check();
  await expect(page.locator('#replace-warning')).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#confirm-restore').click();
  expect(await rows(page)).toHaveLength(2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#confirm-restore').click();
  await expect(page.locator('#backup-status')).toContainText('Restore complete');
  expect((await rows(page)).map(row => row.text)).toEqual(['Fictional saved backup note']);
});

test('malformed, truncated, duplicate-ID, and damaged metadata files never change saved data', async ({ page }) => {
  await page.goto('./');
  await note(page, 'Fictional protected note');
  const before = await rows(page);
  const bytes = await exportFile(page);
  const damaged = Buffer.from(bytes); damaged[50] ^= 1;
  const duplicate = rewriteManifest(bytes, manifest => { manifest.entries.push(manifest.entries[0]); });
  const invalidMode = rewriteManifest(bytes, manifest => { manifest.entries[0].data.mode = 'unexpected'; });
  for (const bad of [Buffer.from('not a backup'), bytes.subarray(0, 40), damaged, duplicate, invalidMode, Buffer.concat([bytes, Buffer.from('extra')])]) {
    await importFile(page, bad);
    await expect(page.locator('#backup-status')).toContainText('Cannot import:');
    await expect(page.locator('#backup-dialog')).not.toBeVisible();
    expect(await rows(page)).toEqual(before);
  }
});

test('real recorded audio is exported, restored, and playable; corrupted audio is rejected', async ({ page, browser, context }) => {
  await context.grantPermissions(['microphone']);
  await page.goto('./');
  await page.locator('#entry-text').fill('Fictional recorded memory');
  await page.locator('#record').click();
  await expect(page.locator('#timer')).not.toHaveText('00:00');
  await page.locator('#stop-recording').click();
  await expect(page.locator('#recent-list')).toContainText('recorded memory');
  const before = await rows(page);
  const bytes = await exportFile(page);
  const manifest = readManifest(bytes);
  expect(manifest.entries[0].audio.size).toBe(before[0].audioSize);
  const destination = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await destination.newPage();
  await phone.goto('http://localhost:4173/dual-track-life-tracker/');
  await importFile(phone, bytes);
  await expect(phone.locator('#backup-summary')).toContainText('1 original recordings');
  await phone.locator('#confirm-restore').click();
  await expect(phone.locator('#backup-status')).toContainText('Restore complete');
  expect(await rows(phone)).toEqual(before);
  await phone.getByRole('link', { name: 'History', exact: true }).click();
  await phone.locator('#history-list .entry-card').click();
  await phone.locator('#detail-audio').evaluate(audio => audio.play());
  await expect.poll(() => phone.locator('#detail-audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
  await phone.locator('#close-detail').click();
  const corrupt = Buffer.from(bytes); corrupt[corrupt.length - 1] ^= 1;
  await importFile(phone, corrupt);
  await expect(phone.locator('#backup-status')).toContainText('recording checksum');
  expect(await rows(phone)).toEqual(before);
  await destination.close();
});

test('large audio is hashed in bounded chunks and restoration failure rolls back replacement', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/preview/dual-track-life-tracker/');
  const result = await page.evaluate(async () => {
    const storage = await import('./src/storage.js');
    const backup = await import('./src/backup.js');
    const now = new Date().toISOString();
    await storage.saveEntry({ id: 'fictional-large-audio', mode: 'work', createdAt: now, updatedAt: now,
      text: 'Fictional large audio fixture', originalText: 'Fictional large audio fixture', categories: [], schemaVersion: 1,
      audio: new Blob([new Uint8Array(12 * 1024 * 1024 + 17)], { type: 'audio/webm' }) });
    let largestRead = 0;
    const originalRead = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () { largestRead = Math.max(largestRead, this.size); return originalRead.call(this); };
    try {
      const exported = await backup.createBackup();
      const validated = await backup.validateBackup(exported.file);
      const reviewed = await backup.prepareRestore(validated);
      const before = await storage.readAllEntries();
      const originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('Simulated full storage', 'QuotaExceededError'); };
      let failure;
      try { await backup.restoreBackup(validated, reviewed, true); }
      catch (error) { failure = error.name; }
      finally { IDBObjectStore.prototype.add = originalAdd; }
      const after = await storage.readAllEntries();
      return { largestRead, chunk: backup.CHUNK_SIZE, size: exported.file.size,
        hashes: exported.manifest.entries[0].audio.hashes.length, failure,
        preserved: before[0].audio.size === after[0].audio.size && before[0].text === after[0].text };
    } finally { Blob.prototype.arrayBuffer = originalRead; }
  });
  expect(result.largestRead).toBeLessThanOrEqual(result.chunk);
  expect(result.hashes).toBe(13);
  expect(result.size).toBeGreaterThan(12 * 1024 * 1024);
  expect(result.failure).toBe('QuotaExceededError');
  expect(result.preserved).toBe(true);
});

test('changes after import review stop replacement without losing either record', async ({ page }) => {
  await page.goto('./');
  await note(page, 'Fictional initial note');
  const bytes = await exportFile(page);
  await importFile(page, bytes);
  await expect(page.locator('#backup-dialog')).toBeVisible();
  await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('dual-track-life-tracker', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('entries', 'readwrite');
      const now = new Date().toISOString();
      tx.objectStore('entries').add({ id: 'fictional-other-tab', mode: 'personal', text: 'Fictional other-tab note', originalText: 'Fictional other-tab note', createdAt: now, updatedAt: now, categories: [], schemaVersion: 1, audio: null });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.locator('#replace-backup').check();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#confirm-restore').click();
  await expect(page.locator('#restore-status')).toContainText('Records changed since review');
  expect(await rows(page)).toHaveLength(2);
});

test('backup export and merge work offline after app installation', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await note(page, 'Fictional offline backup note');
  await context.setOffline(true);
  await page.reload();
  const bytes = await exportFile(page);
  await importFile(page, bytes);
  await expect(page.locator('#backup-summary')).toContainText('skip 1 identical');
  await page.locator('#confirm-restore').click();
  await expect(page.locator('#backup-status')).toContainText('Restore complete');
  expect(await rows(page)).toHaveLength(1);
});

test('changed audio bytes with identical metadata and size stop restore after review', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/preview/dual-track-life-tracker/');
  const result = await page.evaluate(async () => {
    const storage = await import('./src/storage.js');
    const backup = await import('./src/backup.js');
    const now = new Date().toISOString();
    const record = { id: 'fictional-audio-change', mode: 'personal', createdAt: now, updatedAt: now,
      text: 'Fictional audio conflict', originalText: 'Fictional audio conflict', categories: [], schemaVersion: 1,
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) };
    await storage.saveEntry(record);
    const exported = await backup.createBackup();
    const imported = await backup.validateBackup(exported.file);
    const reviewed = await backup.prepareRestore(imported);
    await storage.saveEntry({ ...record, audio: new Blob([new Uint8Array([4, 5, 6])], { type: 'audio/webm' }) });
    let error;
    try { await backup.restoreBackup(imported, reviewed, true); } catch (failure) { error = failure.message; }
    const saved = await storage.getEntry(record.id);
    return { error, preserved: [...new Uint8Array(await saved.audio.arrayBuffer())] };
  });
  expect(result.error).toContain('Recordings changed since review');
  expect(result.preserved).toEqual([4, 5, 6]);
});
