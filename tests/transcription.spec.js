import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { simulateSpeech } from './speech-provider.js';
import { playStoredAudio } from './audio-helpers.js';

const consent = { version: 1, mode: 'online', onlineConsent: true };
async function settings(page) { await page.getByRole('link', { name: 'Settings', exact: true }).click(); }
async function home(page) { await page.getByRole('link', { name: 'Home', exact: true }).click(); }
async function enableOnline(page, accept = true) {
  await settings(page);
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('external recognition provider');
    expect(dialog.message()).toContain('not guaranteed offline or private');
    await (accept ? dialog.accept() : dialog.dismiss());
  });
  await page.locator('#transcription-mode').selectOption('online');
}
async function record(page) {
  await home(page);
  await page.locator('#record').click();
  await expect(page.locator('#timer')).not.toHaveText('00:00');
}
async function review(page) {
  await page.locator('#stop-recording').click();
  await expect(page.locator('#audio-draft')).toBeVisible();
  await expect(page.locator('#save-entry')).toBeEnabled();
}
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('dual-track-life-tracker', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('entries').objectStore('entries').getAll();
      read.onsuccess = async () => {
        const entries = await Promise.all(read.result.map(async ({ audio, ...data }) => {
          const digest = audio ? await crypto.subtle.digest('SHA-256', await audio.arrayBuffer()) : null;
          return { ...data, audioSize: audio?.size || 0, audioHash: digest ? [...new Uint8Array(digest)].join(',') : null };
        }));
        db.close(); resolve(entries);
      };
    };
  }));
}

test.beforeEach(async ({ context }) => { await context.grantPermissions(['microphone']); });

test('default off and rejected online consent never start recognition; ordinary recordings still save', async ({ page }) => {
  await simulateSpeech(page);
  await page.goto('./');
  await expect(page.locator('#transcription-mode')).toHaveValue('off');
  await enableOnline(page, false);
  await expect(page.locator('#transcription-mode')).toHaveValue('off');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([]);
  expect((await records(page))[0].audioSize).toBeGreaterThan(0);
});

test('an online preference without recorded consent stays off; revoking valid consent prevents future recognition', async ({ page }) => {
  await simulateSpeech(page, { preference: { version: 1, mode: 'online', onlineConsent: false } });
  await page.goto('./');
  await expect(page.locator('#transcription-mode')).toHaveValue('off');
  await enableOnline(page);
  await expect(page.locator('#transcription-mode')).toHaveValue('online');
  await page.locator('#transcription-mode').selectOption('off');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([]);
});

test('unsupported browser still records and saves audio with transcription off', async ({ page }) => {
  await simulateSpeech(page, { unsupported: true });
  await page.goto('./');
  await settings(page);
  await expect(page.locator('#enable-local')).toBeDisabled();
  await expect(page.locator('#transcription-settings-status')).toContainText('unavailable');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  expect((await records(page))[0].audioSize).toBeGreaterThan(0);
});

test('successful transcription is reviewed and edited; raw text and original audio survive mode separation and backup transfer', async ({ page, browser }) => {
  await simulateSpeech(page, { delay: 500 });
  await page.goto('./');
  await enableOnline(page);
  await home(page);
  await page.locator('#work').click();
  await page.locator('#entry-text').fill('Fictional extra context');
  await record(page);
  await page.locator('#entry-text').fill('Fictional context added during recording');
  await page.locator('#stop-recording').click();
  await expect(page.locator('#transcription-status')).toContainText('Processing transcription');
  await expect(page.locator('#save-entry')).toBeDisabled();
  await expect(page.locator('#transcription-status')).toContainText('Transcription successful');
  expect(await records(page)).toHaveLength(0);
  await expect(page.locator('#entry-text')).toHaveValue('Fictional context added during recording\n\nFictional garden walk');
  await expect(page.locator('#personal')).toBeDisabled();
  const originalAudio = await page.locator('#draft-player').evaluate(async audio => {
    const bytes = await (await fetch(audio.src)).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].join(',');
  });
  await page.locator('#entry-text').fill('Fictional corrected meeting note with more context');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('corrected meeting');
  const saved = await records(page);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ mode: 'work', text: 'Fictional corrected meeting note with more context',
    originalText: 'Fictional context added during recording\n\nFictional garden walk', audioHash: originalAudio,
    transcription: { status: 'success', rawText: 'Fictional garden walk', provider: 'browser-service' } });
  await page.locator('#personal').click();
  await expect(page.locator('#recent-list')).not.toContainText('corrected meeting');
  await settings(page);
  const downloading = page.waitForEvent('download');
  await page.locator('#export-backup').click();
  const download = await downloading;
  const buffer = await readFile(await download.path());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  await phone.goto('http://localhost:4173/dual-track-life-tracker/');
  await settings(phone);
  await expect(phone.locator('#transcription-mode')).toHaveValue('off');
  await phone.locator('#backup-file').setInputFiles({ name: 'fictional.dtbackup', mimeType: 'application/octet-stream', buffer });
  await expect(phone.locator('#backup-summary')).toContainText('1 original recordings');
  await phone.locator('#confirm-restore').click();
  await expect(phone.locator('#backup-status')).toContainText('Restore complete');
  expect(await records(phone)).toEqual(saved);
  await phone.reload();
  await phone.locator('#work').click();
  await phone.getByRole('link', { name: 'History', exact: true }).click();
  await phone.locator('#history-list .entry-card').click();
  await playStoredAudio(phone);
  await context.close();
});

for (const [name, options, status] of [
  ['network failure', { error: 'network' }, 'unsuccessful'],
  ['recognition permission denial', { error: 'not-allowed' }, 'unsuccessful'],
  ['synchronous recognition failure', { throwOnStart: true }, 'unsuccessful'],
  ['no speech', { empty: true }, 'unsuccessful'],
  ['early end after silence', { early: true }, 'Partial transcription'],
  ['unsupported browser with previously enabled preference', { unsupported: true }, 'unavailable']
]) test(`${name} retains audio and allows manual correction`, async ({ page }) => {
  await simulateSpeech(page, { ...options, preference: consent });
  await page.goto('./');
  await record(page);
  if (options.error) expect(await page.evaluate(() => speechSpy.aborts)).toBeGreaterThan(0);
  await review(page);
  await expect(page.locator('#transcription-status')).toContainText(status);
  expect(await records(page)).toHaveLength(0);
  await page.locator('#entry-text').fill('Fictional manually corrected note');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('manually corrected');
  expect((await records(page))[0].audioSize).toBeGreaterThan(0);
});

test('local-only checks language packs, requires local processing, and never falls back remotely', async ({ page }) => {
  await simulateSpeech(page, { availability: 'downloadable' });
  await page.goto('./');
  await settings(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#enable-local').click();
  await expect(page.locator('#transcription-mode')).toHaveValue('local');
  expect(await page.evaluate(() => speechSpy.installs)).toBe(1);
  expect(await page.evaluate(() => speechSpy.checks.every(options => options.processLocally === true))).toBe(true);
  await record(page);
  await review(page);
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([{ local: true, language: 'en-US', continuous: true }]);
  await expect(page.locator('#transcription-status')).toContainText('successful');
});

test('failed local pack check revokes a previous online choice; recording does not silently use it', async ({ page }) => {
  await simulateSpeech(page, { availability: 'unavailable', preference: consent });
  await page.goto('./');
  await settings(page);
  await page.locator('#enable-local').click();
  await expect(page.locator('#transcription-settings-status')).toContainText('No usable on-device');
  await expect(page.locator('#transcription-mode')).toHaveValue('off');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([]);
});

for (const [name, options] of [
  ['blocked browser policy', { checkFails: true }],
  ['failed language-pack download', { availability: 'downloadable', installFails: true }]
]) test(`${name} cannot enable recognition or a remote fallback`, async ({ page }) => {
  await simulateSpeech(page, options);
  await page.goto('./');
  await settings(page);
  if (options.installFails) page.once('dialog', dialog => dialog.accept());
  await page.locator('#enable-local').click();
  await expect(page.locator('#transcription-mode')).toHaveValue('off');
  await expect(page.locator('#enable-local')).toBeEnabled();
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([]);
});

test('a failed save preserves reviewed text, original transcript, and the recording for retry', async ({ page }) => {
  await simulateSpeech(page, { preference: consent });
  await page.goto('./');
  await record(page);
  await review(page);
  const source = await page.locator('#draft-player').getAttribute('src');
  await page.locator('#entry-text').fill('Fictional corrected retry note');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      IDBObjectStore.prototype.put = put;
      throw new DOMException('Simulated full device', 'QuotaExceededError');
    };
  });
  await page.locator('#save-entry').click();
  await expect(page.locator('#message')).toContainText('storage is full');
  expect(await page.locator('#draft-player').getAttribute('src')).toBe(source);
  await expect(page.locator('#entry-text')).toHaveValue('Fictional corrected retry note');
  expect(await records(page)).toHaveLength(0);
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('corrected retry');
  expect((await records(page))[0]).toMatchObject({ text: 'Fictional corrected retry note',
    originalText: 'Fictional garden walk', transcription: { rawText: 'Fictional garden walk' } });
});

test('local-only failure retains review audio and does not start browser-service recognition', async ({ page }) => {
  await simulateSpeech(page, { error: 'language-not-supported', preference: { version: 1, mode: 'local' } });
  await page.goto('./');
  await record(page);
  await review(page);
  await expect(page.locator('#transcription-status')).toContainText('language pack');
  expect(await page.evaluate(() => speechSpy.starts.map(start => start.local))).toEqual([true]);
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
});

test('stalled recognition can be stopped without losing audio; canceled recordings never save or apply late text', async ({ page }) => {
  await simulateSpeech(page, { stalled: true, preference: consent });
  await page.goto('./');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#finish-without-transcript')).toBeVisible();
  await page.locator('#finish-without-transcript').click();
  await expect(page.locator('#save-entry')).toBeEnabled();
  await expect(page.locator('#transcription-status')).toContainText('stopped by you');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('Fictional gar');
  const saved = await records(page);
  await record(page);
  await page.locator('#cancel-recording').click();
  await expect(page.locator('#message')).toContainText('canceled');
  await page.evaluate(() => activeSpeech.onresult?.({ resultIndex: 0, results: [[{ transcript: 'Late fictional text' }]] }));
  await expect(page.locator('#entry-text')).toHaveValue('');
  expect(await records(page)).toEqual(saved);
});

test('recognition timeout releases review controls without losing audio', async ({ page }) => {
  await simulateSpeech(page, { stalled: true, preference: consent });
  await page.goto('./');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#save-entry')).toBeEnabled({ timeout: 12000 });
  await expect(page.locator('#transcription-status')).toContainText('timed out');
  await expect(page.locator('#audio-draft')).toBeVisible();
});

test('removed interim hypotheses do not become saved transcript text', async ({ page }) => {
  await simulateSpeech(page, { removeInterim: true, preference: consent });
  await page.goto('./');
  await record(page);
  await review(page);
  await expect(page.locator('#entry-text')).toHaveValue('');
  await expect(page.locator('#transcription-status')).toContainText('No speech was recognized');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  expect((await records(page))[0].transcription.rawText).toBe('');
});

test('very long recognition text is bounded and labeled partial while full audio is retained', async ({ page }) => {
  await simulateSpeech(page, { text: 'Fictional ' + 'a'.repeat(50001), preference: consent });
  await page.goto('./');
  await record(page);
  await review(page);
  await expect(page.locator('#transcription-status')).toContainText('50,000-character limit');
  expect((await page.locator('#entry-text').inputValue()).length).toBe(50000);
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('Fictional');
  const saved = (await records(page))[0];
  expect(saved.transcription.rawText.length).toBe(50000);
  expect(saved.transcription.status).toBe('partial');
  expect(saved.audioSize).toBeGreaterThan(0);
});

test('offline browser-service mode never starts recognition; local mode can use its installed provider offline', async ({ page, context }) => {
  await simulateSpeech(page, { preference: consent });
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await record(page);
  await review(page);
  await expect(page.locator('#transcription-status')).toContainText('offline');
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([]);
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('Voice recording');
  await settings(page);
  await page.locator('#enable-local').click();
  await expect(page.locator('#transcription-mode')).toHaveValue('local');
  await record(page);
  await review(page);
  await expect(page.locator('#transcription-status')).toContainText('successful');
  expect(await page.evaluate(() => speechSpy.starts.every(start => start.local))).toBe(true);
});
