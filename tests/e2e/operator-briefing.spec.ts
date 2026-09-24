import { expect, test } from '@playwright/test';

test('campaign pace becomes one actionable operator briefing', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    const store = window.__game;
    store.getState().newGame({
      companyName: 'Pace Review',
      logo: 'x',
      difficulty: 'standard',
      cityName: 'Marmara',
      scenarioId: 'rapid_expansion',
      seed: 17003,
    });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        speed: 0,
        tutorialDone: true,
        minutes: 100 * 1440,
        competitors: [],
        incidents: [],
        campaigns: [],
        contracts: [],
        maintenanceOrders: [],
        nodes: game.nodes.map((node) => ({ ...node, trafficGbps: 0 })),
        links: game.links.map((link) => ({ ...link, trafficGbps: 0 })),
        districts: game.districts.map((district, index) => ({
          ...district,
          unlocked: index === 0,
          mobileSubs: 0,
        })),
      },
    });
  });

  if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: /Actions/ }).click();

  const english = page.getByRole('region', { name: 'Operations briefing' });
  await expect(english).toBeVisible();
  await expect(english).toContainText('Next priority');
  await expect(english).toContainText('1,500 customers: 200 / 1,500');
  await expect(english.getByRole('button', { name: 'Work on objective' })).toBeVisible();

  await page.evaluate(() => window.__game.getState().setLocale('tr'));
  const briefing = page.getByRole('region', { name: 'Operasyon brifingi' });
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText('Sıradaki öncelik');
  await expect(briefing).toContainText('1.500 müşteri: 200 / 1.500');
  await expect(briefing).not.toContainText('1,500');
  await briefing.screenshot({ path: testInfo.outputPath('operator-briefing.png') });
  await briefing.getByRole('button', { name: 'Hedef üzerinde çalış' }).click();
  await expect.poll(() => page.evaluate(() => window.__game.getState().screen)).toBe('company');
});

test('a lagging reputation shows where it settles and what holds it back', async ({ page }, testInfo) => {
  await page.goto('/');
  // Karadeniz, 90 days before the deadline, with everything but reputation and prices well above the market.
  await page.evaluate(() => {
    const store = window.__game;
    store.getState().newGame({
      companyName: 'Reputation Review',
      logo: 'x',
      difficulty: 'standard',
      cityName: 'Karadeniz',
      scenarioId: 'service_standard',
      seed: 4242,
    });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        speed: 0,
        tutorialDone: true,
        minutes: 450 * 1440,
        reputation: 60,
        researchDone: [...game.researchDone, 'mobile_4g'],
        stats: { ...game.stats, health: 93 },
        packages: game.packages.map((p) =>
          p.segment === 'residential' ? { ...p, price: Math.round(p.price * 1.1) } : p,
        ),
        districts: game.districts.map((district, index) => ({
          ...district,
          unlocked: index < 4,
          mobileSubs: 2000,
          loadPenalty: 0,
        })),
      },
    });
  });

  if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: /Actions/ }).click();
  const objective = page.getByRole('button', { name: /75 reputation: 60 \/ 75/ });
  await expect(objective).toContainText(
    /Reputation heads toward about 7\d; the biggest drag is prices above the market/,
  );
  await objective.click();
  await expect.poll(() => page.evaluate(() => window.__game.getState().screen)).toBe('company');

  const panel = page.getByRole('region', { name: 'Reputation explained' });
  await expect(panel).toContainText(/Service standard needs 75 reputation: at this level it falls about \d+ short/);
  await expect(panel.getByRole('list', { name: 'What moves reputation' })).toContainText(
    'Price index 1.30 (the market is 1.00)',
  );
  await expect(panel.getByRole('button', { name: 'Open pricing' })).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: testInfo.outputPath('reputation-drivers.png') });
});
