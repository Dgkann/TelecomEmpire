import { expect, test } from '@playwright/test';

test('campaign victory explains retained research and initializes mobile service in the next city', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store.getState().newGame({
      companyName: 'Continued research',
      logo: 'x',
      difficulty: 'standard',
      cityName: 'Marmara',
      mode: 'campaign',
      seed: 12345,
    });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        speed: 0,
        tutorialDone: true,
        victoryAt: game.minutes,
        researchDone: ['ftth', 'fiber10g', 'mobile_4g'],
        researchPoints: 17,
        researchActive: { id: 'backbone100g', daysLeft: 12 },
        spectrum: [{ band: '700', blocks: 3, paid: 2000000, wonAt: game.minutes }],
      },
    });
    store.getState().setLocale('tr');
  });
  const dialog = page.getByRole('dialog', { name: 'Zafer' });
  await expect(dialog).toContainText('Tamamlanan araştırmalar, süren çalışma ve araştırma puanların korunur');
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath('campaign-carryover-tr.png') });
  await dialog.getByRole('button', { name: 'Karadeniz kampanyasına geç' }).click();
  const result = await page.evaluate(() => {
    const store = window.__game;
    if (!store.getState().continueGame()) throw new Error('City save failed');
    const game = store.getState().game;
    return {
      city: game.cityName,
      done: game.researchDone,
      points: game.researchPoints,
      active: game.researchActive,
      spectrum: game.spectrum,
      auctionInDays: (game.nextAuctionAt - game.minutes) / 1440,
    };
  });
  expect(result).toEqual({
    city: 'Karadeniz',
    done: ['ftth', 'fiber10g', 'mobile_4g'],
    points: 17,
    active: { id: 'backbone100g', daysLeft: 12 },
    spectrum: [{ band: '1800', blocks: 1, paid: 0, wonAt: 480 }],
    auctionInDays: 12,
  });
});

test('reputation points to the actual obligation and completed edge research points to construction', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store
      .getState()
      .newGame({ companyName: 'Actionable progress', logo: 'x', difficulty: 'standard', cityName: 'Ege', seed: 7311 });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        speed: 0,
        tutorialDone: true,
        reputation: 58,
        researchDone: ['ftth', 'fiber10g', 'mobile_4g', 'backbone100g', 'edge_compute'],
        regulations: [
          {
            id: 'price-review',
            kind: 'price_cap',
            title: 'Price review',
            detail: 'Review pricing',
            districtId: null,
            target: 0.8,
            dueAt: game.minutes + 1440 * 5,
            fine: 600000,
            status: 'pending',
          },
        ],
      },
    });
    store.getState().setLocale('tr');
    store.getState().setScreen('company');
  });
  const reputation = page.getByRole('region', { name: 'İtibarın nedenleri' });
  await expect(reputation).toContainText('5 gün kaldı');
  await expect(reputation).toContainText('600.000 ₺');
  await expect(reputation).toContainText('−8 itibar riski');
  expect(await reputation.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await reputation.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('reputation-tr.png') });
  await reputation.getByRole('button', { name: 'Paket fiyatlarını aç' }).click();
  await expect(page.locator('#pricing')).toBeInViewport();
  await page.evaluate(() => window.__game.getState().setScreen('research'));
  const construction = page.getByRole('region', { name: 'Veri merkezi kurulumu' });
  await expect(construction).toContainText('1.200.000 ₺');
  await construction.getByRole('button', { name: 'Veri merkezi yerini seç' }).click();
  expect(
    await page.evaluate(() => {
      const s = window.__game.getState();
      return { tool: s.tool, screen: s.screen, autoConnect: s.autoConnect };
    }),
  ).toEqual({ tool: 'datacenter', screen: 'map', autoConnect: true });
});
