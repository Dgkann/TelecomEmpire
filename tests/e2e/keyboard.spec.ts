import { expect, test } from '@playwright/test';

test('the map skip link reaches every site from the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store.getState().newGame({
      companyName: 'Keyboard Route',
      logo: 'x',
      difficulty: 'standard',
      cityName: 'Marmara',
      seed: 4242,
    });
    store.setState({ game: { ...store.getState().game, speed: 0, tutorialDone: true } });
  });

  // Hidden until it has focus, then large enough to read and press.
  const skip = page.getByRole('button', { name: 'Skip to the site list' });
  expect((await skip.boundingBox())!.width).toBeLessThan(2);
  await skip.focus();
  expect((await skip.boundingBox())!.width).toBeGreaterThan(40);

  await page.keyboard.press('Enter');
  const sites = page.getByRole('region', { name: 'Sites' });
  await expect(sites).toBeFocused();
  await page.keyboard.press('Tab');
  const core = sites.getByRole('button', { name: /^Kadıköy Core, Core, tier 1, \d+ percent load$/ });
  await expect(core).toBeFocused();

  // The site list speaks the same names as the map and returns to the site there.
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__game.getState().screen)).toBe('map');
  const selection = await page.evaluate(() => window.__game.getState().selection);
  expect(selection?.type).toBe('node');
  await expect(page.getByRole('button', { name: /^Kadıköy Core, Core, tier 1, \d+ percent load$/ })).toBeVisible();
});
