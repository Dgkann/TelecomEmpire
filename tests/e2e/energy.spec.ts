import { expect, test } from '@playwright/test';

test('energy desk reaches every site and previews a tariff without spending cash', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commission new network' }).click();
  await page.getByPlaceholder('Company name').fill('Energy Test');
  await page.getByRole('button', { name: 'Start building' }).click();
  const initial = await page.evaluate(() => {
    const store = (window as any).__game;
    const g = store.getState().game;
    const template = g.nodes.find((n: any) => n.kind === 'pop');
    store.setState({
      game: {
        ...g,
        speed: 0,
        tutorialDone: true,
        money: 40000000,
        researchDone: [...g.researchDone, 'onsite_solar'],
        nodes: [
          ...g.nodes,
          ...Array.from({ length: 7 }, (_, i) => ({ ...template, id: `extra-${i}`, name: `Extra site ${i}` })),
        ],
      },
    });
    return store.getState().game.money;
  });
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByRole('tab', { name: /Edge & transit/ }).click();
  const desk = page.getByRole('region', { name: 'Energy desk', exact: true });
  await expect(desk.getByText(/One-time exit fee/)).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(initial);
  await desk.getByRole('button', { name: /Show all sites/ }).click();
  await expect(desk.getByRole('button', { name: 'Install generation: Extra site 6', exact: true })).toBeVisible();
  await desk.getByRole('searchbox', { name: 'Search sites' }).fill('Extra site 6');
  await desk.getByRole('button', { name: 'Install generation: Extra site 6', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__game.getState().game.energy.solarNodeIds)).toContain('extra-6');
  await desk.getByRole('searchbox').fill('missing-site');
  await expect(desk.getByText('No matching sites. Try another name.')).toBeVisible();
  await page.evaluate(() => (window as any).__game.getState().setLocale('tr'));
  await expect(page.getByRole('tab', { name: /Enerji ve bağlantı/ })).toBeVisible();
  await expect(desk).toHaveCount(0);
  const turkishDesk = page.getByRole('region', { name: 'Enerji masası', exact: true });
  await turkishDesk.getByRole('searchbox', { name: 'Saha ara' }).fill('');
  await expect(turkishDesk).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('energy-desk.png') });
});
