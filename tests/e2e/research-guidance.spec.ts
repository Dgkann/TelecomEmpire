import { expect, test } from '@playwright/test';

test('research roadmap explains both shortfalls, starts once and survives saving', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store
      .getState()
      .newGame({ companyName: 'Research route', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 12345 });
    const game = store.getState().game;
    store.setState({ game: { ...game, speed: 0, tutorialDone: true, money: 400000, researchPoints: 10 } });
    store.getState().setLocale('tr');
    store.getState().setScreen('research');
  });
  const roadmap = page.getByRole('region', { name: 'Araştırma yol haritası' });
  await expect(roadmap.getByRole('heading')).toHaveText('Sonraki araştırma: Eve kadar fiber');
  await expect(roadmap).toContainText('Eve kadar fiber → 10G fiber → 4G LTE');
  await expect(roadmap).toContainText('200.000 ₺ eksik nakit');
  await expect(roadmap).toContainText('2 araştırma puanı da gerekiyor');
  const start = roadmap.getByRole('button', { name: 'Önerilen araştırmayı başlat' });
  await expect(start).toBeDisabled();
  expect(await roadmap.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('research-roadmap-tr.png') });
  await page.evaluate(() => {
    const store = window.__game;
    store.setState({ game: { ...store.getState().game, money: 1000000, researchPoints: 20 } });
  });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(roadmap.getByRole('heading')).toHaveText('Sonraki araştırma: 10G fiber');
  await expect(start).toBeDisabled();
  const persisted = await page.evaluate(() => {
    const store = window.__game;
    if (!store.getState().save()) throw new Error('Save failed');
    store.getState().continueGame();
    const game = store.getState().game;
    return { money: game.money, points: game.researchPoints, active: game.researchActive };
  });
  // Eight spare points pay 9,600 of the 600,000 bill and are spent with the requirement.
  expect(persisted).toEqual({ money: 409600, points: 0, active: { id: 'ftth', daysLeft: 12 } });
  await page.evaluate(() => {
    const store = window.__game;
    store.getState().setLocale('en');
    store.getState().setScreen('research');
  });
  await expect(page.getByRole('region', { name: 'Research roadmap' })).toContainText('Next research: 10G Fibre');
});

test('4G guidance charges the revised budget once and restores the active research', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store
      .getState()
      .newGame({ companyName: 'Mobile launch', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 4242 });
    store.setState({
      game: {
        ...store.getState().game,
        speed: 0,
        tutorialDone: true,
        researchDone: ['ftth', 'fiber10g'],
        money: 3900000,
        researchPoints: 60,
      },
    });
    store.getState().setLocale('tr');
    store.getState().setScreen('research');
  });
  const roadmap = page.getByRole('region', { name: 'Araştırma yol haritası' });
  await expect(roadmap.getByRole('heading')).toHaveText('Sonraki araştırma: 4G LTE');
  await expect(roadmap).toContainText('Hedefe kadar kalan araştırma bedeli: 3.794.000 ₺');
  await expect(roadmap).toContainText('5 fazla araştırma puanı bedeli 6.000 ₺ düşürüyor.');
  await roadmap.getByRole('button', { name: 'Önerilen araştırmayı başlat' }).click();
  await expect(roadmap).toContainText('Hedef araştırması sürüyor');
  await expect(roadmap).toContainText('Hedefe kadar kalan araştırma bedeli: 0 ₺');
  const result = await page.evaluate(() => {
    const store = window.__game;
    store.getState().startResearch('mobile_4g');
    if (!store.getState().save() || !store.getState().continueGame()) throw new Error('Save roundtrip failed');
    const game = store.getState().game;
    return { money: game.money, points: game.researchPoints, active: game.researchActive };
  });
  expect(result).toEqual({ money: 106000, points: 0, active: { id: 'mobile_4g', daysLeft: 30 } });
});
