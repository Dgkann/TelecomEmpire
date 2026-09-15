import { expect, test } from '@playwright/test';

test('site finances explain payback and stop quoting income when fibre is cut', async ({ page }, testInfo) => {
  await page.goto('/');
  const original = await page.evaluate(() => {
    const store = (window as any).__game;
    store
      .getState()
      .newGame({ companyName: 'Hosting accounts', logo: 'x', difficulty: 'standard', cityName: 'Marmara', seed: 811 });
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        money: 8000000,
        speed: 0,
        tutorialDone: true,
        researchDone: ['ftth', 'fiber10g', 'backbone100g', 'edge_compute'],
      },
    });
    store.getState().setLocale('tr');
    store.getState().setAutoConnect(true);
    const cell = game.districts
      .find((d: any) => d.unlocked)
      .cells.find((c: any) => !game.nodes.some((n: any) => n.gx === c.gx && n.gy === c.gy));
    store.getState().placeNode('datacenter', cell.gx, cell.gy);
    const node = store.getState().game.nodes.find((n: any) => n.kind === 'datacenter');
    if (!node) throw new Error('No data centre built');
    store.getState().cancelBuild();
    store.getState().select({ type: 'node', id: node.id });
    return { id: node.id, money: store.getState().game.money };
  });
  const panel = page.getByRole('region', { name: 'Veri merkezi finansmanı' });
  await expect(panel).toContainText('Barındırma geliri');
  await panel.getByText('Genişletme hesabı', { exact: true }).click();
  await expect(panel).toContainText('3.200.000 ₺');
  await expect(panel).toContainText('oyun ayı');
  await expect(panel).not.toContainText('Bu koşullarda geri ödeme beklenmiyor.');
  expect(await page.evaluate(() => (window as any).__game.getState().game.money)).toBe(original.money);
  await page.evaluate((id) => {
    const store = (window as any).__game;
    const g = store.getState().game;
    store.setState({ game: { ...g, links: g.links.filter((l: any) => l.aId !== id && l.bId !== id) } });
  }, original.id);
  await expect(panel).toContainText('Gelir durdu; giderler sürüyor.');
  await expect(panel).toContainText('Bu koşullarda geri ödeme beklenmiyor.');
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('data-centre-finances-tr.png') });
  await page.evaluate(() => (window as any).__game.getState().setLocale('en'));
  await expect(page.getByRole('region', { name: 'Data centre finances' })).toContainText(
    'Income has stopped; costs continue.',
  );
});
