import { expect } from '@playwright/test';

export async function playStoredAudio(page) {
  const audio = page.locator('#detail-audio');
  // Entry clicks start an async database read. evaluate() does not wait for
  // visibility, so playing immediately can race the later src assignment.
  await expect(page.locator('#entry-dialog')).toBeVisible();
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => audio.evaluate(element =>
    element.currentSrc === element.src && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  )).toBe(true);
  expect(await audio.evaluate(element => element.error?.code ?? null)).toBeNull();
  await audio.evaluate(element => element.play());
  await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(0);
}
