import { expect, test } from '@playwright/test';

test('edge research can precede construction and respects cash, points and laboratory availability', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const originalNodes = await page.evaluate(() => {
    const store = (window as any).__game;
    store
      .getState()
      .newGame({ companyName: 'Research first', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 811 });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        money: 6300000,
        researchPoints: 60,
        researchDone: ['ftth', 'fiber10g', 'backbone100g'],
        speed: 0,
        tutorialDone: true,
      },
    });
    store.getState().setLocale('tr');
    store.getState().setScreen('research');
    return game.nodes;
  });
  const option = page.getByRole('region', { name: 'Önce araştırma seçeneği' });
  const start = option.getByRole('button', { name: 'Önce Edge araştırmasını başlat' });
  await expect(option).toContainText('6.400.000 ₺ · 60 araştırma puanı · 28 oyun günü');
  await expect(start).toBeDisabled();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, money: 8000000, researchPoints: 59 } });
  });
  await expect(start).toBeDisabled();
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({
      game: { ...store.getState().game, researchPoints: 60, researchActive: { id: 'mobile_4g', daysLeft: 4 } },
    });
  });
  await expect(start).toBeDisabled();
  await expect(option).toContainText('Önce süren araştırmanın tamamlanmasını bekle.');
  await page.evaluate(() => {
    const store = (window as any).__game;
    store.setState({ game: { ...store.getState().game, researchActive: null } });
  });
  await expect(start).toBeEnabled();
  expect(await option.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await option.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('research-first-tr.png') });
  await start.click();
  expect(
    await page.evaluate(() => {
      const game = (window as any).__game.getState().game;
      return { money: game.money, points: game.researchPoints, active: game.researchActive, nodes: game.nodes };
    }),
  ).toEqual({ money: 1600000, points: 0, active: { id: 'edge_compute', daysLeft: 28 }, nodes: originalNodes });
  await expect(option.getByRole('button', { name: 'Edge araştırması sürüyor' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Veri merkezi yerini seç' })).toBeEnabled();
  await page.evaluate(() => (window as any).__game.getState().setLocale('en'));
  await expect(page.getByRole('region', { name: 'Research first option' })).toContainText('Edge research in progress');
});
