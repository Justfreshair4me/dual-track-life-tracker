import { test, expect } from '@playwright/test';
import { simulateSpeech } from './speech-provider.js';
import { playStoredAudio } from './audio-helpers.js';

const preference = { version: 1, mode: 'online', onlineConsent: true };
async function record(page) {
  await page.locator('#record').click();
  // The timer retains its previous value while the next async microphone
  // request is pending. Wait for this recording's controls before timing it.
  await expect(page.locator('#record-controls')).toBeVisible();
  await expect(page.locator('#timer')).not.toHaveText('00:00');
}
async function stop(page) {
  await page.locator('#stop-recording').click();
  await expect(page.locator('#save-entry')).toBeEnabled();
}
async function diagnostics(page) { return JSON.parse(await page.locator('#speech-diagnostics-data').textContent()); }
async function audioHash(page) {
  return page.locator('#draft-player').evaluate(async player => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(player.src)).arrayBuffer()))].join(','));
}
test.beforeEach(async ({ context }) => { await context.grantPermissions(['microphone']); });

test('stop requests final speech results before recording tracks are released', async ({ page }) => {
  await simulateSpeech(page, { preference, endOnTrackRelease: true, delay: 500 });
  await page.goto('./');
  await record(page);
  await stop(page);
  await expect(page.locator('#entry-text')).toHaveValue('Fictional garden walk');
  await expect(page.locator('#transcription-status')).toContainText('successful');
  const events = await page.evaluate(() => speechSpy.events);
  expect(events.indexOf('recognition-stop')).toBeLessThan(events.indexOf('recognition-end'));
  expect(events.indexOf('recognition-end')).toBeLessThan(events.indexOf('recording-track-stop'));
  const trace = (await diagnostics(page))[0];
  expect(trace.stopRequested).toBe(true);
  expect(trace.endedEarly).toBe(false);
  expect(trace.recorderActiveAtStart).toBe(true);
  expect(trace.audioStarted).toBe(true);
  expect(await page.evaluate(() => recordingTracks.every(track => track.readyState === 'ended'))).toBe(true);
});

test('Android uses a single utterance, records silent early disconnection without inventing its cause, and never restarts', async ({ page }) => {
  await simulateSpeech(page, { preference, android: true, silentEarly: true });
  await page.goto('./');
  await record(page);
  await stop(page);
  await expect(page.locator('#transcription-status')).toContainText('cause is unknown');
  expect(await page.evaluate(() => speechSpy.starts)).toEqual([{ local: false, language: 'en-US', continuous: false }]);
  const trace = (await diagnostics(page))[0];
  expect(trace).toMatchObject({ android: true, started: false, audioStarted: false, speechDetected: false,
    resultsReceived: false, endedEarly: true, errorCode: null });
  expect(trace.events.filter(event => event.event === 'start-request')).toHaveLength(1);
  await expect(page.locator('#audio-draft')).toBeVisible();
});

test('diagnostics contain only allowlisted metadata; no text, audio, identifiers, or notes are saved in diagnostics', async ({ page }) => {
  await simulateSpeech(page, { preference, text: 'Fictional PRIVATE-SPEECH-MARKER', error: 'unrecognized PRIVATE-ERROR-MARKER' });
  await page.goto('./');
  await page.locator('#entry-text').fill('Fictional PRIVATE-NOTE-MARKER');
  await record(page);
  await stop(page);
  const safe = await page.locator('#speech-diagnostics-data').textContent();
  expect(safe).not.toContain('PRIVATE');
  expect(safe).not.toContain('blob:');
  expect(safe).not.toContain('2026-');
  expect((await diagnostics(page))[0].errorCode).toBe('unknown');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('PRIVATE-NOTE');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.locator('#export-backup').click();
  const file = await downloading;
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(await file.path());
  const manifest = JSON.parse(buffer.subarray(44, 44 + buffer.readUInt32LE(8)).toString());
  expect(JSON.stringify(manifest)).not.toContain('diagnostics');
  expect(JSON.stringify(manifest)).not.toContain('elapsedMs');
});

test('separate note dictation runs with recording tracks stopped, preserves original audio, and appends new speech without replacing text', async ({ page }) => {
  await simulateSpeech(page, { preference, android: true, concurrentFailure: true, text: 'Fictional separately dictated context' });
  await page.goto('./');
  await record(page);
  await stop(page);
  const hash = await audioHash(page);
  await page.locator('#entry-text').fill('Fictional manually corrected note');
  await page.locator('#dictate-separate-note').click();
  await expect(page.locator('#transcription-status')).toContainText('Separate note dictation complete');
  await expect(page.locator('#entry-text')).toHaveValue('Fictional manually corrected note\n\nFictional separately dictated context');
  expect(await audioHash(page)).toBe(hash);
  expect((await diagnostics(page))[1]).toMatchObject({ purpose: 'separate-note', recorderActiveAtStart: false, endedEarly: false });
  await expect(page.locator('#dictate-separate-note')).toBeDisabled();
  expect(await page.evaluate(() => speechSpy.starts)).toHaveLength(2);
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('separately dictated');
  await page.locator('#recent-list .entry-card').click();
  await playStoredAudio(page);
});

test('failed separate dictation keeps existing text and audio; explicit Finish can stop a pending attempt', async ({ page }) => {
  await simulateSpeech(page, { preference, empty: true });
  await page.goto('./');
  await record(page);
  await stop(page);
  const hash = await audioHash(page);
  await page.locator('#entry-text').fill('Fictional note must remain');
  await page.locator('#dictate-separate-note').click();
  await expect(page.locator('#finish-separate-note')).toBeVisible();
  await page.locator('#finish-separate-note').click();
  await expect(page.locator('#save-entry')).toBeEnabled();
  await expect(page.locator('#entry-text')).toHaveValue('Fictional note must remain');
  expect(await audioHash(page)).toBe(hash);
  await expect(page.locator('#transcription-status')).toContainText('Separate note dictation unsuccessful');
});

test('cancellation and recognition timeouts release recording tracks', async ({ page }) => {
  await simulateSpeech(page, { preference, stalled: true });
  await page.goto('./');
  await record(page);
  await page.locator('#cancel-recording').click();
  await expect(page.locator('#message')).toContainText('canceled');
  expect(await page.evaluate(() => recordingTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#save-entry')).toBeEnabled({ timeout: 12000 });
  expect(await page.evaluate(() => recordingTracks.every(track => track.readyState === 'ended'))).toBe(true);
  expect((await diagnostics(page))[0].events.some(event => event.event === 'finish-timeout')).toBe(true);
});

test('separate dictation has a finite listening timeout and does not restart', async ({ page }) => {
  await simulateSpeech(page, { preference, stalled: true });
  await page.goto('./');
  await record(page);
  await page.locator('#stop-recording').click();
  await expect(page.locator('#finish-without-transcript')).toBeVisible();
  await expect(page.locator('#draft-player')).toHaveJSProperty('controls', false);
  await page.locator('#finish-without-transcript').click();
  await expect(page.locator('#save-entry')).toBeEnabled();
  await expect(page.locator('#draft-player')).toHaveJSProperty('controls', true);
  const hash = await audioHash(page);
  await page.clock.install();
  await page.locator('#dictate-separate-note').click();
  await expect(page.locator('#draft-player')).toHaveJSProperty('controls', false);
  await page.clock.runFor(100);
  await page.clock.fastForward(30001);
  await expect(page.locator('#save-entry')).toBeEnabled();
  await expect(page.locator('#draft-player')).toHaveJSProperty('controls', true);
  await expect(page.locator('#transcription-status')).toContainText('timed out');
  expect(await audioHash(page)).toBe(hash);
  expect((await diagnostics(page))[1].events.some(event => event.event === 'listen-timeout')).toBe(true);
  expect(await page.evaluate(() => speechSpy.starts)).toHaveLength(2);
});
