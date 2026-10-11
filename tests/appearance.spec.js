import { test, expect } from '@playwright/test';

const sourceURL = 'http://127.0.0.1:4174/preview/dual-track-life-tracker/';

for (const [server, url] of [['production', '/'], ['file-preview', sourceURL]]) {
  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark']) {
      test(`${server}: ${width}px ${theme} loads real styles and polished controls`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const pageErrors = [];
        const failedStyles = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('requestfailed', request => { if (request.url().includes('.css')) failedStyles.push(request.url()); });
        await page.goto(url);
        await expect(page.locator('#recent-list')).toContainText('story starts here');
        await page.goto(url + '#settings');
        await page.locator('#theme').selectOption(theme);
        await page.goto(url + '#home');
        const styles = await page.evaluate(() => {
          const mic = document.querySelector('#record');
          const rect = mic.getBoundingClientRect();
          const card = document.querySelector('.capture-card').getBoundingClientRect();
          const css = selector => getComputedStyle(document.querySelector(selector));
          return {
            sheets: document.styleSheets.length,
            font: css('body').fontFamily,
            background: css('body').backgroundColor,
            micWidth: rect.width,
            micHeight: rect.height,
            micRadius: css('#record').borderRadius,
            centered: Math.abs((rect.x + rect.width / 2) - (card.x + card.width / 2)) < 1,
            cardRadius: css('.capture-card').borderRadius,
            cardPadding: parseFloat(css('.capture-card').paddingTop),
            selectedColor: css('#personal').backgroundColor,
            otherColor: css('#work').backgroundColor,
            navPosition: css('.navigation').position,
            navDisplay: css('.navigation').display,
            textSize: css('#entry-text').fontSize,
            overflow: document.documentElement.scrollWidth > innerWidth
          };
        });
        expect(styles.sheets).toBeGreaterThan(0);
        expect(styles.font).toContain('system-ui');
        expect(styles.background).toBe(theme === 'light' ? 'rgb(245, 246, 242)' : 'rgb(20, 34, 31)');
        expect(styles.micWidth).toBe(92);
        expect(styles.micHeight).toBe(92);
        expect(styles.micRadius).toBe('50%');
        expect(styles.centered).toBe(true);
        expect(styles.cardRadius).toBe('22px');
        expect(styles.cardPadding).toBeGreaterThanOrEqual(18);
        expect(styles.selectedColor).not.toBe(styles.otherColor);
        expect(styles.navPosition).toBe('fixed');
        expect(styles.navDisplay).toBe('flex');
        expect(styles.textSize).toBe('16px');
        expect(styles.overflow).toBe(false);
        await page.screenshot({ path: testInfo.outputPath('appearance.png'), fullPage: true });
        await page.locator('#work').click();
        await expect(page.locator('#work')).toHaveAttribute('aria-pressed', 'true');
        const workColor = await page.locator('#work').evaluate(node => getComputedStyle(node).backgroundColor);
        expect(workColor).toBe(theme === 'light' ? 'rgb(51, 79, 121)' : 'rgb(174, 197, 238)');
        expect(pageErrors).toEqual([]);
        expect(failedStyles).toEqual([]);
      });
    }
  }
}

test('file preview runs note saving, mode separation, and editing without a bundler', async ({ page }) => {
  await page.goto(sourceURL);
  await page.locator('#entry-text').fill('Fictional styled preview memory');
  await page.locator('#save-entry').click();
  await expect(page.locator('#recent-list')).toContainText('styled preview memory');
  await page.reload();
  await expect(page.locator('#recent-list')).toContainText('styled preview memory');
  await page.locator('#work').click();
  await expect(page.locator('#recent-list')).not.toContainText('styled preview memory');
  await page.locator('#personal').click();
  await page.locator('#recent-list .entry-card').click();
  await page.locator('#edit-text').fill('Fictional edited preview memory');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('#recent-list')).toContainText('edited preview memory');
});
