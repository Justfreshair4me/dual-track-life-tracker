// Test the exact already-running server, not Playwright's test server.
// Each viewport gets a fresh isolated browser profile; no user data is touched.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173/dual-track-life-tracker/';
const output = process.env.PREVIEW_REPORT_DIR || 'test-results/running-preview';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = {
  scope: 'Isolated Chromium profiles against the running server. Does not inspect the Codex Index panel or the user browser.',
  url: base,
  checkedAt: new Date().toISOString(),
  checks: []
};
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    let page = await context.newPage();
    const errors = [];
    const resources = [];
    const observe = p => {
      p.on('pageerror', error => errors.push(error.message));
      p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      p.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
      p.on('response', response => {
        if (/\.(css|js)(\?|$)/.test(response.url())) resources.push({
          url: response.url(), status: response.status(), type: response.headers()['content-type']
        });
      });
    };
    observe(page);
    await page.goto(base);
    await expect(page.locator('html')).toHaveAttribute('data-app-status', 'ready');
    await expect(page.locator('#app-startup')).toBeHidden();
    const appearance = await page.evaluate(() => {
      const mic = document.querySelector('#record').getBoundingClientRect();
      const card = document.querySelector('.capture-card').getBoundingClientRect();
      return { stylesheets: document.styleSheets.length,
        font: getComputedStyle(document.body).fontFamily,
        micWidth: mic.width, micCentered: Math.abs((mic.x + mic.width / 2) - (card.x + card.width / 2)) < 1,
        fitsScreen: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(appearance.stylesheets).toBeGreaterThan(0);
    expect(appearance.font).toContain('system-ui');
    expect(appearance.micWidth).toBe(92);
    expect(appearance.micCentered).toBe(true);
    expect(appearance.fitsScreen).toBe(true);
    const personalNote = `Fictional Personal server check at ${width}px`;
    const workNote = `Fictional Work server check at ${width}px`;
    await page.locator('#entry-text').fill(personalNote);
    await page.locator('#save-entry').click();
    await expect(page.locator('#message')).toContainText('Saved to Personal');
    await page.getByRole('link', { name: 'View history →' }).click();
    await expect(page.locator('#history')).toBeVisible();
    await expect(page.locator('#home')).toBeHidden();
    await expect(page.locator('#history-list')).toContainText(personalNote);
    await page.locator('#work').click();
    await expect(page.locator('#history-list')).not.toContainText(personalNote);
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.locator('#entry-text').fill(workNote);
    await page.locator('#save-entry').click();
    await expect(page.locator('#message')).toContainText('Saved to Work');
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page.locator('#history-list')).toContainText(workNote);
    await expect(page.locator('#history-list')).not.toContainText(personalNote);
    await page.reload();
    await expect(page.locator('#history-list')).toContainText(personalNote);
    await expect(page.locator('#history-list')).not.toContainText(workNote);
    await page.close();
    page = await context.newPage();
    observe(page);
    await page.goto(base + '#history');
    await expect(page.locator('#history-list')).toContainText(personalNote);
    await page.locator('#work').click();
    await expect(page.locator('#history-list')).toContainText(workNote);
    await page.locator('#personal').click();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.screenshot({ path: path.join(output, `${width}-light.png`), fullPage: true });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.locator('#theme').selectOption('dark');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(20, 34, 31)');
    await page.screenshot({ path: path.join(output, `${width}-dark.png`), fullPage: true });
    expect(errors).toEqual([]);
    expect(resources.some(resource => resource.type?.includes('text/css') && resource.status === 200)).toBe(true);
    expect(resources.some(resource => resource.type?.includes('javascript') && resource.status === 200)).toBe(true);
    report.checks.push({ width, appearance, resources, consoleOrNetworkErrors: errors,
      saveAndVisibleConfirmation: 'passed', viewHistoryClick: 'passed', modeSeparation: 'passed',
      reloadPersistence: 'passed', closeAndReopenPersistence: 'passed', darkTheme: 'passed' });
    await context.close();
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Running-server verification passed at 390px and 1280px. Console/network report and screenshots: ${output}`);
} finally { await browser.close(); }
